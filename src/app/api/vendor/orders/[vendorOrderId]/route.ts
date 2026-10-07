import { auth } from "@/auth";
import { getPrisma } from "@/lib/prisma";
import { enqueueOrderSmsNotification } from "@/lib/sms-outbox";
import { readRequestBody } from "@/lib/request-body";

export const runtime = "nodejs";
const noStore = { "Cache-Control": "no-store" };

export async function PATCH(request: Request, { params }: { params: Promise<{ vendorOrderId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "ابتدا وارد حساب شوید." }, { status: 401, headers: noStore });
  if (session.user.status !== "ACTIVE" || session.user.role !== "VENDOR") return Response.json({ error: "دسترسی فروشندهٔ فعال لازم است." }, { status: 403, headers: noStore });
  if (process.env.NODE_ENV === "production" && !process.env.AUTH_URL) return Response.json({ error: "نشانی رسمی سایت پیکربندی نشده است." }, { status: 503, headers: noStore });
  try {
    const origin = request.headers.get("origin");
    if (!origin || new URL(origin).origin !== new URL(process.env.AUTH_URL ?? request.url).origin) return Response.json({ error: "مبدأ درخواست معتبر نیست." }, { status: 403, headers: noStore });
  } catch { return Response.json({ error: "مبدأ درخواست معتبر نیست." }, { status: 403, headers: noStore }); }
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) return Response.json({ error: "قالب درخواست معتبر نیست." }, { status: 415, headers: noStore });

  let data: Record<string, unknown>;
  try {
    const body = await readRequestBody(request, 2048);
    if (body === null) return Response.json({ error: "درخواست بیش از حد بزرگ است." }, { status: 413, headers: noStore });
    const parsed: unknown = JSON.parse(body);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new Error("invalid");
    data = parsed as Record<string, unknown>;
  } catch { return Response.json({ error: "اطلاعات درخواست معتبر نیست." }, { status: 400, headers: noStore }); }
  if (data.action !== "process" && data.action !== "ship") return Response.json({ error: "عملیات معتبر نیست." }, { status: 400, headers: noStore });

  const shippingProvider = typeof data.shippingProvider === "string" ? data.shippingProvider.normalize("NFKC").trim() : "";
  const trackingCode = typeof data.trackingCode === "string" ? data.trackingCode.normalize("NFKC").trim() : "";
  if (data.action === "ship" && ((shippingProvider.length === 0) !== (trackingCode.length === 0) || shippingProvider.length > 80 || trackingCode.length > 80 || /[\u0000-\u001f\u007f]/.test(shippingProvider + trackingCode))) {
    return Response.json({ error: "برای کد رهگیری، نام شرکت ارسال را هم وارد کنید؛ هر دو مورد حداکثر ۸۰ نویسه باشند." }, { status: 400, headers: noStore });
  }

  const { vendorOrderId } = await params;
  if (!/^[a-zA-Z0-9_-]{1,40}$/.test(vendorOrderId)) return Response.json({ error: "شناسهٔ سفارش فروشنده معتبر نیست." }, { status: 400, headers: noStore });

  try {
    const result = await getPrisma().$transaction(async (tx) => {
      const vendor = await tx.vendorProfile.findFirst({
        where: { userId: session.user.id, status: "ACTIVE", user: { status: "ACTIVE", role: "VENDOR" } },
        select: { id: true },
      });
      if (!vendor) return { error: "فروشگاه فعال پیدا نشد.", httpStatus: 403 } as const;

      const vendorOrder = await tx.vendorOrder.findFirst({
        where: { id: vendorOrderId, vendorId: vendor.id },
        select: { id: true, status: true, orderId: true, order: { select: { status: true } } },
      });
      if (!vendorOrder) return { error: "سفارش این فروشگاه پیدا نشد.", httpStatus: 404 } as const;
      if (vendorOrder.order.status !== "PAID" && vendorOrder.order.status !== "PROCESSING") {
        return { error: "فقط سفارش پرداخت‌شده قابل آماده‌سازی است.", httpStatus: 409 } as const;
      }

      const expected = data.action === "process" ? "PAID" : "PROCESSING";
      const next = data.action === "process" ? "PROCESSING" : "SHIPPED";
      if (vendorOrder.status !== expected) return { error: "وضعیت سفارش تغییر کرده است؛ صفحه را تازه کنید.", httpStatus: 409 } as const;
      const updated = await tx.vendorOrder.updateMany({
        where: { id: vendorOrder.id, vendorId: vendor.id, status: expected, order: { status: { in: ["PAID", "PROCESSING"] } } },
        data: {
          status: next,
          ...(data.action === "ship" ? {
            shippingProvider: shippingProvider || null,
            trackingCode: trackingCode || null,
            shippedAt: new Date(),
          } : {}),
        },
      });
      if (updated.count !== 1) return { error: "سفارش هم‌زمان تغییر کرده است؛ صفحه را تازه کنید.", httpStatus: 409 } as const;

      const siblings = await tx.vendorOrder.findMany({ where: { orderId: vendorOrder.orderId }, select: { status: true } });
      const allShipped = siblings.every((entry) => entry.status === "SHIPPED" || entry.status === "DELIVERED");
      const anyInProgress = siblings.some((entry) => entry.status === "PROCESSING" || entry.status === "SHIPPED" || entry.status === "DELIVERED");
      const orderStatus = allShipped ? "SHIPPED" : anyInProgress ? "PROCESSING" : "PAID";
      await tx.order.updateMany({ where: { id: vendorOrder.orderId, status: { in: ["PAID", "PROCESSING", "SHIPPED"] } }, data: { status: orderStatus } });
      if (data.action === "ship") {
        await enqueueOrderSmsNotification(tx, {
          eventType: "VENDOR_ORDER_SHIPPED",
          orderId: vendorOrder.orderId,
          vendorOrderId: vendorOrder.id,
        });
      }
      return { status: next } as const;
    }, { isolationLevel: "Serializable", timeout: 15_000 });

    if ("error" in result) return Response.json({ error: result.error }, { status: result.httpStatus, headers: noStore });
    return Response.json(result, { headers: noStore });
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2034") return Response.json({ error: "درخواست هم‌زمان دیگری وضعیت سفارش را تغییر داد؛ صفحه را تازه کنید." }, { status: 409, headers: noStore });
    console.error("Vendor fulfillment update failed.", error);
    return Response.json({ error: "به‌روزرسانی سفارش انجام نشد." }, { status: 503, headers: noStore });
  }
}
