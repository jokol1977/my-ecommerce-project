import type { Metadata } from "next";
import Link from "next/link";
import AdminNavigation from "@/app/admin/admin-navigation";
import { getPrisma } from "@/lib/prisma";
import { requireActiveAdmin } from "@/lib/require-active-admin";

export const metadata: Metadata = { title: "مرکز مدیریت | جانان‌کده" };

const orderStatusLabels: Record<string, string> = {
  PENDING_PAYMENT: "در انتظار پرداخت",
  PAYMENT_REVIEW: "نیازمند بررسی پرداخت",
  PAID: "پرداخت‌شده",
  PROCESSING: "در حال آماده‌سازی",
  SHIPPED: "ارسال‌شده",
  DELIVERED: "تحویل‌شده",
  CANCELLED: "لغوشده",
  REFUNDED: "بازپرداخت‌شده",
};

function OverviewCard({
  href,
  label,
  value,
  detail,
  tone = "slate",
}: {
  href: string;
  label: string;
  value: number;
  detail: string;
  tone?: "slate" | "blue" | "amber" | "rose" | "emerald";
}) {
  const tones = {
    slate: "border-slate-200 bg-white text-slate-900",
    blue: "border-blue-200 bg-blue-50 text-blue-950",
    amber: "border-amber-200 bg-amber-50 text-amber-950",
    rose: "border-rose-300 bg-rose-50 text-rose-950",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-950",
  };

  return (
    <Link href={href} className={`block rounded-2xl border p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${tones[tone]}`}>
      <p className="text-sm font-bold opacity-75">{label}</p>
      <p className="mt-3 text-3xl font-black tabular-nums">{new Intl.NumberFormat("fa-IR").format(value)}</p>
      <p className="mt-2 text-xs leading-6 opacity-75">{detail}</p>
    </Link>
  );
}

