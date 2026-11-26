import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const TOTP_PERIOD_SECONDS = 30;
const TOTP_DIGITS = 6;

function decodeBase32(value: string): Buffer {
  const upper = value.toUpperCase();
  const paddingMatch = upper.match(/=+$/);
  const normalized = upper.replace(/=+$/, "");
  if (!normalized || !/^[A-Z2-7]+$/.test(normalized)) {
    throw new Error("Invalid TOTP secret.");
  }
  const paddingByRemainder: Record<number, number> = { 0: 0, 2: 6, 4: 4, 5: 3, 7: 1 };
  const expectedPadding = paddingByRemainder[normalized.length % 8];
  if (expectedPadding === undefined || (paddingMatch && paddingMatch[0].length !== expectedPadding)) {
    throw new Error("Invalid TOTP secret encoding.");
  }

  let bits = 0;
  let buffer = 0;
  const output: number[] = [];
  for (const character of normalized) {
    buffer = (buffer << 5) | BASE32_ALPHABET.indexOf(character);
    bits += 5;
    if (bits >= 8) {
      output.push((buffer >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  if (bits > 0 && (buffer & ((1 << bits) - 1)) !== 0) {
    throw new Error("Invalid TOTP secret encoding.");
  }

  return Buffer.from(output);
}

function encodeBase32(value: Uint8Array): string {
  let bits = 0;
  let buffer = 0;
  let output = "";
  for (const byte of value) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(buffer >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32_ALPHABET[(buffer << (5 - bits)) & 31];
  return output;
}

/** Create a 160-bit secret suitable for provisioning a TOTP authenticator. */
export function generateTotpSecret(): string {
  return encodeBase32(randomBytes(20));
}

/** Generate an RFC 6238 code for a deterministic time, primarily for verification. */
export function generateTotpCode(
  secret: string,
  epochMilliseconds = Date.now(),
  digits = TOTP_DIGITS,
): string {
  if (!Number.isSafeInteger(epochMilliseconds) || epochMilliseconds < 0) {
    throw new Error("Invalid TOTP time.");
  }
  if (!Number.isSafeInteger(digits) || digits < 6 || digits > 8) {
    throw new Error("Invalid TOTP digit count.");
  }

  const counter = BigInt(Math.floor(epochMilliseconds / 1000 / TOTP_PERIOD_SECONDS));
  const counterBytes = Buffer.alloc(8);
  counterBytes.writeBigUInt64BE(counter);
  const digest = createHmac("sha1", decodeBase32(secret)).update(counterBytes).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);
  return String(binary % 10 ** digits).padStart(digits, "0");
}

/** Return the newest matching counter in the current 30-second window and adjacent steps. */
export function getMatchingTotpCounter(
  secret: string,
  code: string,
  epochMilliseconds = Date.now(),
): number | null {
  if (!/^\d{6}$/.test(code) || !Number.isSafeInteger(epochMilliseconds) || epochMilliseconds < 0) {
    return null;
  }

  const supplied = Buffer.from(code, "ascii");
  const currentStep = Math.floor(epochMilliseconds / 1000 / TOTP_PERIOD_SECONDS);
  let matchedCounter: number | null = null;
  for (const stepOffset of [-1, 0, 1]) {
    const counter = currentStep + stepOffset;
    const stepTime = counter * TOTP_PERIOD_SECONDS * 1000;
    if (stepTime < 0) continue;
    const expected = Buffer.from(generateTotpCode(secret, stepTime), "ascii");
    if (timingSafeEqual(supplied, expected) && (matchedCounter === null || counter > matchedCounter)) {
      matchedCounter = counter;
    }
  }
  return matchedCounter;
}

/** Accept the current 30-second code and one adjacent step on either side. */
export function verifyTotpCode(
  secret: string,
  code: string,
  epochMilliseconds = Date.now(),
): boolean {
  return getMatchingTotpCounter(secret, code, epochMilliseconds) !== null;
}

export function createTotpProvisioningUri(secret: string, account: string, issuer = "JananKadeh"): string {
  decodeBase32(secret);
  if (!account.trim() || /[\u0000-\u001f\u007f]/.test(account)) throw new Error("Invalid TOTP account label.");
  if (!issuer.trim() || /[\u0000-\u001f\u007f]/.test(issuer)) throw new Error("Invalid TOTP issuer.");
  if (account.length > 320 || issuer.length > 64) throw new Error("Invalid TOTP label length.");

  const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(account.trim())}`;
  const query = new URLSearchParams({
    secret: secret.replace(/=+$/, "").toUpperCase(),
    issuer: issuer.trim(),
    algorithm: "SHA1",
    digits: String(TOTP_DIGITS),
    period: String(TOTP_PERIOD_SECONDS),
  });
  return `otpauth://totp/${label}?${query.toString()}`;
}
