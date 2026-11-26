import "server-only";
import { mkdir, readFile, statfs, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { isExactProductImageMount } from "@/lib/product-image-mount";

const IMAGE_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isProductImageId(imageId: string): boolean {
  return IMAGE_ID_PATTERN.test(imageId);
}

function getProductImageDirectory(): string {
  return path.resolve(/* turbopackIgnore: true */ process.env.PRODUCT_IMAGE_DIR ?? path.join(process.cwd(), ".product-uploads"));
}

async function assertProductImageVolumeMounted(): Promise<void> {
  if (process.env.NODE_ENV !== "production") return;

  const directory = getProductImageDirectory();
  const mountInfo = await readFile("/proc/self/mountinfo", "utf8");
  if (!isExactProductImageMount(mountInfo, directory)) {
    const error = new Error("Product image directory is not a mounted volume.");
    Object.assign(error, { code: "ENODEV" });
    throw error;
  }
}

export function getProductImagePath(imageId: string): string {
  if (!isProductImageId(imageId)) throw new Error("Invalid product image id.");
  return path.join(getProductImageDirectory(), `${imageId}.webp`);
}

export async function getProductImageVolumeStats(): Promise<{ totalBytes: bigint; availableBytes: bigint }> {
  await assertProductImageVolumeMounted();
  const stats = await statfs(getProductImageDirectory(), { bigint: true });
  const totalBytes = stats.blocks * stats.bsize;
  const availableBytes = stats.bavail * stats.bsize;
  if (totalBytes <= BigInt(0) || availableBytes < BigInt(0) || availableBytes > totalBytes) {
    throw new Error("Product image filesystem returned invalid capacity values.");
  }
  return { totalBytes, availableBytes };
}

export async function saveProductImage(imageId: string, image: Uint8Array): Promise<void> {
  await assertProductImageVolumeMounted();
  const filePath = getProductImagePath(imageId);
  await mkdir(path.dirname(filePath), { recursive: true, mode: 0o750 });
  await writeFile(filePath, image, { flag: "wx", mode: 0o640 });
}

export async function readProductImage(imageId: string): Promise<Buffer> {
  await assertProductImageVolumeMounted();
  return readFile(getProductImagePath(imageId));
}

export async function removeProductImageFile(imageId: string): Promise<void> {
  await assertProductImageVolumeMounted();
  try {
    await unlink(getProductImagePath(imageId));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}
