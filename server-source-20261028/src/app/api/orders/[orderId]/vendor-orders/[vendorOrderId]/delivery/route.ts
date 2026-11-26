import { auth } from "@/auth";
import { getPrisma } from "@/lib/prisma";

export const runtime = "nodejs";
const noStore = { "Cache-Control": "no-store" };

export async function POST(
  request: Request,
  { params }: { params: Promise<{ orderId: string; vendorOrderId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "ابتدا وارد حساب شوید." }, { status: 401, headers: noStore });
  if (session.user.status !== "ACTIVE" || session.user.role !== "CUSTOMER") return Response.json({ error: "دسترسی مشتری فعال لازم است." }, { status: 403, headers: noStore });
  if (process.env.NODE_ENV === "production" && !process.env.AUTH_URL) return Response.json({ error: "نشانی رسمی سایت پیکربندی نشده است." }, { status: 503, headers: noStore });
  try {
    const origin = request.headers.get("origin");
    if (!origin || new URL(origin).origin !== new URL(process.env.AUTH_URL ?? request.url).origin) return Response.json({ error: "مبدأ درخواست معتبر نیست." }, { status: 403, headers: noStore });
  } catch { return Response.json({ error: "مبدأ درخواست معتبر نیست." }, { status: 403, headers: noStore }); }

  const { orderId, vendorOrderId } = await params;
  if (!/^[a-zA-Z0-9_-]{1,40}$/.test(orderId) || !/^[a-zA-Z0-9_-]{1,40}$/.test(vendorOrderId)) {
    return Response.json({ error: "شناسهٔ سفارش معتبر نیست." }, { status: 400, headers: noStore });
  }

  try {
    const result = await getPrisma().$transaction(async (tx) => {
      const order = await tx.order.findFirst({
        where: { id: orderId, customerId: session.user.id, status: { in: ["PROCESSING", "SHIPPED"] } },
        select: { id: true },
      });
      if (!order) return { error: "سفارش فعال متعلق به این حساب پیدا نشد.", httpStatus: 404 } as const;

      const updated = await tx.vendorOrder.updateMany({
        where: { id: vendorOrderId, orderId: order.id, status: "SHIPPED" },
        data: { status: "DELIVERED", deliveryConfirmedAt: new Date() },
      });
      if (updated.count !== 1) return { error: "این بخش از سفارش ارسال‌شده نیست یا قبلاً تأیید شده است.", httpStatus: 409 } as const;

      const siblings = await tx.vendorOrder.findMany({ where: { orderId: order.id }, select: { status: true } });
      const allDelivered = siblings.length > 0 && siblings.every((item) => item.status === "DELIVERED");
      const allShipped = siblings.length > 0 && siblings.every((item) => item.status === "SHIPPED" || item.status === "DELIVERED");
      const anyInProgress = siblings.some((item) => item.status === "PROCESSING" || item.status === "SHIPPED" || item.status === "DELIVERED");
      const status = allDelivered ? "DELIVERED" : allShipped ? "SHIPPED" : anyInProgress ? "PROCESSING" : "PAID";
      await tx.order.updateMany({ where: { id: order.id, status: { in: ["PROCESSING", "SHIPPED"] } }, data: { status } });
      return { status } as const;
    }, { isolationLevel: "Serializable", timeout: 15_000 });

    if ("error" in result) return Response.json({ error: result.error }, { status: result.httpStatus, headers: noStore });
    return Response.json(result, { headers: noStore });
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2034") {
      return Response.json({ error: "وضعیت سفارش هم‌زمان تغییر کرد؛ صفحه را تازه کنید و دوباره بررسی کنید." }, { status: 409, headers: noStore });
    }
    console.error("Delivery confirmation failed.", error);
    return Response.json({ error: "تأیید دریافت سفارش انجام نشد." }, { status: 503, headers: noStore });
  }
}
