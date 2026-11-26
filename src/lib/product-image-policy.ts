export const MAX_PRODUCT_IMAGE_UPLOAD_BYTES = 2 * 1024 * 1024;
export const MAX_PRODUCT_IMAGE_OUTPUT_BYTES = 5 * 1024 * 1024;

/** Logical cap for reserved image bytes; production uploads fail closed when it is absent or invalid. */
export function getProductImageVolumeLimitBytes(): number | null {
  const value = process.env.PRODUCT_IMAGE_VOLUME_LIMIT_BYTES?.trim() ?? "";
  if (!/^[1-9]\d*$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

/** Minimum free bytes to preserve on the image filesystem; production uploads fail closed when unset. */
export function getProductImageMinFreeBytes(): number | null {
  const value = process.env.PRODUCT_IMAGE_VOLUME_MIN_FREE_BYTES?.trim() ?? "";
  if (!/^[1-9]\d*$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}
