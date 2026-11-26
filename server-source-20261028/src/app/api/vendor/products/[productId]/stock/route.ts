import { auth } from "@/auth";
import { getPrisma } from "@/lib/prisma";
import { MAX_PRODUCT_STOCK } from "@/lib/product-input";
import { readRequestBody } from "@/lib/request-body";
import { limitVendorCatalogWrites } from "@/lib/vendor-catalog-write-rate-limit";

export const runtime = "nodejs";
const noStore = { "Cache-Control": "no-store" };

export async function PATCH(request: Request, { params }: { params: Promise<{ productId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "ابتدا وارد حساب شوید." }, { status: 401, headers: noStore });
  if (session.user.status !== "ACTIVE" || session.user.role !== "VENDOR") return Response.json({ error: "دسترسی فروشندهٔ فعال لازم است." }, { status: 403, headers: noStore });
  if (process.env.NODE_ENV === "production" && !process.env.AUTH_URL) return Response.json({ error: "نشانی رسمی سایت پیکربندی نشده است." }, { status: 503, headers: noStore });
  try {
    const origin = request.headers.get("origin");
    if (!origin || new URL(origin).origin !== new URL(process.env.AUTH_URL ?? request.url).origin) return Response.json({ error: "مبدأ درخواست معتبر نیست." }, { status: 403, headers: noStore });
  } catch { return Response.json({ error: "مبدأ درخواست معتبر نیست." }, { status: 403, headers: noStore }); }
  const rateLimitResponse = await limitVendorCatalogWrites(session.user.id, "update");
  if (rateLimitResponse) return rateLimitResponse;
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) return Response.json({ error: "قالب درخواست معتبر نیست." }, { status: 415, headers: noStore });

  let stockQuantity: unknown;
  try {
    const body = await readRequestBody(request, 1024);
    if (body === null) return Response.json({ error: "درخواست بیش از حد بزرگ است." }, { status: 413, headers: noStore });
    const parsed: unknown = JSON.parse(body);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed) || !("stockQuantity" in parsed)) throw new Error("invalid");
    stockQuantity = parsed.stockQuantity;
  } catch { return Response.json({ error: "اطلاعات موجودی معتبر نیست." }, { status: 400, headers: noStore }); }
  if (!Number.isSafeInteger(stockQuantity) || (stockQuantity as number) < 0 || (stockQuantity as number) > MAX_PRODUCT_STOCK) return Response.json({ error: "موجودی باید عددی صحیح بین صفر تا یک میلیون باشد." }, { status: 400, headers: noStore });

  const { productId } = await params;
  if (!/^[a-zA-Z0-9_-]{1,40}$/.test(productId)) return Response.json({ error: "شناسهٔ کالا معتبر نیست." }, { status: 400, headers: noStore });
  try {
    const prisma = getPrisma();
    const vendor = await prisma.vendorProfile.findFirst({ where: { userId: session.user.id, status: "ACTIVE", user: { status: "ACTIVE", role: "VENDOR" } }, select: { id: true } });
    if (!vendor) return Response.json({ error: "فروشگاه فعال پیدا نشد." }, { status: 403, headers: noStore });
    const result = await prisma.$transaction(async (tx) => {
      const product = await tx.product.findFirst({
        where: { id: productId, vendorId: vendor.id, status: "ACTIVE" },
        select: { id: true },
      });
      if (!product) return { count: 0, maxAvailable: null as number | null };

      const outstandingReservations = await tx.orderItem.aggregate({
        where: {
          productId,
          vendorOrder: { order: { status: "PENDING_PAYMENT" } },
        },
        _sum: { quantity: true },
      });
      const reservedQuantity = outstandingReservations._sum.quantity ?? 0;
      const maxAvailable = Math.max(0, MAX_PRODUCT_STOCK - reservedQuantity);
      if ((stockQuantity as number) > maxAvailable) return { count: 0, maxAvailable };

      const update = await tx.product.updateMany({
        where: { id: product.id, vendorId: vendor.id, status: "ACTIVE" },
        data: { stockQuantity: stockQuantity as number },
      });
      return { count: update.count, maxAvailable: null as number | null };
    }, { isolationLevel: "Serializable", timeout: 15_000 });
    if (result.maxAvailable !== null) {
      return Response.json({ error: `موجودی قابل ثبت با توجه به سفارش‌های در انتظار پرداخت حداکثر ${result.maxAvailable} عدد است.` }, { status: 409, headers: noStore });
    }
    if (result.count !== 1) return Response.json({ error: "کالای فعال متعلق به این فروشگاه پیدا نشد." }, { status: 404, headers: noStore });
    return Response.json({ stockQuantity }, { headers: noStore });
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2034") {
      return Response.json({ error: "موجودی یا سفارش هم‌زمان تغییر کرد؛ صفحه را تازه کنید و دوباره تلاش کنید." }, { status: 409, headers: noStore });
    }
    console.error("Vendor stock update failed.", error);
    return Response.json({ error: "به‌روزرسانی موجودی انجام نشد." }, { status: 503, headers: noStore });
  }
}
