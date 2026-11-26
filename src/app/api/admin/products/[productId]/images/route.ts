import { auth } from "@/auth";
import { getPrisma } from "@/lib/prisma";
import { recordAdminAuditEvent } from "@/lib/admin-audit";
import { isProductImageId, removeProductImageFile } from "@/lib/product-image-storage";

export const runtime = "nodejs";
const noStore = { "Cache-Control": "no-store" };

export async function DELETE(request: Request, { params }: { params: Promise<{ productId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "ورود لازم است." }, { status: 401, headers: noStore });
  if (session.user.status !== "ACTIVE" || session.user.role !== "ADMIN" || session.user.mfaVerified !== true) return Response.json({ error: "دسترسی مدیر لازم است." }, { status: 403, headers: noStore });
  if (process.env.NODE_ENV === "production" && !process.env.AUTH_URL) return Response.json({ error: "نشانی رسمی سایت پیکربندی نشده است." }, { status: 503, headers: noStore });
  try {
    const origin = request.headers.get("origin");
    if (!origin || new URL(origin).origin !== new URL(process.env.AUTH_URL ?? request.url).origin) return Response.json({ error: "مبدأ درخواست معتبر نیست." }, { status: 403, headers: noStore });
  } catch { return Response.json({ error: "مبدأ درخواست معتبر نیست." }, { status: 403, headers: noStore }); }

  const { productId } = await params;
  const imageId = new URL(request.url).searchParams.get("imageId") ?? "";
  if (!/^[a-zA-Z0-9_-]{1,40}$/.test(productId) || !isProductImageId(imageId)) return Response.json({ error: "شناسهٔ کالا یا تصویر معتبر نیست." }, { status: 400, headers: noStore });
  try {
    const prisma = getPrisma();
    const deleted = await prisma.$transaction(async (tx) => {
      const product = await tx.product.findUnique({ where: { id: productId }, select: { vendorId: true } });
      if (!product) return false;
      await tx.$queryRaw`SELECT "id" FROM "VendorProfile" WHERE "id" = ${product.vendorId} FOR UPDATE`;
      const image = await tx.productImage.findFirst({ where: { id: imageId, productId, url: { startsWith: "/api/product-images/" } }, select: { id: true, storageDeleting: true } });
      if (!image) return false;
      if (!image.storageDeleting) {
        await tx.productImage.updateMany({ where: { id: imageId, productId, storageDeleting: false }, data: { storageReady: false, storageDeleting: true } });
      }
      return { vendorId: product.vendorId };
    });
    if (!deleted) return Response.json({ error: "تصویر کالا پیدا نشد." }, { status: 404, headers: noStore });
    await removeProductImageFile(imageId);
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "VendorProfile" WHERE "id" = ${deleted.vendorId} FOR UPDATE`;
      const removed = await tx.productImage.deleteMany({ where: { id: imageId, productId, storageDeleting: true, url: { startsWith: "/api/product-images/" }, product: { vendorId: deleted.vendorId } } });
      if (removed.count === 1) await recordAdminAuditEvent(tx, session.user.id, "PRODUCT_IMAGE_DELETED", "PRODUCT", productId);
    });
    return new Response(null, { status: 204, headers: noStore });
  } catch (error) {
    console.error("Admin product image deletion failed.", error);
    return Response.json({ error: "حذف تصویر کالا انجام نشد." }, { status: 503, headers: noStore });
  }
}
