import assert from "node:assert/strict";
import test from "node:test";
import {
  constantTimeHexEqual,
  constantTimeSecretEqual,
  generateAdminRecoveryCodes,
  generateEmailLoginCode,
  hashAdminRecoveryCode,
  hashEmailLoginCode,
  normalizeLoginEmail,
} from "../src/lib/auth/credentials.ts";
import { decideAdminMfa, evaluateEmailChallenge } from "../src/lib/auth/policy.ts";
import { isSameOriginAuthRequest, readSmallJson, authJson } from "../src/lib/auth/http.ts";
import { checkEmailSignInVerificationRateLimit } from "../src/lib/rate-limit.ts";

test("normalizes email addresses and rejects malformed or oversized values", () => {
  assert.equal(normalizeLoginEmail("  User@Example.COM  "), "user@example.com");
  assert.equal(normalizeLoginEmail("ｕｓｅｒ＠ｅｘａｍｐｌｅ．ｃｏｍ"), "user@example.com");
  assert.equal(normalizeLoginEmail("not-an-email"), null);
  assert.equal(normalizeLoginEmail("user@example.\ncom"), null);
  assert.equal(normalizeLoginEmail("user@example..com"), null);
  assert.equal(normalizeLoginEmail("user..name@example.com"), null);
  assert.equal(normalizeLoginEmail(`x${"a".repeat(320)}@example.com`), null);
});

test("creates six-digit codes and email-scoped HMAC values", () => {
  const secret = "test-only-auth-secret-with-more-than-32-bytes";
  const email = "user@example.com";
  const code = generateEmailLoginCode();
  const hash = hashEmailLoginCode(email, code, secret);

  assert.match(code, /^\d{6}$/);
  assert.match(hash, /^[a-f0-9]{64}$/);
  assert.equal(constantTimeHexEqual(hash, hashEmailLoginCode(email, code, secret)), true);
  assert.equal(constantTimeHexEqual(hash, hashEmailLoginCode("other@example.com", code, secret)), false);
  assert.equal(constantTimeHexEqual(hash, "invalid"), false);
});

test("creates one-time recovery codes and binds their hashes to the administrator", () => {
  const codes = generateAdminRecoveryCodes(10);
  assert.equal(new Set(codes).size, 10);
  for (const code of codes) assert.match(code, /^[A-F0-9]{4}(?:-[A-F0-9]{4}){4}$/);

  const code = codes[0];
  const hash = hashAdminRecoveryCode("admin-1", code, "test-only-auth-secret-with-more-than-32-bytes");
  assert.equal(hashAdminRecoveryCode("admin-1", code.replaceAll("-", ""), "test-only-auth-secret-with-more-than-32-bytes"), hash);
  assert.notEqual(hashAdminRecoveryCode("admin-2", code, "test-only-auth-secret-with-more-than-32-bytes"), hash);
  assert.throws(() => hashAdminRecoveryCode("admin-1", "bad", "test-only-auth-secret-with-more-than-32-bytes"));
});

test("compares enrollment secrets without a length-based timing branch", () => {
  assert.equal(constantTimeSecretEqual("long-enough-bootstrap-secret", "long-enough-bootstrap-secret"), true);
  assert.equal(constantTimeSecretEqual("long-enough-bootstrap-secret", "different-bootstrap-secret"), false);
});

test("enforces email challenge expiry, attempt cap, mismatch, and success states", () => {
  const hash = "a".repeat(64);
  const now = 1_800_000_000_000;
  const base = { attempts: 0, expiresAt: new Date(now + 60_000), storedCodeHash: hash, suppliedCodeHash: hash, now };

  assert.equal(evaluateEmailChallenge({ ...base, expiresAt: new Date(now) }), "expired");
  assert.equal(evaluateEmailChallenge({ ...base, attempts: 5 }), "locked");
  assert.equal(evaluateEmailChallenge({ ...base, suppliedCodeHash: "b".repeat(64) }), "mismatch");
  assert.equal(evaluateEmailChallenge(base), "verified");
});

test("administrator role always requires MFA except for the restricted bootstrap path", () => {
  assert.deepEqual(decideAdminMfa({
    isAdmin: false,
    factorEnabled: false,
    factorVerified: false,
    bootstrapAuthorized: false,
  }), { allowed: true, mfaVerified: false, setupRequired: false });
  assert.deepEqual(decideAdminMfa({
    isAdmin: true,
    factorEnabled: false,
    factorVerified: false,
    bootstrapAuthorized: false,
  }), { allowed: false, mfaVerified: false, setupRequired: false });
  assert.deepEqual(decideAdminMfa({
    isAdmin: true,
    factorEnabled: false,
    factorVerified: false,
    bootstrapAuthorized: true,
  }), { allowed: true, mfaVerified: false, setupRequired: true });
  assert.deepEqual(decideAdminMfa({
    isAdmin: true,
    factorEnabled: true,
    factorVerified: false,
    bootstrapAuthorized: true,
  }), { allowed: false, mfaVerified: false, setupRequired: false });
  assert.deepEqual(decideAdminMfa({
    isAdmin: true,
    factorEnabled: true,
    factorVerified: true,
    bootstrapAuthorized: false,
  }), { allowed: true, mfaVerified: true, setupRequired: false });
});

test("limits email verification attempts to five per 15-minute window", async () => {
  process.env.NODE_ENV = "test";
  process.env.REDIS_URL = "";
  process.env.RATE_LIMIT_SECRET = "test-only-rate-limit-secret-with-more-than-32-bytes";
  const uniqueEmail = `limit-${crypto.randomUUID()}@example.test`;

  for (let attempt = 0; attempt < 5; attempt++) {
    assert.equal((await checkEmailSignInVerificationRateLimit(uniqueEmail)).allowed, true);
  }
  assert.equal((await checkEmailSignInVerificationRateLimit(uniqueEmail)).allowed, false);
});

test("accepts only same-origin auth requests and bounded JSON bodies", async () => {
  const sameOrigin = new Request("https://shop.example/api/auth/request-code", {
    method: "POST",
    headers: { origin: "https://shop.example", "content-type": "application/json" },
    body: JSON.stringify({ email: "user@example.com" }),
  });
  const crossOrigin = new Request("https://shop.example/api/auth/request-code", {
    method: "POST",
    headers: { origin: "https://attacker.example", "content-type": "application/json" },
    body: "{}",
  });
  const noOrigin = new Request("https://shop.example/api/auth/request-code", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
  assert.equal(isSameOriginAuthRequest(sameOrigin), true);
  assert.equal(isSameOriginAuthRequest(crossOrigin), false);
  assert.equal(isSameOriginAuthRequest(noOrigin), false);
  assert.deepEqual(await readSmallJson(sameOrigin), { email: "user@example.com" });

  const oversized = new Request("https://shop.example/api/auth/request-code", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ data: "x".repeat(128) }),
  });
  assert.equal(await readSmallJson(oversized, 32), null);
  assert.equal(authJson({ ok: true }).headers.get("cache-control"), "no-store, max-age=0");
});

