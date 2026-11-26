import "server-only";
import { isUrlSafeSecret } from "@/lib/config-secrets";
import { createHmac } from "node:crypto";
import { isIP } from "node:net";
import { createClient } from "redis";

const incrementScript = [
  "local count = redis.call('INCR', KEYS[1])",
  "local ttl = redis.call('PTTL', KEYS[1])",
  "if count == 1 or ttl < 0 then",
  "  redis.call('PEXPIRE', KEYS[1], ARGV[1])",
  "  ttl = tonumber(ARGV[1])",
  "end",
  "return {count, ttl}",
].join("\n");

type InMemoryEntry = { count: number; expiresAt: number };
const inMemoryWindows = new Map<string, InMemoryEntry>();
const MAX_IN_MEMORY_KEYS = 10_000;

let redisClient: ReturnType<typeof createClient> | undefined;
let redisConnection: Promise<ReturnType<typeof createClient>> | undefined;

function getRateLimitSecret() {
  const production = process.env.NODE_ENV === "production";
  const secret = process.env.RATE_LIMIT_SECRET ?? (production ? undefined : process.env.AUTH_SECRET);
  if (
    !secret || Buffer.byteLength(secret, "utf8") < 32 ||
    (production && (!isUrlSafeSecret(secret) || secret === process.env.AUTH_SECRET))
  ) {
    throw new Error("Rate limiting requires a secret of at least 32 bytes.");
  }
  return secret;
}

export function hasUsableRateLimitConfiguration() {
  try {
    getRateLimitSecret();
  } catch {
    return false;
  }
  return process.env.NODE_ENV !== "production" ||
    (Boolean(process.env.REDIS_URL) && process.env.TRUSTED_PROXY === "nginx");
}

function digest(scope: string, subjectId: string) {
  return createHmac("sha256", getRateLimitSecret())
    .update("janankadeh-rate-limit:v2\0")
    .update(scope)
    .update("\0")
    .update(subjectId)
    .digest("hex");
}

function getClient() {
  const url = process.env.REDIS_URL;
  if (!url) return null;
  if (!url.startsWith("redis://") && !url.startsWith("rediss://")) {
    throw new Error("REDIS_URL must use redis:// or rediss://.");
  }

  if (!redisClient) {
    redisClient = createClient({
      url,
      socket: {
        connectTimeout: 5_000,
        reconnectStrategy: (retries) => Math.min(250 * (retries + 1), 3_000),
      },
    });
    redisClient.on("error", () => {
      console.error("Redis rate-limit connection error.");
    });
  }
  return redisClient;
}

async function incrementRedis(key: string, windowMilliseconds: number) {
  const client = getClient();
  if (!client) return null;

  await connectRedis(client);

  const result: unknown = await client.eval(incrementScript, {
    keys: ["janankadeh:rate:v2:" + key],
    arguments: [String(windowMilliseconds)],
  });
  if (!Array.isArray(result) || result.length !== 2) {
    throw new Error("Redis returned an invalid rate-limit result.");
  }
  const count = Number(result[0]);
  const ttl = Number(result[1]);
  if (!Number.isSafeInteger(count) || !Number.isFinite(ttl) || ttl < 0) {
    throw new Error("Redis returned an invalid rate-limit counter.");
  }
  return { count, ttl };
}

async function connectRedis(client: NonNullable<ReturnType<typeof getClient>>) {
  if (!client.isOpen) {
    redisConnection ??= client.connect().catch((error: unknown) => {
      redisConnection = undefined;
      throw error;
    });
    await redisConnection;
  }
}

/** A non-disclosing probe used by the container readiness endpoint. */
export async function isRateLimitStoreHealthy() {
  try {
    const client = getClient();
    if (!client) return process.env.NODE_ENV !== "production";
    await connectRedis(client);
    return (await client.ping()) === "PONG";
  } catch {
    return false;
  }
}

