import { auth } from "@/auth";
import { getPrisma } from "@/lib/prisma";

export const runtime = "nodejs";
const noStore = { "Cache-Control": "no-store" };

export async function POST(request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "ابتدا وارد حساب شوید." }, { status: 401, headers: noStore });
  if (session.user.status !== "ACTIVE" || session.user.role !== "CUSTOMER") return Response.json({ error: "دسترسی مشتری فعال لازم است." }, { status: 403, headers: noStore });
  if (process.env.NODE_ENV === "production" && !process.env.AUTH_URL) return Response.json({ error: "نشانی رسمی سایت پیکربندی نشده است." }, { status: 503, headers: noStore });
  try {
    const origin = request.headers.get("origin");
    if (!origin || new URL(origin).origin !== new URL(process.env.AUTH_URL ?? request.url).origin) return Response.json({ error: "مبدأ درخواست معتبر نیست." }, { status: 403, headers: noStore });
  } catch { return Response.json({ error: "مبدأ درخواست معتبر نیست." }, { status: 403, headers: noStore }); }

  const { orderId } = await params;
  if (!/^[a-zA-Z0-9_-]{1,40}$/.test(orderId)) return Response.json({ error: "شناسهٔ سفارش معتبر نیست." }, { status: 400, headers: noStore });

  try {
    const result = await getPrisma().$transaction(async (tx) => {
      await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "Order" WHERE "id" = ${orderId} FOR UPDATE`;
      const order = await tx.order.findFirst({
        where: { id: orderId, customerId: session.user.id, status: "PENDING_PAYMENT" },
        select: {
          id: true,
          payments: { where: { status: "PENDING" }, select: { id: true, providerReference: true, createdAt: true } },
          vendorOrders: { select: { items: { select: { productId: true, quantity: true } } } },
        },
      });
      if (!order) return { error: "سفارش پرداخت‌نشدهٔ قابل لغو پیدا نشد.", httpStatus: 409 } as const;

      const pendingPayment = order.payments.find((payment) => payment.providerReference !== null);
      if (pendingPayment) return { error: "درگاه هنوز وضعیت پرداخت را نهایی نکرده است؛ تا پایان بررسی نمی‌توان این سفارش را لغو کرد.", httpStatus: 409 } as const;
      const now = new Date();
      const recentInitialization = order.payments.some((payment) => payment.createdAt.getTime() > now.getTime() - 60_000);
      if (recentInitialization) return { error: "درخواست پرداخت در حال آماده‌سازی است؛ یک دقیقه بعد دوباره تلاش کنید.", httpStatus: 409 } as const;
      if (order.payments.length > 0) {
        await tx.payment.updateMany({
          where: { orderId: order.id, status: "PENDING", providerReference: null },
          data: { status: "FAILED", verificationStartedAt: null },
        });
      }

      const cancelled = await tx.order.updateMany({
        where: { id: order.id, customerId: session.user.id, status: "PENDING_PAYMENT", payments: { none: { status: "PENDING" } } },
        data: { status: "CANCELLED", paymentExpiresAt: null },
      });
      if (cancelled.count !== 1) return { error: "وضعیت سفارش هم‌زمان تغییر کرده است.", httpStatus: 409 } as const;

      const quantities = new Map<string, number>();
      for (const vendorOrder of order.vendorOrders) {
        for (const item of vendorOrder.items) quantities.set(item.productId, (quantities.get(item.productId) ?? 0) + item.quantity);
      }
      for (const [productId, quantity] of quantities) {
        await tx.product.updateMany({ where: { id: productId }, data: { stockQuantity: { increment: quantity } } });
      }
      await tx.vendorOrder.updateMany({ where: { orderId: order.id, status: "PENDING_PAYMENT" }, data: { status: "CANCELLED" } });
      return { status: "CANCELLED" } as const;
    }, { isolationLevel: "Serializable", timeout: 15_000 });

    if ("error" in result) return Response.json({ error: result.error }, { status: result.httpStatus, headers: noStore });
    return Response.json(result, { headers: noStore });
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2034") {
      return Response.json({ error: "وضعیت سفارش هم‌زمان تغییر کرد؛ صفحه را تازه کنید و دوباره بررسی کنید." }, { status: 409, headers: noStore });
    }
    console.error("Order cancellation failed.", error);
    return Response.json({ error: "لغو سفارش انجام نشد." }, { status: 503, headers: noStore });
  }
}
