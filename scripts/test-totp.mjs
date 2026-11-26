import assert from "node:assert/strict";
import test from "node:test";
import { decryptAdminTotpSecret, encryptAdminTotpSecret } from "../src/lib/auth/mfa-secrets.ts";
import {
  createTotpProvisioningUri,
  generateTotpCode,
  generateTotpSecret,
  verifyTotpCode,
} from "../src/lib/auth/totp.ts";

const rfcTestSecret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";

test("matches RFC 6238 SHA-1 test vectors", () => {
  const vectors = [
    [59, "94287082"],
    [1_111_111_109, "07081804"],
    [1_111_111_111, "14050471"],
    [1_234_567_890, "89005924"],
    [2_000_000_000, "69279037"],
    [20_000_000_000, "65353130"],
  ];

  for (const [seconds, expected] of vectors) {
    assert.equal(generateTotpCode(rfcTestSecret, seconds * 1000, 8), expected);
  }
});

test("generates 160-bit secrets and accepts only the bounded clock window", () => {
  const secret = generateTotpSecret();
  assert.match(secret, /^[A-Z2-7]{32}$/);

  const codeAt30Seconds = generateTotpCode(rfcTestSecret, 30_000);
  assert.equal(verifyTotpCode(rfcTestSecret, codeAt30Seconds, 60_000), true);
  assert.equal(verifyTotpCode(rfcTestSecret, codeAt30Seconds, 90_000), false);
  assert.equal(verifyTotpCode(rfcTestSecret, "12x456", 30_000), false);
  assert.equal(verifyTotpCode(rfcTestSecret, "1234567", 30_000), false);
});

test("builds a correctly labeled authenticator provisioning URI", () => {
  const uri = createTotpProvisioningUri(rfcTestSecret, "admin@example.test", "Janan Kadeh");
  assert.match(uri, /^otpauth:\/\/totp\/Janan%20Kadeh:admin%40example\.test\?/);
  assert.match(uri, /algorithm=SHA1/);
  assert.match(uri, /digits=6/);
  assert.match(uri, /period=30/);
});

test("rejects malformed secrets and labels", () => {
  assert.throws(() => generateTotpCode("not-a-base32-secret", 0));
  assert.throws(() => createTotpProvisioningUri("ABC!", "admin@example.test"));
  assert.throws(() => createTotpProvisioningUri(rfcTestSecret, "bad\nlabel"));
  assert.throws(() => createTotpProvisioningUri("A", "admin@example.test"));
});

test("encrypts TOTP secrets with owner binding and detects tampering", () => {
  const key = Buffer.alloc(32, 7).toString("base64url");
  const plaintext = generateTotpSecret();
  const ciphertext = encryptAdminTotpSecret("admin-user-1", plaintext, key);

  assert.equal(decryptAdminTotpSecret("admin-user-1", ciphertext, key), plaintext);
  assert.equal(ciphertext.includes(plaintext), false);
  assert.throws(() => decryptAdminTotpSecret("admin-user-2", ciphertext, key));

  const parts = ciphertext.split(".");
  parts[3] = `${parts[3].startsWith("A") ? "B" : "A"}${parts[3].slice(1)}`;
  assert.throws(() => decryptAdminTotpSecret("admin-user-1", parts.join("."), key));
  assert.throws(() => encryptAdminTotpSecret("admin-user-1", plaintext, "short"));
});
