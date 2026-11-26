import "server-only";
import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";

export type CurrentVendorAgreement = {
  version: string;
  documentSha256: string;
  href: string;
};

const VERSION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const MAX_AGREEMENT_BYTES = 5 * 1024 * 1024;

/** Return only a published PDF whose bytes match the explicitly configured contract fingerprint. */
export async function getCurrentVendorAgreement(): Promise<CurrentVendorAgreement | null> {
  const version = process.env.VENDOR_AGREEMENT_VERSION?.trim() ?? "";
  const configuredSha256 = process.env.VENDOR_AGREEMENT_SHA256?.trim().toLowerCase() ?? "";
  if (!VERSION_PATTERN.test(version) || !SHA256_PATTERN.test(configuredSha256)) return null;

  const filename = `${version}.pdf`;
  const absolutePath = join(process.cwd(), "public", "legal", "vendor-agreements", filename);
  try {
    const metadata = await stat(absolutePath);
    if (!metadata.isFile() || metadata.size < 8 || metadata.size > MAX_AGREEMENT_BYTES) return null;

    const bytes = await readFile(absolutePath);
    if (bytes.subarray(0, 5).toString("ascii") !== "%PDF-") return null;
    const actualSha256 = createHash("sha256").update(bytes).digest("hex");
    if (actualSha256 !== configuredSha256) return null;

    return {
      version,
      documentSha256: actualSha256,
      href: `/legal/vendor-agreements/${encodeURIComponent(filename)}`,
    };
  } catch {
    return null;
  }
}