export default async function AdminDashboardPage() {
  await requireActiveAdmin();
  const prisma = getPrisma();

  const [pendingVendors, pendingProducts, pendingReviews, paymentReviewOrders, unpaidOrders, fulfillmentOrders, recentAuditRows, recentOrders] = await Promise.all([
    prisma.vendorProfile.count({ where: { status: "PENDING" } }),
    prisma.product.count({ where: { status: "PENDING_REVIEW" } }),
    prisma.productReview.count({ where: { status: "PENDING" } }),
    prisma.order.count({ where: { status: "PAYMENT_REVIEW" } }),
    prisma.order.count({ where: { status: "PENDING_PAYMENT" } }),
    prisma.order.count({ where: { status: { in: ["PAID", "PROCESSING", "SHIPPED"] } } }),
    prisma.$queryRaw<{ count: number }[]>`
      SELECT COUNT(*)::int AS count
      FROM "AdminAuditEvent"
      WHERE "createdAt" >= CURRENT_TIMESTAMP - INTERVAL '30 days'
    `,
    prisma.order.findMany({
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 6,
      select: { id: true, status: true, totalToman: true, createdAt: true },
    }),
  ]);

  const recentAuditEvents = recentAuditRows[0]?.count ?? 0;
  const dateTime = new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Tehran",
  });
  const price = (amount: number) => new Intl.NumberFormat("fa-IR").format(amount);

  return (
    <main dir="rtl" className="min-h-screen bg-slate-50 px-4 py-8 sm:py-10">
      <div className="mx-auto max-w-6xl">
        <AdminNavigation />

        <header className="overflow-hidden rounded-3xl bg-gradient-to-l from-slate-950 via-blue-950 to-indigo-950 p-6 text-white shadow-lg sm:p-9">
          <p className="text-sm font-bold text-blue-200">جانان‌کده · مدیریت فروشگاه</p>
          <div className="mt-3 flex flex-wrap items-end justify-between gap-5">
            <div>
              <h1 className="text-3xl font-black sm:text-4xl">مرکز مدیریت</h1>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-200">وضعیت بررسی‌ها و سفارش‌ها را از اینجا دنبال کنید. بخش پرداخت نیازمند بررسی را پیش از سایر کارها رسیدگی کنید.</p>
            </div>
            <Link href="/account" className="rounded-xl border border-white/20 bg-white/10 px-4 py-3 text-sm font-bold text-white transition hover:bg-white/20">حساب کاربری</Link>
          </div>
        </header>

        {paymentReviewOrders > 0 && (
          <section role="alert" className="mt-6 rounded-2xl border border-rose-300 bg-rose-50 p-5 text-rose-950">
            <p className="font-black">پرداخت نیازمند رسیدگی دستی</p>
            <p className="mt-1 text-sm leading-6">{new Intl.NumberFormat("fa-IR").format(paymentReviewOrders)} سفارش تأیید پرداخت شده اما برای ادامهٔ کار نیازمند بررسی است.</p>
            <Link href="/admin/orders?status=PAYMENT_REVIEW" className="mt-3 inline-block text-sm font-black underline underline-offset-4">مشاهدهٔ سفارش‌های نیازمند بررسی</Link>
          </section>
        )}

        <section aria-label="خلاصهٔ کارهای مدیریتی" className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <OverviewCard href="/admin/vendors" label="درخواست فروشندگی" value={pendingVendors} detail="در انتظار تصمیم مدیر" tone="amber" />
          <OverviewCard href="/admin/products" label="کالاهای در انتظار بررسی" value={pendingProducts} detail="پیش از نمایش عمومی باید تأیید شوند" tone="blue" />
          <OverviewCard href="/admin/reviews" label="دیدگاه‌های در انتظار بررسی" value={pendingReviews} detail="صف بررسی محتوای مشتریان" />
          <OverviewCard href="/admin/orders?status=PENDING_PAYMENT" label="سفارش‌های در انتظار پرداخت" value={unpaidOrders} detail="رزروهای فعال و سفارش‌های پرداخت‌نشده" tone="amber" />
          <OverviewCard href="/admin/orders" label="سفارش‌های در حال انجام" value={fulfillmentOrders} detail="پرداخت‌شده، آماده‌سازی یا ارسال‌شده" tone="emerald" />
          <OverviewCard href="/admin/audit" label="رویدادهای مدیریتی در ۳۰ روز اخیر" value={recentAuditEvents} detail="برای سابقهٔ کامل، گزارش فعالیت را باز کنید" tone="slate" />
        </section>

        <section aria-labelledby="recent-orders-heading" className="mt-9 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4 sm:px-6">
            <div>
              <h2 id="recent-orders-heading" className="font-black text-slate-900">آخرین سفارش‌ها</h2>
              <p className="mt-1 text-xs leading-5 text-slate-500">در این نمای کلی، اطلاعات شخصی خریداران نمایش داده نمی‌شود.</p>
            </div>
            <Link href="/admin/orders" className="text-sm font-bold text-blue-700 hover:underline">همهٔ سفارش‌ها</Link>
          </div>
          {recentOrders.length === 0 ? (
            <p className="px-6 py-8 text-sm text-slate-600">هنوز سفارشی ثبت نشده است.</p>
          ) : (
            <ol className="divide-y divide-slate-100">
              {recentOrders.map((order) => (
                <li key={order.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 sm:px-6">
                  <div>
                    <Link href={`/admin/orders/${encodeURIComponent(order.id)}`} className="font-bold text-slate-900 hover:text-blue-700 hover:underline">سفارش <span dir="ltr" className="font-mono text-sm">{order.id}</span></Link>
                    <p className={`mt-1 text-xs font-bold ${order.status === "PAYMENT_REVIEW" ? "text-rose-700" : "text-slate-500"}`}>{orderStatusLabels[order.status] ?? "در حال بررسی"}</p>
                  </div>
                  <div className="text-left">
                    <p className="font-black text-slate-800">{price(order.totalToman)} تومان</p>
                    <time className="mt-1 block text-xs text-slate-500">{dateTime.format(order.createdAt)}</time>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </main>
  );
}
