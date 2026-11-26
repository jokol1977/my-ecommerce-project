import { auth } from "@/auth";
import { getPrisma } from "@/lib/prisma";
import { isProductImageId, readProductImage } from "@/lib/product-image-storage";

export const runtime = "nodejs";
const noStore = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Cross-Origin-Resource-Policy": "same-origin" };

export async function GET(_request: Request, { params }: { params: Promise<{ imageId: string }> }) {
  const { imageId } = await params;
  if (!isProductImageId(imageId)) return new Response(null, { status: 404, headers: noStore });
  try {
    const image = await getPrisma().productImage.findUnique({
      where: { id: imageId, storageDeleting: false },
      select: { url: true, storageReady: true, product: { select: { status: true, vendor: { select: { status: true, user: { select: { id: true, status: true, role: true } } } } } } },
    });
    if (!image || !image.storageReady || image.url !== `/api/product-images/${imageId}`) return new Response(null, { status: 404, headers: noStore });
    const publicImage = image.product.status === "ACTIVE" && image.product.vendor.status === "ACTIVE" && image.product.vendor.user.status === "ACTIVE" && image.product.vendor.user.role === "VENDOR";
    if (!publicImage) {
      const session = await auth();
      const isAdmin = session?.user?.status === "ACTIVE" && session.user.role === "ADMIN" && session.user.mfaVerified === true;
      const isOwner = session?.user?.status === "ACTIVE" && session.user.role === "VENDOR" && session.user.id === image.product.vendor.user.id;
      if (!isAdmin && !isOwner) return new Response(null, { status: 404, headers: noStore });
    }
    const bytes = await readProductImage(imageId);
    return new Response(new Uint8Array(bytes), {
      status: 200,
      headers: {
        "Content-Type": "image/webp",
        "Content-Length": String(bytes.byteLength),
        "Content-Disposition": "inline; filename=product-image.webp",
        "X-Content-Type-Options": "nosniff",
        "Cross-Origin-Resource-Policy": "same-origin",
        "Cache-Control": publicImage ? "public, max-age=3600, s-maxage=86400" : "private, no-store",
      },
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return new Response(null, { status: 404, headers: noStore });
    console.error("Product image read failed.", error);
    return new Response(null, { status: 503, headers: noStore });
  }
}
