import "server-only";
import {
  areDistinctUrlSafeSecrets,
  hasPlaceholderMarker,
  hasPlaceholderPrefix,
  isUrlSafeSecret,
} from "@/lib/config-secrets";
import { hasUsableRateLimitConfiguration } from "@/lib/rate-limit";

const exampleAuthSecret = "replace_with_a_random_secret_of_at_least_32_bytes";

export function hasUsableAuthSecret(secret = process.env.AUTH_SECRET): boolean {
  return Boolean(
    isUrlSafeSecret(secret, 32, 256) && secret !== exampleAuthSecret,
  );
}

export function hasUsableEmailConfig(
  host = process.env.SMTP_HOST,
  port = process.env.SMTP_PORT,
  user = process.env.SMTP_USER,
  password = process.env.SMTP_PASSWORD,
  secure = process.env.SMTP_SECURE,
  from = process.env.EMAIL_FROM,
): boolean {
  const numericPort = Number(port);
  const address = from ?? "";
  const normalizedAddress = address.toLowerCase();
  const senderDomain = normalizedAddress.slice(normalizedAddress.lastIndexOf("@") + 1);
  const placeholderSender = hasPlaceholderMarker(address);
  const normalizedHost = host?.toLowerCase() ?? "";
  const exampleSenderDomain = senderDomain === "example.com" || senderDomain.endsWith(".example.com") ||
    senderDomain === "example.ir" || senderDomain.endsWith(".example.ir") ||
    senderDomain === "invalid" || senderDomain.endsWith(".invalid");
  return Boolean(
    host && /^[a-zA-Z0-9.-]+$/.test(host) &&
    !normalizedHost.endsWith(".example.ir") && !normalizedHost.endsWith(".example.com") &&
    normalizedHost !== "invalid" && !normalizedHost.endsWith(".invalid") &&
    Number.isSafeInteger(numericPort) && numericPort > 0 && numericPort <= 65_535 &&
    user && !hasPlaceholderPrefix(user) && password && !hasPlaceholderPrefix(password) &&
    (secure === "true" || secure === "false") &&
    /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(address) &&
    !placeholderSender && !exampleSenderDomain,
  );
}

export function hasUsableMfaEncryptionKey(encodedKey = process.env.AUTH_MFA_ENCRYPTION_KEY): boolean {
  if (!isUrlSafeSecret(encodedKey, 43, 43)) return false;
  const key = Buffer.from(encodedKey, "base64url");
  return key.byteLength === 32 && key.toString("base64url") === encodedKey;
}

export function hasUsableAdminEnrollmentSecret(
  secret = process.env.AUTH_ADMIN_MFA_ENROLLMENT_SECRET,
): boolean {
  return Boolean(
    secret && Buffer.byteLength(secret, "utf8") >= 32 &&
    !hasPlaceholderPrefix(secret) &&
    secret !== "replace_with_a_one_time_admin_mfa_enrollment_secret",
  );
}

function hasDistinctProductionSecrets(): boolean {
  if (process.env.NODE_ENV !== "production") return true;
  return areDistinctUrlSafeSecrets([
    process.env.AUTH_SECRET,
    process.env.RATE_LIMIT_SECRET,
    process.env.CRON_SECRET,
  ]);
}

function hasUsableHttpsOrigin(value = process.env.AUTH_URL): boolean {
  const match = /^https:\/\/[A-Za-z0-9][A-Za-z0-9.-]*(?::([0-9]{1,5}))?$/.exec(value ?? "");
  if (!match) return false;
  if (!match[1]) return true;
  const port = Number(match[1]);
  return Number.isSafeInteger(port) && port > 0 && port <= 65_535;
}

/** Login is enabled only when every required server-side control is ready. */
export function isEmailLoginEnabled(): boolean {
  if (
    process.env.AUTH_LOGIN_ENABLED !== "true" ||
    !hasUsableAuthSecret() ||
    !hasUsableEmailConfig() ||
    !hasUsableMfaEncryptionKey() ||
    !hasUsableRateLimitConfiguration() ||
    !hasDistinctProductionSecrets()
  ) return false;

  if (process.env.NODE_ENV === "production") {
    return hasUsableHttpsOrigin();
  }
  return true;
}
