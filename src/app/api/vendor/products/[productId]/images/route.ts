import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { auth } from "@/auth";
import { getPrisma } from "@/lib/prisma";
import { readRequestBytes } from "@/lib/request-bytes";
import { getProductImageMinFreeBytes, getProductImageVolumeLimitBytes, MAX_PRODUCT_IMAGE_OUTPUT_BYTES, MAX_PRODUCT_IMAGE_UPLOAD_BYTES } from "@/lib/product-image-policy";
import { getProductImageVolumeStats, isProductImageId, removeProductImageFile, saveProductImage } from "@/lib/product-image-storage";
import { limitVendorCatalogWrites } from "@/lib/vendor-catalog-write-rate-limit";

export const runtime = "nodejs";
const noStore = { "Cache-Control": "no-store" };
const MAX_IMAGES_PER_PRODUCT = 6;
const MAX_VENDOR_STORAGE_BYTES = 100 * 1024 * 1024;
const MAX_IMAGE_PIXELS = 40_000_000;
const PRODUCT_IMAGE_QUOTA_LOCK_NAMESPACE = 20261026;
const PRODUCT_IMAGE_QUOTA_LOCK_ID = 1001;
const ACCEPTED_FORMATS = new Set(["jpeg", "png", "webp", "avif"]);

async function getVendorRequest(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return { response: Response.json({ error: "ابتدا وارد حساب شوید." }, { status: 401, headers: noStore }) };
  if (session.user.status !== "ACTIVE" || session.user.role !== "VENDOR") {
    return { response: Response.json({ error: "دسترسی فروشندهٔ فعال لازم است." }, { status: 403, headers: noStore }) };
  }
  if (process.env.NODE_ENV === "production" && !process.env.AUTH_URL) {
    return { response: Response.json({ error: "نشانی رسمی سایت پیکربندی نشده است." }, { status: 503, headers: noStore }) };
  }
  try {
    const origin = request.headers.get("origin");
    if (!origin || new URL(origin).origin !== new URL(process.env.AUTH_URL ?? request.url).origin) {
      return { response: Response.json({ error: "مبدأ درخواست معتبر نیست." }, { status: 403, headers: noStore }) };
    }
  } catch {
    return { response: Response.json({ error: "مبدأ درخواست معتبر نیست." }, { status: 403, headers: noStore }) };
  }
  return { userId: session.user.id };
}

