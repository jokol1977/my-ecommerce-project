import assert from "node:assert/strict";
import test from "node:test";
import { isExactProductImageMount } from "@/lib/product-image-mount";

const rootOnlyMountInfo = "24 1 0:22 / / rw,relatime - ext4 /dev/root rw";

test("requires an exact non-root mount at the image directory", () => {
  const mounted = `${rootOnlyMountInfo}\n36 24 0:41 / /app/product-uploads rw,relatime - ext4 /dev/sdb rw`;

  assert.equal(isExactProductImageMount(mounted, "/app/product-uploads"), true);
  assert.equal(isExactProductImageMount(rootOnlyMountInfo, "/app/product-uploads"), false);
  assert.equal(isExactProductImageMount(mounted, "/app/product-uploads/cache"), false);
  assert.equal(isExactProductImageMount(mounted, "/app/product-uploads-old"), false);
  assert.equal(isExactProductImageMount(mounted, "/"), false);
});

test("decodes escaped mount paths before matching", () => {
  const mountInfo = `${rootOnlyMountInfo}\n36 24 0:41 / /mnt/product\\040images rw,relatime - ext4 /dev/sdb rw`;

  assert.equal(isExactProductImageMount(mountInfo, "/mnt/product images"), true);
});