function incrementInMemory(key: string, windowMilliseconds: number) {
  const now = Date.now();
  if (inMemoryWindows.size >= MAX_IN_MEMORY_KEYS) {
    for (const [storedKey, value] of inMemoryWindows) {
      if (value.expiresAt <= now) inMemoryWindows.delete(storedKey);
    }
    while (inMemoryWindows.size >= MAX_IN_MEMORY_KEYS) {
      const oldestKey = inMemoryWindows.keys().next().value;
      if (oldestKey === undefined) break;
      inMemoryWindows.delete(oldestKey);
    }
  }

  const current = inMemoryWindows.get(key);
  if (!current || current.expiresAt <= now) {
    const entry = { count: 1, expiresAt: now + windowMilliseconds };
    inMemoryWindows.set(key, entry);
    return { count: 1, ttl: windowMilliseconds };
  }
  current.count += 1;
  return { count: current.count, ttl: Math.max(1, current.expiresAt - now) };
}

/**
 * Shared fixed-window limiter. Production requires Redis so limits are shared
 * between app processes; the bounded in-memory backend is for local development.
 */
export async function checkAccountRateLimit(
  scope: string,
  subjectId: string,
  limit: number,
  windowSeconds: number,
): Promise<{ allowed: boolean; retryAfterSeconds: number }> {
  if (!/^[a-z0-9:_-]{1,80}$/i.test(scope)) throw new Error("Invalid rate-limit scope.");
  if (!Number.isSafeInteger(limit) || limit < 1 || !Number.isSafeInteger(windowSeconds) || windowSeconds < 1) {
    throw new Error("Invalid rate-limit policy.");
  }
  if (process.env.NODE_ENV === "production" && !process.env.REDIS_URL) {
    throw new Error("REDIS_URL is required for production rate limiting.");
  }

  const key = digest(scope, subjectId);
  const windowMilliseconds = windowSeconds * 1_000;
  const result = (await incrementRedis(key, windowMilliseconds)) ?? incrementInMemory(key, windowMilliseconds);
  return {
    allowed: result.count <= limit,
    retryAfterSeconds: Math.max(1, Math.ceil(result.ttl / 1_000)),
  };
}

/**
 * Production IP limits trust only X-Real-IP set by the configured Nginx proxy.
 * Never trust X-Forwarded-For supplied by an arbitrary client.
 */
export async function checkRequestIpRateLimit(
  request: Request,
  scope: string,
  limit: number,
  windowSeconds: number,
) {
  let subjectId = "local-development";
  if (process.env.NODE_ENV === "production") {
    if (process.env.TRUSTED_PROXY !== "nginx") {
      throw new Error("Production IP rate limiting requires the trusted Nginx proxy.");
    }
    const remoteAddress = request.headers.get("x-real-ip")?.trim() ?? "";
    if (!isIP(remoteAddress)) throw new Error("The trusted proxy did not provide a valid client IP.");
    subjectId = remoteAddress;
  }
  return checkAccountRateLimit("ip:" + scope, subjectId, limit, windowSeconds);
}

function emailRateLimitSubject(email: string) {
  return createHmac("sha256", getRateLimitSecret())
    .update("janan-kadeh/email-sign-in-rate-limit:v1\0")
    .update(email.normalize("NFKC").trim().toLowerCase())
    .digest("hex");
}

/** Limit code requests by normalized email, including direct calls to the API. */
export async function checkEmailSignInRateLimit(email: string) {
  return checkAccountRateLimit("email-sign-in-form", emailRateLimitSubject(email), 5, 15 * 60);
}

/** Apply a separate per-email quota to successful login-code delivery attempts. */
export async function checkEmailSignInDeliveryRateLimit(email: string) {
  return checkAccountRateLimit("email-sign-in-delivery", emailRateLimitSubject(email), 5, 15 * 60);
}

/** Limit OTP and second-factor verification attempts for one normalized email. */
export async function checkEmailSignInVerificationRateLimit(email: string) {
  return checkAccountRateLimit("email-sign-in-verify", emailRateLimitSubject(email), 5, 15 * 60);
}
