import { connection } from "next/server";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { getPrisma } from "@/lib/prisma";
import { releaseExpiredOrderReservations } from "@/lib/order-reservations";
import { isLiveCheckoutGateEnabled } from "@/lib/marketplace-config";
import { isPaymentAvailable } from "@/lib/payment-config";
import Link from "next/link";
import DeliveryConfirmation from "./delivery-confirmation";
import CancelOrder from "./cancel-order";
import StartPayment from "./start-payment";
import NewSupportCaseForm from "./new-support-case-form";
import PaymentReceipt from "./payment-receipt";
import { SUPPORT_CASE_ORDER_STATUSES } from "@/lib/support-cases";
import { SUPPORT_CASE_CATEGORY_LABELS, SUPPORT_CASE_STATUS_LABELS } from "@/lib/support-case-labels";

const statusLabels: Record<string, string> = { PENDING_PAYMENT: "در انتظار پرداخت", PAYMENT_REVIEW: "پرداخت نیازمند بررسی", PAID: "پرداخت‌شده", PROCESSING: "در حال آماده‌سازی", SHIPPED: "ارسال‌شده", DELIVERED: "تحویل‌شده", CANCELLED: "لغوشده", REFUNDED: "بازپرداخت‌شده" };
const paymentNotices: Record<string, string> = {
  success: "پرداخت با موفقیت از زرین‌پال تأیید شد.",
  failed: "پرداخت تأیید نشد. در صورت کسر وجه، وضعیت را دوباره بررسی کنید یا با پشتیبانی تماس بگیرید.",
  processing: "تأیید پرداخت هنوز کامل نشده است. وضعیت این صفحه را تازه کنید.",
  review: "زرین‌پال پرداخت را تأیید کرده، اما وضعیت سفارش نیازمند بررسی مدیر است. تا پایان بررسی، فروشنده سفارش را ارسال نمی‌کند.",
};

type OrderPageProps = { params: Promise<{ orderId: string }>; searchParams: Promise<{ payment?: string | string[] }> };

export async function generateMetadata() {
  return { title: "جزئیات سفارش | جانان‌کده" };
}

