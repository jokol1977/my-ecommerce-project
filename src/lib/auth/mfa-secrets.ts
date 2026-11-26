import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ENCRYPTION_VERSION = "v1";
const GCM_IV_BYTES = 12;
const GCM_TAG_BYTES = 16;

function getEncryptionKey(encodedKey = process.env.AUTH_MFA_ENCRYPTION_KEY): Buffer {
  if (!encodedKey || encodedKey.startsWith("replace_with_") || !/^[A-Za-z0-9_-]{43}$/.test(encodedKey)) {
    throw new Error("AUTH_MFA_ENCRYPTION_KEY must be a 32-byte base64url key.");
  }
  const key = Buffer.from(encodedKey, "base64url");
  if (key.byteLength !== 32) throw new Error("AUTH_MFA_ENCRYPTION_KEY must be a 32-byte base64url key.");
  return key;
}

function getAdditionalData(userId: string): Buffer {
  if (!userId || userId.length > 128 || /[\u0000-\u001f\u007f]/.test(userId)) {
    throw new Error("Invalid MFA owner id.");
  }
  return Buffer.from(`janankadeh:admin-totp:${ENCRYPTION_VERSION}:${userId}`, "utf8");
}

/** Encrypt an administrator TOTP secret; bind ciphertext to its owning user. */
export function encryptAdminTotpSecret(
  userId: string,
  secret: string,
  encodedKey = process.env.AUTH_MFA_ENCRYPTION_KEY,
): string {
  if (!secret || secret.length > 128) throw new Error("Invalid MFA secret.");
  const iv = randomBytes(GCM_IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", getEncryptionKey(encodedKey), iv);
  cipher.setAAD(getAdditionalData(userId));
  const encrypted = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [ENCRYPTION_VERSION, iv.toString("base64url"), tag.toString("base64url"), encrypted.toString("base64url")].join(".");
}

/** Decrypt only for the administrator id used when encrypting the secret. */
export function decryptAdminTotpSecret(
  userId: string,
  ciphertext: string,
  encodedKey = process.env.AUTH_MFA_ENCRYPTION_KEY,
): string {
  if (ciphertext.length > 1024) throw new Error("Invalid encrypted MFA secret.");
  const [version, encodedIv, encodedTag, encodedBody, ...extra] = ciphertext.split(".");
  if (version !== ENCRYPTION_VERSION || !encodedIv || !encodedTag || !encodedBody || extra.length) {
    throw new Error("Invalid encrypted MFA secret.");
  }

  const iv = Buffer.from(encodedIv, "base64url");
  const tag = Buffer.from(encodedTag, "base64url");
  const body = Buffer.from(encodedBody, "base64url");
  if (iv.byteLength !== GCM_IV_BYTES || tag.byteLength !== GCM_TAG_BYTES || !body.byteLength) {
    throw new Error("Invalid encrypted MFA secret.");
  }

  const decipher = createDecipheriv("aes-256-gcm", getEncryptionKey(encodedKey), iv);
  decipher.setAAD(getAdditionalData(userId));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(body), decipher.final()]).toString("utf8");
}
