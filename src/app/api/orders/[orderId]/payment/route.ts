import { auth } from "@/auth";
import { getPrisma } from "@/lib/prisma";
import { checkAccountRateLimit } from "@/lib/rate-limit";
import { ORDER_PAYMENT_WINDOW_MS, ORDER_RESERVATION_MAX_AGE_MS, releaseExpiredOrderReservations } from "@/lib/order-reservations";
import { isPaymentAvailable } from "@/lib/payment-config";
import { ZARINPAL_MINIMUM_AMOUNT_TOMAN, ZARINPAL_PROVIDER, createZarinpalPayment, getZarinpalConfiguration, zarinpalCallbackUrl, zarinpalStartPayUrl } from "@/lib/zarinpal";

export const runtime = "nodejs";
const noStore = { "Cache-Control": "no-store" };
const ACTIVE_PAYMENT_STALE_MS = 60_000;

function errorResponse(message: string, status: number, headers: Record<string, string> = {}) {
  return Response.json({ error: message }, { status, headers: { ...noStore, ...headers } });
}

function hasSameOrigin(request: Request) {
  try {
    const origin = request.headers.get("origin");
    const configured = process.env.AUTH_URL;
    return Boolean(origin && configured && new URL(origin).origin === new URL(configured).origin);
  } catch {
    return false;
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return errorResponse("ابتدا وارد حساب شوید.", 401);
  if (session.user.status !== "ACTIVE" || session.user.role !== "CUSTOMER") return errorResponse("دسترسی مشتری فعال لازم است.", 403);
  if (!isPaymentAvailable()) return errorResponse("پرداخت آنلاین در این محیط فعال نیست.", 503);
  if (!hasSameOrigin(request)) return errorResponse("مبدأ درخواست معتبر نیست.", 403);

  const { orderId } = await params;
  if (!/^[a-zA-Z0-9_-]{1,40}$/.test(orderId)) return errorResponse("شناسهٔ سفارش معتبر نیست.", 400);

  const rateLimit = await checkAccountRateLimit("payment-start", session.user.id, 10, 60 * 60);
  if (!rateLimit.allowed) {
    return errorResponse("درخواست‌های پرداخت بیش از حد مجاز است؛ کمی بعد دوباره تلاش کنید.", 429, { "Retry-After": String(rateLimit.retryAfterSeconds) });
  }

  const configuration = getZarinpalConfiguration();
  if (!configuration) return errorResponse("تنظیم امن زرین‌پال کامل نیست؛ پرداخت فعلاً غیرفعال است.", 503);

  const prisma = getPrisma();
  const now = new Date();
  const staleBefore = new Date(now.getTime() - ACTIVE_PAYMENT_STALE_MS);
  type StartDecision =
    | { kind: "new"; paymentId: string; amountToman: number; reservationHardEnd: Date }
    | { kind: "redirect"; redirectUrl: string }
    | { kind: "verify"; redirectUrl: string }
    | { kind: "processing" }
    | { kind: "error"; message: string; status: number };

  let decision: StartDecision;
  try {
    decision = await prisma.$transaction(async (tx): Promise<StartDecision> => {
      await releaseExpiredOrderReservations(tx, now);
      await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "Order" WHERE "id" = ${orderId} FOR UPDATE`;

      const order = await tx.order.findFirst({
        where: { id: orderId, customerId: session.user.id },
        select: { id: true, status: true, totalToman: true, paymentExpiresAt: true, createdAt: true },
      });
      if (!order) return { kind: "error", message: "سفارش پیدا نشد یا متعلق به این حساب نیست.", status: 404 };
      if (order.status === "PAYMENT_REVIEW") return { kind: "error", message: "پرداخت این سفارش در حال بررسی مدیر است.", status: 409 };
      if (order.status !== "PENDING_PAYMENT") return { kind: "error", message: "این سفارش در انتظار پرداخت نیست.", status: 409 };
      if (!order.paymentExpiresAt || order.paymentExpiresAt <= now) return { kind: "error", message: "مهلت پرداخت سفارش تمام شده است؛ سبد خرید را دوباره ثبت کنید.", status: 409 };
      if (order.totalToman < ZARINPAL_MINIMUM_AMOUNT_TOMAN) {
        return { kind: "error", message: `حداقل مبلغ پرداخت زرین‌پال ${new Intl.NumberFormat("fa-IR").format(ZARINPAL_MINIMUM_AMOUNT_TOMAN)} تومان است.`, status: 400 };
      }

      const completed = await tx.payment.findFirst({ where: { orderId, status: "SUCCEEDED" }, select: { id: true } });
      if (completed) return { kind: "error", message: "پرداخت این سفارش قبلاً تأیید شده است.", status: 409 };

      const active = await tx.payment.findFirst({
        where: { orderId, status: "PENDING" },
        orderBy: { createdAt: "desc" },
        select: { id: true, provider: true, providerReference: true, verificationStartedAt: true, createdAt: true, amountToman: true },
      });
      if (active) {
        if (active.provider !== ZARINPAL_PROVIDER) return { kind: "error", message: "برای این سفارش یک تلاش پرداخت فعال وجود دارد.", status: 409 };
        if (active.providerReference) {
          if (active.verificationStartedAt && active.verificationStartedAt > staleBefore) return { kind: "processing" };
          const callback = new URL(zarinpalCallbackUrl(configuration));
          callback.searchParams.set("Authority", active.providerReference);
          callback.searchParams.set("Status", "OK");
          if (active.verificationStartedAt) return { kind: "verify", redirectUrl: callback.toString() };
          return { kind: "redirect", redirectUrl: zarinpalStartPayUrl(configuration, active.providerReference) };
        }
        if (active.createdAt > staleBefore) return { kind: "processing" };
        await tx.payment.updateMany({ where: { id: active.id, status: "PENDING", providerReference: null }, data: { status: "FAILED" } });
      }

      const reservationHardEnd = new Date(order.createdAt.getTime() + ORDER_RESERVATION_MAX_AGE_MS);
      const paymentExpiresAt = new Date(Math.min(now.getTime() + ORDER_PAYMENT_WINDOW_MS, reservationHardEnd.getTime()));
      if (paymentExpiresAt <= now) return { kind: "error", message: "مهلت رزرو سفارش تمام شده است؛ سبد خرید را دوباره ثبت کنید.", status: 409 };
      const payment = await tx.payment.create({
        data: { orderId, provider: ZARINPAL_PROVIDER, amountToman: order.totalToman, status: "PENDING" },
        select: { id: true },
      });
      await tx.order.update({ where: { id: orderId }, data: { paymentExpiresAt } });
      return { kind: "new", paymentId: payment.id, amountToman: order.totalToman, reservationHardEnd };
    }, { isolationLevel: "Serializable", timeout: 15_000 });
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2034") {
      return errorResponse("وضعیت سفارش هم‌زمان تغییر کرد؛ صفحه را تازه کنید و دوباره تلاش کنید.", 409);
    }
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") {
      return errorResponse("برای این سفارش یک پرداخت فعال ایجاد شده است؛ صفحه را تازه کنید.", 409);
    }
    console.error("Payment initialization could not prepare an attempt.");
    return errorResponse("آماده‌سازی پرداخت انجام نشد. دوباره تلاش کنید.", 503);
  }

  if (decision.kind === "error") return errorResponse(decision.message, decision.status);
  if (decision.kind === "processing") return Response.json({ status: "processing" }, { status: 202, headers: noStore });
  if (decision.kind === "redirect" || decision.kind === "verify") {
    return Response.json({ status: decision.kind, redirectUrl: decision.redirectUrl }, { headers: noStore });
  }

  try {
    const created = await createZarinpalPayment({ configuration, amountToman: decision.amountToman, orderId });
    const authoritySavedAt = new Date();
    const paymentExpiresAt = new Date(Math.min(authoritySavedAt.getTime() + ORDER_PAYMENT_WINDOW_MS, decision.reservationHardEnd.getTime()));
    if (paymentExpiresAt <= authoritySavedAt) throw new Error("Order reservation expired before the gateway authority was stored.");
    await prisma.$transaction(async (tx) => {
      const saved = await tx.payment.updateMany({
        where: { id: decision.paymentId, status: "PENDING", providerReference: null },
        data: { providerReference: created.authority },
      });
      if (saved.count !== 1) throw new Error("Payment attempt changed before the gateway authority was stored.");
      const orderSaved = await tx.order.updateMany({
        where: { id: orderId, customerId: session.user.id, status: "PENDING_PAYMENT", paymentExpiresAt: { gt: authoritySavedAt } },
        data: { paymentExpiresAt },
      });
      if (orderSaved.count !== 1) throw new Error("Order changed before the gateway authority was stored.");
    }, { isolationLevel: "Serializable", timeout: 10_000 });
    return Response.json({ status: "redirect", redirectUrl: created.redirectUrl }, { headers: noStore });
  } catch {
    await prisma.payment.updateMany({ where: { id: decision.paymentId, status: "PENDING", providerReference: null }, data: { status: "FAILED" } }).catch(() => undefined);
    console.error("ZarinPal could not start the payment or the payment reference could not be stored.");
    return errorResponse("درگاه پرداخت پاسخ قابل‌استفاده‌ای نداد. صفحه را تازه کنید و وضعیت سفارش را بررسی کنید.", 503);
  }
}