export default async function OrderPage({ params, searchParams }: OrderPageProps) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  await connection();
  const [{ orderId }, query] = await Promise.all([params, searchParams]);

  const prisma = getPrisma();
  await prisma.$transaction((tx) => releaseExpiredOrderReservations(tx), { timeout: 15_000 });
  const order = await prisma.order.findFirst({
    where: { id: orderId, customerId: session.user.id },
    select: {
      id: true,
      status: true,
      subtotalToman: true,
      shippingFeeToman: true,
      totalToman: true,
      createdAt: true,
      paymentExpiresAt: true,
      payments: { orderBy: { createdAt: "desc" }, take: 5, select: { status: true, provider: true, verifiedAt: true } },
      recipient: true,
      phone: true,
      province: true,
      city: true,
      addressLine: true,
      postalCode: true,
      vendorOrders: {
        select: {
          id: true,
          status: true,
          shippedAt: true,
          deliveryConfirmedAt: true,
          vendor: { select: { storeName: true } },
          shippingProvider: true,
          trackingCode: true,
          items: { select: { productName: true, quantity: true, unitPriceToman: true } },
          supportCases: {
            orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
            take: 5,
            select: { id: true, category: true, status: true, updatedAt: true },
          },
        },
      },
    },
  });
  if (!order) notFound();

  const [confirmedPayments, paymentSummary] = await Promise.all([
    prisma.payment.findMany({
      where: { orderId: order.id, status: "SUCCEEDED", verifiedAt: { not: null } },
      orderBy: { verifiedAt: "desc" },
      take: 10,
      select: { provider: true, providerTransactionId: true, amountToman: true, verifiedAt: true },
    }),
    prisma.payment.aggregate({
      where: { orderId: order.id, status: "SUCCEEDED", verifiedAt: { not: null } },
      _sum: { amountToman: true },
      _count: { _all: true },
    }),
  ]);
  const price = (amount: number) => new Intl.NumberFormat("fa-IR").format(amount);
  const dateTime = (value: Date) => new Intl.DateTimeFormat("fa-IR-u-ca-persian", { dateStyle: "long", timeStyle: "short", timeZone: "Asia/Tehran" }).format(value);
  const paymentAvailable = isPaymentAvailable();
  const liveCheckoutGateEnabled = isLiveCheckoutGateEnabled();
  const hasPendingPayment = order.payments.some((payment) => payment.status === "PENDING");
  const paymentNotice = typeof query.payment === "string" ? paymentNotices[query.payment] : undefined;
  const canOpenSupportCase = new Set<string>(SUPPORT_CASE_ORDER_STATUSES).has(order.status);
  return (
    <main dir="rtl" className="min-h-screen bg-slate-50 px-4 py-10">
      <div className="mx-auto max-w-3xl rounded-3xl border border-slate-100 bg-white p-6 shadow-sm sm:p-9">
        <p className="text-sm font-bold text-amber-700">{statusLabels[order.status] ?? "در حال بررسی"}</p>
        <h1 className="mt-2 text-2xl font-black text-slate-900">سفارش ثبت شد</h1>
        <p className="mt-3 text-sm leading-7 text-slate-600">شناسهٔ سفارش: <span dir="ltr" className="font-mono">{order.id}</span></p>
        <p className="mt-2 text-sm text-slate-600">زمان ثبت: {new Intl.DateTimeFormat("fa-IR-u-ca-persian", { dateStyle: "long", timeStyle: "short", timeZone: "Asia/Tehran" }).format(order.createdAt)}</p>
        {paymentNotice && <p role="status" className="mt-4 rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm font-bold leading-7 text-blue-950">{paymentNotice}</p>}

        <section aria-labelledby="delivery-address-heading" className="mt-6 rounded-2xl border border-slate-100 bg-slate-50 p-4">
          <h2 id="delivery-address-heading" className="font-black text-slate-900">نشانی تحویل ثبت‌شده برای این سفارش</h2>
          <p className="mt-3 text-sm leading-7 text-slate-700">{order.recipient} · <span dir="ltr" className="inline-block">{order.phone}</span></p>
          <p className="text-sm leading-7 text-slate-700">{order.province}، {order.city}، {order.addressLine}</p>
          <p className="text-sm text-slate-600">کد پستی: <span dir="ltr" className="inline-block font-mono">{order.postalCode}</span></p>
        </section>

        <div className="mt-7 space-y-5">
          {order.vendorOrders.map((vendorOrder) => (
            <section key={vendorOrder.vendor.storeName} className="rounded-2xl bg-slate-50 p-4">
              <h2 className="font-black">فروشنده: {vendorOrder.vendor.storeName} · {statusLabels[vendorOrder.status] ?? "در حال بررسی"}</h2>
              {vendorOrder.shippedAt && <p className="mt-2 text-xs text-slate-500">زمان ثبت ارسال: {dateTime(vendorOrder.shippedAt)}</p>}
              {vendorOrder.deliveryConfirmedAt && <p className="mt-1 text-xs text-slate-500">زمان تأیید دریافت: {dateTime(vendorOrder.deliveryConfirmedAt)}</p>}
              {vendorOrder.trackingCode && <p className="mt-2 text-sm text-blue-800">{vendorOrder.shippingProvider}: کد رهگیری <span dir="ltr" className="font-mono">{vendorOrder.trackingCode}</span></p>}
              {vendorOrder.status === "SHIPPED" && <DeliveryConfirmation orderId={order.id} vendorOrderId={vendorOrder.id} />}
              <ul className="mt-3 space-y-3">
                {vendorOrder.items.map((item, index) => (
                  <li key={`${item.productName}-${index}`} className="flex flex-wrap justify-between gap-2 text-sm text-slate-700">
                    <span>{item.productName} × {price(item.quantity)}</span>
                    <span>{price(item.unitPriceToman * item.quantity)} تومان</span>
                  </li>
                ))}
              </ul>
              {vendorOrder.supportCases.length > 0 && <div className="mt-5 border-t border-slate-200 pt-4">
                <h3 className="font-bold text-slate-800">درخواست‌های پشتیبانی این فروشگاه</h3>
                <ul className="mt-2 space-y-2">
                  {vendorOrder.supportCases.map((supportCase) => <li key={supportCase.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span className="text-slate-600">{SUPPORT_CASE_CATEGORY_LABELS[supportCase.category]} · {SUPPORT_CASE_STATUS_LABELS[supportCase.status]}</span>
                    <Link href={`/support/cases/${encodeURIComponent(supportCase.id)}`} className="font-bold text-blue-700 hover:underline">پیگیری گفتگو</Link>
                  </li>)}
                </ul>
              </div>}
              {canOpenSupportCase && <NewSupportCaseForm vendorOrderId={vendorOrder.id} />}
            </section>
          ))}
        </div>

        <p className="mt-6 flex justify-between border-t border-slate-100 pt-5 font-black"><span>مبلغ سفارش</span><span>{price(order.totalToman)} تومان</span></p>
        {confirmedPayments.length > 0 && (
          <PaymentReceipt
            order={{
              id: order.id,
              createdAt: order.createdAt.toISOString(),
              subtotalToman: order.subtotalToman,
              shippingFeeToman: order.shippingFeeToman,
              totalToman: order.totalToman,
              vendorOrders: order.vendorOrders.map((vendorOrder) => ({
                id: vendorOrder.id,
                vendorName: vendorOrder.vendor.storeName,
                items: vendorOrder.items,
              })),
            }}
            payments={confirmedPayments.flatMap((payment) => payment.verifiedAt
              ? [{ ...payment, verifiedAt: payment.verifiedAt.toISOString() }]
              : [])}
            capturedTotalToman={paymentSummary._sum.amountToman ?? 0}
            confirmedPaymentCount={paymentSummary._count._all}
          />
        )}
        {order.status === "PAYMENT_REVIEW" && <p className="mt-5 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm font-bold leading-7 text-rose-900">پرداخت در زرین‌پال تأیید شده، اما سفارش به‌دلیل وضعیت موجودی یا تلاش پرداخت هم‌زمان متوقف شده است. مدیر باید سفارش یا بازپرداخت را بررسی کند؛ این سفارش به فروشنده ارسال نمی‌شود.</p>}
        {order.status === "PENDING_PAYMENT" && paymentAvailable && <StartPayment orderId={order.id} hasPendingPayment={hasPendingPayment} />}
        {order.status === "PENDING_PAYMENT" && !paymentAvailable && <p className="mt-5 rounded-xl bg-amber-50 p-4 text-sm leading-7 text-amber-900">{!liveCheckoutGateEnabled ? "پرداخت واقعی تا تکمیل فرآیندهای فروش، بازگشت وجه و تسویه فعال نمی‌شود." : "زرین‌پال در این محیط هنوز پیکربندی نشده است. در حالت توسعه سفارش محلی ثبت می‌شود، اما پرداخت انجام نمی‌گیرد."}{order.paymentExpiresAt && <> موجودی تا {new Intl.DateTimeFormat("fa-IR-u-ca-persian", { dateStyle: "long", timeStyle: "short", timeZone: "Asia/Tehran" }).format(order.paymentExpiresAt)} رزرو است.</>}</p>}
        {order.status === "PENDING_PAYMENT" && <CancelOrder orderId={order.id} />}
        <Link href="/account/support" className="mr-4 mt-6 inline-block text-sm font-bold text-indigo-700 hover:underline">مشاهدهٔ همهٔ درخواست‌های پشتیبانی</Link>
        <Link href="/account/orders" className="mt-6 inline-block text-sm font-bold text-blue-700 hover:underline">بازگشت به سفارش‌های من</Link>
      </div>
    </main>
  );
}