export async function POST(request: Request, { params }: { params: Promise<{ productId: string }> }) {
  const session = await getVendorRequest(request);
  if ("response" in session) return session.response;
  const volumeLimitBytes = getProductImageVolumeLimitBytes();
  const minFreeBytes = getProductImageMinFreeBytes();
  if (process.env.NODE_ENV === "production" && (volumeLimitBytes === null || minFreeBytes === null)) {
    return Response.json({ error: "سقف کل تصاویر و حداقل فضای آزاد volume باید در محیط تولید تنظیم شوند." }, { status: 503, headers: noStore });
  }
  const { productId } = await params;
  if (!/^[a-zA-Z0-9_-]{1,40}$/.test(productId)) return Response.json({ error: "شناسهٔ کالا معتبر نیست." }, { status: 400, headers: noStore });
  const contentType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (!contentType || !["image/jpeg", "image/png", "image/webp", "image/avif"].includes(contentType)) {
    return Response.json({ error: "فقط تصویر JPEG، PNG، WebP یا AVIF پذیرفته می‌شود." }, { status: 415, headers: noStore });
  }
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_PRODUCT_IMAGE_UPLOAD_BYTES) {
    await request.body?.cancel().catch(() => undefined);
    return Response.json({ error: "حجم فایل ورودی تصویر نباید از ۲ مگابایت بیشتر باشد." }, { status: 413, headers: noStore });
  }
  const rateLimitResponse = await limitVendorCatalogWrites(session.userId, "image");
  if (rateLimitResponse) return rateLimitResponse;
  const inputBytes = await readRequestBytes(request, MAX_PRODUCT_IMAGE_UPLOAD_BYTES);
  if (!inputBytes) return Response.json({ error: "حجم فایل ورودی تصویر نباید از ۲ مگابایت بیشتر باشد." }, { status: 413, headers: noStore });
  if (!inputBytes.byteLength) return Response.json({ error: "فایل تصویر خالی است." }, { status: 400, headers: noStore });

  let output: Buffer;
  try {
    const metadata = await sharp(inputBytes, { failOn: "error", limitInputPixels: MAX_IMAGE_PIXELS }).metadata();
    if (!metadata.format || !ACCEPTED_FORMATS.has(metadata.format) || (metadata.pages ?? 1) > 1 || !metadata.width || !metadata.height) {
      return Response.json({ error: "فایل تصویر معتبر یا پشتیبانی‌شده نیست." }, { status: 400, headers: noStore });
    }
    if (metadata.width < 64 || metadata.height < 64) return Response.json({ error: "ابعاد تصویر باید دست‌کم ۶۴ در ۶۴ پیکسل باشد." }, { status: 400, headers: noStore });
    if (metadata.width * metadata.height > MAX_IMAGE_PIXELS) return Response.json({ error: "ابعاد تصویر بیش از حد مجاز است." }, { status: 413, headers: noStore });
    output = await sharp(inputBytes, { failOn: "error", limitInputPixels: MAX_IMAGE_PIXELS })
      .rotate()
      .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82, effort: 4 })
      .toBuffer();
  } catch {
    return Response.json({ error: "فایل تصویر قابل پردازش نیست." }, { status: 400, headers: noStore });
  }
  if (output.byteLength > MAX_PRODUCT_IMAGE_OUTPUT_BYTES) return Response.json({ error: "حجم تصویر بازکدگذاری‌شده بیش از ۵ مگابایت است." }, { status: 413, headers: noStore });

  const prisma = getPrisma();
  const vendor = await prisma.vendorProfile.findFirst({ where: { userId: session.userId, status: "ACTIVE", user: { status: "ACTIVE", role: "VENDOR" } }, select: { id: true } });
  if (!vendor) return Response.json({ error: "فروشگاه فعال پیدا نشد." }, { status: 403, headers: noStore });
  const imageId = randomUUID();
  const altText = (new URL(request.url).searchParams.get("alt") ?? "").normalize("NFKC").trim().replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 200);
  let reservationCreated = false;
  try {
    const reservation = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "VendorProfile" WHERE "id" = ${vendor.id} FOR UPDATE`;
      const activeVendor = await tx.vendorProfile.findFirst({ where: { id: vendor.id, status: "ACTIVE", user: { status: "ACTIVE", role: "VENDOR" } }, select: { id: true } });
      if (!activeVendor) return { error: "vendor" as const };
      const product = await tx.product.findFirst({ where: { id: productId, vendorId: vendor.id, status: { in: ["DRAFT", "REJECTED", "PENDING_REVIEW"] } }, select: { id: true, name: true } });
      if (!product) return { error: "unavailable" as const };
      const [imageCount, vendorUsage] = await Promise.all([
        tx.productImage.count({ where: { productId } }),
        tx.productImage.aggregate({ where: { product: { vendorId: vendor.id } }, _sum: { sizeBytes: true } }),
      ]);
      if (imageCount >= MAX_IMAGES_PER_PRODUCT) return { error: "count" as const };
      if ((vendorUsage._sum.sizeBytes ?? 0) + output.byteLength > MAX_VENDOR_STORAGE_BYTES) return { error: "quota" as const };
      if (volumeLimitBytes !== null || minFreeBytes !== null) {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(${PRODUCT_IMAGE_QUOTA_LOCK_NAMESPACE}, ${PRODUCT_IMAGE_QUOTA_LOCK_ID})`;
        if (volumeLimitBytes !== null) {
          const totalUsage = await tx.productImage.aggregate({ _sum: { sizeBytes: true } });
          if ((totalUsage._sum.sizeBytes ?? 0) + output.byteLength > volumeLimitBytes) return { error: "volume" as const };
        }
        if (minFreeBytes !== null) {
          let volumeStats: Awaited<ReturnType<typeof getProductImageVolumeStats>>;
          try {
            volumeStats = await getProductImageVolumeStats();
          } catch {
            return { error: "volume-unavailable" as const };
          }
          const pendingUsage = await tx.productImage.aggregate({ where: { storageReady: false }, _sum: { sizeBytes: true } });
          const pendingBytes = pendingUsage._sum.sizeBytes ?? 0;
          if (!Number.isSafeInteger(pendingBytes) || pendingBytes < 0) return { error: "volume-unavailable" as const };
          const requiredBytes = BigInt(minFreeBytes) + BigInt(pendingBytes) + BigInt(output.byteLength);
          if (volumeStats.availableBytes < requiredBytes) return { error: "free-space" as const };
        }
      }
      const row = await tx.productImage.create({
        data: { id: imageId, productId, url: `/api/product-images/${imageId}`, altText: altText || product.name, position: imageCount, sizeBytes: output.byteLength, storageReady: false },
        select: { id: true, url: true, altText: true, sizeBytes: true },
      });
      return { image: row };
    });
    if ("error" in reservation) {
      const message = reservation.error === "count" ? "برای هر کالا حداکثر ۶ تصویر می‌توانید ثبت کنید."
        : reservation.error === "quota" ? "سهمیهٔ ۱۰۰ مگابایتی تصویر فروشگاه تکمیل شده است."
          : reservation.error === "volume" ? "سقف کل فضای ذخیره‌سازی تصاویر تکمیل شده است."
            : reservation.error === "free-space" ? "فضای آزاد volume به حداقل ذخیرهٔ عملیاتی رسیده است."
              : reservation.error === "volume-unavailable" ? "ظرفیت volume قابل بررسی نیست؛ آپلود متوقف شد."
                : reservation.error === "vendor" ? "فروشگاه فعال پیدا نشد." : "این کالا برای بارگذاری تصویر در دسترس نیست.";
      const status = reservation.error === "unavailable" ? 404
        : reservation.error === "vendor" ? 403
          : reservation.error === "volume-unavailable" ? 503
            : reservation.error === "volume" || reservation.error === "free-space" ? 507 : 413;
      return Response.json({ error: message }, { status, headers: noStore });
    }
    reservationCreated = true;
    const finalized = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "VendorProfile" WHERE "id" = ${vendor.id} FOR UPDATE`;
      const reservation = await tx.productImage.findFirst({
        where: { id: imageId, productId, storageReady: false, storageDeleting: false, product: { vendorId: vendor.id } },
        select: { id: true },
      });
      if (!reservation) return false;
      await saveProductImage(imageId, output);
      const updated = await tx.productImage.updateMany({
        where: { id: imageId, productId, storageReady: false, storageDeleting: false, product: { vendorId: vendor.id } },
        data: { storageReady: true },
      });
      return updated.count === 1;
    });
    if (!finalized) throw new Error("Image reservation is no longer available.");
    return Response.json(reservation.image, { status: 201, headers: noStore });
  } catch (error) {
    let fileRemoved = false;
    try { await removeProductImageFile(imageId); fileRemoved = true; } catch { /* Leave a visible reservation if disk cleanup fails. */ }
    if (reservationCreated && fileRemoved) {
      await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "VendorProfile" WHERE "id" = ${vendor.id} FOR UPDATE`;
        await tx.productImage.deleteMany({ where: { id: imageId, productId, storageDeleting: false, product: { vendorId: vendor.id } } });
      }).catch(() => undefined);
    }
    console.error("Vendor product image upload failed.", error);
    return Response.json({ error: "بارگذاری تصویر انجام نشد. تصویر رزروشده را از پنل حذف کنید و دوباره تلاش کنید." }, { status: 503, headers: noStore });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ productId: string }> }) {
  const session = await getVendorRequest(request);
  if ("response" in session) return session.response;
  const { productId } = await params;
  const imageId = new URL(request.url).searchParams.get("imageId") ?? "";
  if (!/^[a-zA-Z0-9_-]{1,40}$/.test(productId) || !isProductImageId(imageId)) return Response.json({ error: "شناسهٔ کالا یا تصویر معتبر نیست." }, { status: 400, headers: noStore });
  const rateLimitResponse = await limitVendorCatalogWrites(session.userId, "image");
  if (rateLimitResponse) return rateLimitResponse;
  const prisma = getPrisma();
  try {
    const vendor = await prisma.vendorProfile.findFirst({ where: { userId: session.userId, status: "ACTIVE", user: { status: "ACTIVE", role: "VENDOR" } }, select: { id: true } });
    if (!vendor) return Response.json({ error: "فروشگاه فعال پیدا نشد." }, { status: 403, headers: noStore });
    const marked = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "VendorProfile" WHERE "id" = ${vendor.id} FOR UPDATE`;
      const image = await tx.productImage.findFirst({ where: { id: imageId, productId, url: { startsWith: "/api/product-images/" }, product: { vendorId: vendor.id, status: { in: ["DRAFT", "REJECTED", "PENDING_REVIEW"] } } }, select: { id: true, storageDeleting: true } });
      if (!image) return false;
      if (!image.storageDeleting) {
        await tx.productImage.updateMany({
          where: { id: imageId, productId, storageDeleting: false },
          data: { storageReady: false, storageDeleting: true },
        });
      }
      return true;
    });
    if (!marked) return Response.json({ error: "این تصویر برای حذف در دسترس نیست." }, { status: 404, headers: noStore });
    await removeProductImageFile(imageId);
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "VendorProfile" WHERE "id" = ${vendor.id} FOR UPDATE`;
      await tx.productImage.deleteMany({ where: { id: imageId, productId, storageDeleting: true, url: { startsWith: "/api/product-images/" }, product: { vendorId: vendor.id } } });
    });
    return new Response(null, { status: 204, headers: noStore });
  } catch (error) {
    console.error("Vendor product image deletion failed.", error);
    return Response.json({ error: "حذف تصویر انجام نشد." }, { status: 503, headers: noStore });
  }
}
