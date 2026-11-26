import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getPrisma } from "@/lib/prisma";
import { requireActiveAdmin } from "@/lib/require-active-admin";
import AdminNavigation from "@/app/admin/admin-navigation";

export const metadata: Metadata = { title: "جزئیات سفارش مدیریتی | جانان‌کده" };

const statusLabels: Record<string, string> = {
  PENDING_PAYMENT: "در انتظار پرداخت",
  PAYMENT_REVIEW: "پرداخت نیازمند بررسی",
  PAID: "پرداخت‌شده",
  PROCESSING: "در حال آماده‌سازی",
  SHIPPED: "ارسال‌شده",
  DELIVERED: "تحویل‌شده",
  CANCELLED: "لغوشده",
  REFUNDED: "بازپرداخت‌شده",
};

type AdminOrderDetailProps = { params: Promise<{ orderId: string }> };

export default async function AdminOrderDetailPage({ params }: AdminOrderDetailProps) {
  await requireActiveAdmin();

  const { orderId } = await params;
  if (!/^[a-zA-Z0-9_-]{1,40}$/.test(orderId)) notFound();

  const order = await getPrisma().order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      status: true,
      totalToman: true,
      subtotalToman: true,
      shippingFeeToman: true,
      createdAt: true,
      paymentExpiresAt: true,
      payments: { orderBy: { createdAt: "desc" }, take: 10, select: { provider: true, providerTransactionId: true, amountToman: true, status: true, verifiedAt: true, createdAt: true } },
      recipient: true,
      phone: true,
      province: true,
      city: true,
      addressLine: true,
      buildingNumber: true,
      unit: true,
      postalCode: true,
      vendorOrders: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          status: true,
          subtotalToman: true,
          shippingProvider: true,
          trackingCode: true,
          vendor: { select: { storeName: true } },
          items: { select: { productName: true, quantity: true, unitPriceToman: true } },
        },
      },
    },
  });
  if (!order) notFound();

  const price = (amount: number) => new Intl.NumberFormat("fa-IR").format(amount);
  const dateTime = new Intl.DateTimeFormat("fa-IR-u-ca-persian", { dateStyle: "long", timeStyle: "short", timeZone: "Asia/Tehran" });

  return (
    <main dir="rtl" className="min-h-screen bg-slate-50 px-4 py-10">
      <div className="mx-auto max-w-4xl">
        <AdminNavigation />
        <Link href="/admin/orders" className="text-sm font-bold text-blue-700 hover:underline">بازگشت به مدیریت سفارش‌ها</Link>
        <header className="mt-5 rounded-3xl border border-slate-100 bg-white p-6 shadow-sm sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm font-bold text-amber-700">{statusLabels[order.status] ?? "در حال بررسی"}</p>
              <h1 className="mt-2 text-2xl font-black text-slate-900">جزئیات سفارش</h1>
              <p className="mt-2 text-sm text-slate-500">شناسه: <span dir="ltr" className="font-mono">{order.id}</span></p>
            </div>
            <time className="text-sm text-slate-500">{dateTime.format(order.createdAt)}</time>
          </div>
        </header>

        {order.status === "PAYMENT_REVIEW" && <section className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm font-bold leading-7 text-rose-900" role="alert">زرین‌پال پرداخت را تأیید کرده، اما سفارش خودکار به فروشنده ارجاع نشده است. مبلغ پرداخت در صفحهٔ تطبیق مالی، موجودی و تلاش‌های هم‌زمان را بررسی کنید و در صورت نیاز از پنل زرین‌پال بازپرداخت را انجام دهید؛ این سامانه هنوز بازپرداخت خودکار ندارد.</section>}

        <section aria-labelledby="admin-delivery-heading" className="mt-5 rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <h2 id="admin-delivery-heading" className="font-black text-slate-900">اطلاعات تحویل</h2>
          <p className="mt-3 text-sm leading-7 text-slate-700">گیرنده: {order.recipient} · <span dir="ltr" className="inline-block">{order.phone}</span></p>
          <p className="text-sm leading-7 text-slate-700">{order.province}، {order.city}، {order.addressLine}</p>
          {(order.buildingNumber || order.unit) && <p className="text-sm leading-7 text-slate-700">{order.buildingNumber && <>پلاک {order.buildingNumber}</>}{order.buildingNumber && order.unit && " · "}{order.unit && <>طبقه / واحد {order.unit}</>}</p>}
          <p className="text-sm text-slate-600">کد پستی: <span dir="ltr" className="inline-block font-mono">{order.postalCode}</span></p>
          <p className="mt-3 text-xs leading-6 text-slate-500">این اطلاعات فقط برای رسیدگی به تحویل سفارش در پنل مدیر نمایش داده می‌شود.</p>
        </section>

        <section aria-labelledby="admin-vendor-orders-heading" className="mt-5 space-y-4">
          <h2 id="admin-vendor-orders-heading" className="text-xl font-black text-slate-900">زیرسفارش‌های فروشندگان</h2>
          {order.vendorOrders.map((vendorOrder) => (
            <article key={vendorOrder.id} className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="font-black text-slate-900">{vendorOrder.vendor.storeName}</h3>
                  <p className="mt-1 text-sm font-bold text-blue-700">{statusLabels[vendorOrder.status] ?? "در حال بررسی"}</p>
                </div>
                <p className="font-black text-blue-800">{price(vendorOrder.subtotalToman)} تومان</p>
              </div>
              {vendorOrder.trackingCode && <p className="mt-3 rounded-xl bg-blue-50 p-3 text-sm text-blue-900">{vendorOrder.shippingProvider || "شرکت حمل"} · کد رهگیری <span dir="ltr" className="font-mono">{vendorOrder.trackingCode}</span></p>}
              <ul className="mt-4 divide-y divide-slate-100">
                {vendorOrder.items.map((item, index) => (
                  <li key={`${item.productName}-${index}`} className="flex flex-wrap justify-between gap-2 py-3 text-sm text-slate-700 first:pt-0 last:pb-0">
                    <span>{item.productName} × {price(item.quantity)}</span>
                    <span>{price(item.unitPriceToman * item.quantity)} تومان</span>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </section>

        <section className="mt-5 rounded-2xl border border-slate-100 bg-white p-5 shadow-sm" aria-label="جمع پرداخت سفارش">
          <p className="flex justify-between text-sm text-slate-600"><span>جمع کالاها</span><span>{price(order.subtotalToman)} تومان</span></p>
          <p className="mt-3 flex justify-between text-sm text-slate-600"><span>هزینهٔ ارسال</span><span>{price(order.shippingFeeToman)} تومان</span></p>
          <p className="mt-4 flex justify-between border-t border-slate-100 pt-4 font-black text-slate-900"><span>مبلغ نهایی</span><span>{price(order.totalToman)} تومان</span></p>
          {order.status === "PENDING_PAYMENT" && order.paymentExpiresAt && <p className="mt-4 text-xs leading-6 text-amber-800">سفارش هنوز در انتظار پرداخت است. زمان پایان رزرو فعلی: {dateTime.format(order.paymentExpiresAt)}</p>}
        </section>

        {order.payments.length > 0 && <section aria-labelledby="admin-payment-heading" className="mt-5 rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <h2 id="admin-payment-heading" className="font-black text-slate-900">سوابق پرداخت</h2>
          <ol className="mt-3 divide-y divide-slate-100">
            {order.payments.map((payment, index) => <li key={`${payment.provider}-${index}`} className="flex flex-wrap justify-between gap-2 py-3 text-sm">
              <span>{payment.provider === "ZARINPAL" ? "زرین‌پال" : payment.provider} · {payment.status === "SUCCEEDED" ? "تأییدشده" : payment.status === "FAILED" ? "ناموفق" : payment.status === "REFUNDED" ? "بازپرداخت‌شده" : "در انتظار بررسی"}</span>
              <span>{price(payment.amountToman)} تومان</span>
              {payment.providerTransactionId && <span className="w-full text-xs text-slate-500">شناسهٔ تراکنش: <span dir="ltr" className="font-mono">{payment.providerTransactionId}</span></span>}
              {payment.verifiedAt && <time className="w-full text-xs text-slate-500">تأیید: {dateTime.format(payment.verifiedAt)}</time>}
            </li>)}
          </ol>
        </section>}
      </div>
    </main>
  );
}
