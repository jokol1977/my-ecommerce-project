import "server-only";
import { createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

const HEX_SHA256 = /^[a-f0-9]{64}$/;

export function normalizeLoginEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.normalize("NFKC").trim().toLowerCase();
  if (
    email.length > 320 ||
    !/^[\x21-\x7e]+$/.test(email)
  ) return null;

  const parts = email.split("@");
  if (parts.length !== 2) return null;
  const [local, domain] = parts;
  if (
    local.length < 1 || local.length > 64 ||
    !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+$/.test(local) ||
    local.startsWith(".") || local.endsWith(".") || local.includes("..") ||
    domain.length > 253 || !domain.includes(".")
  ) return null;

  const labels = domain.split(".");
  if (labels.length < 2 || labels.some((label) =>
    label.length < 1 || label.length > 63 || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label)
  )) return null;
  return email;
}

export function generateEmailLoginCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export function hashEmailLoginCode(email: string, code: string, secret = process.env.AUTH_SECRET): string {
  if (!secret || !/^\d{6}$/.test(code)) throw new Error("Invalid email login code input.");
  return createHmac("sha256", secret)
    .update("janankadeh:email-login-code:v1\0")
    .update(email)
    .update("\0")
    .update(code)
    .digest("hex");
}

export function hashAdminRecoveryCode(
  userId: string,
  code: string,
  secret = process.env.AUTH_SECRET,
): string {
  if (!secret || !userId || !code) throw new Error("Invalid administrator recovery code input.");
  const normalized = code.replaceAll("-", "").trim().toUpperCase();
  if (!/^[A-F0-9]{20}$/.test(normalized)) throw new Error("Invalid administrator recovery code.");
  return createHmac("sha256", secret)
    .update("janankadeh:admin-recovery-code:v1\0")
    .update(userId)
    .update("\0")
    .update(normalized)
    .digest("hex");
}

export function generateAdminRecoveryCodes(count = 10): string[] {
  if (!Number.isSafeInteger(count) || count < 1 || count > 20) throw new Error("Invalid recovery code count.");
  return Array.from({ length: count }, () => {
    const raw = randomBytes(10).toString("hex").toUpperCase();
    return raw.match(/.{1,4}/g)!.join("-");
  });
}

export function constantTimeHexEqual(left: string, right: string): boolean {
  if (!HEX_SHA256.test(left) || !HEX_SHA256.test(right)) return false;
  return timingSafeEqual(Buffer.from(left, "hex"), Buffer.from(right, "hex"));
}

export function constantTimeSecretEqual(expected: string, supplied: string): boolean {
  if (Buffer.byteLength(expected, "utf8") > 256 || Buffer.byteLength(supplied, "utf8") > 256) return false;
  const expectedDigest = createHmac("sha256", "janankadeh:admin-enrollment:v1")
    .update(expected, "utf8")
    .digest();
  const suppliedDigest = createHmac("sha256", "janankadeh:admin-enrollment:v1")
    .update(supplied, "utf8")
    .digest();
  return timingSafeEqual(expectedDigest, suppliedDigest);
}
