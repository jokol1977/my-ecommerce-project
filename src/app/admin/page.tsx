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

type OverviewTone = "attention" | "catalog" | "orders" | "reports";

const overviewTones: Record<OverviewTone, string> = {
  attention: "border-[#ead6c7] hover:border-[#c88966]",
  catalog: "border-[#d8e2d7] hover:border-[#91ad91]",
  orders: "border-[#e5dfd1] hover:border-[#b9a988]",
  reports: "border-[#dddce8] hover:border-[#aaa8c2]",
};

const overviewDots: Record<OverviewTone, string> = {
  attention: "bg-[#c36745]",
  catalog: "bg-[#638365]",
  orders: "bg-[#a78b58]",
  reports: "bg-[#77748f]",
};

function formatNumber(value: number) {
  return new Intl.NumberFormat("fa-IR").format(value);
}

function OverviewCard({
  href,
  label,
  value,
  detail,
  tag,
  tone = "orders",
}: {
  href: string;
  label: string;
  value: number;
  detail: string;
  tag: string;
  tone?: OverviewTone;
}) {
  return (
    <Link
      href={href}
      className={
        "admin-dashboard-card group flex min-h-[13.5rem] flex-col rounded-[1.4rem] border bg-[#fffefa] p-5 shadow-[0_7px_22px_rgba(52,64,48,0.045)] transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_14px_30px_rgba(52,64,48,0.09)] focus-visible:outline-[#cc6745] " +
        overviewTones[tone]
      }
    >
      <div className="flex items-center justify-between gap-3">
        <span className="inline-flex items-center gap-2 text-xs font-bold text-[#847c6d]">
          <span aria-hidden="true" className={"h-2 w-2 rounded-full " + overviewDots[tone]} />
          {tag}
        </span>
        <span
          aria-hidden="true"
          className="grid h-8 w-8 place-items-center rounded-full bg-[#f4f1e9] text-sm font-black text-[#596958] transition group-hover:bg-[#eaf0e7]"
        >
          ←
        </span>
      </div>

      <p className="mt-5 text-sm font-black leading-6 text-[#344238]">{label}</p>
      <div className="mt-2 flex items-end gap-2">
        <span className="text-4xl font-black leading-none tabular-nums text-[#24372d]">
          {formatNumber(value)}
        </span>
        <span className="pb-0.5 text-xs font-bold text-[#8b8578]">مورد</span>
      </div>
      <p className="mt-3 text-xs leading-6 text-[#77776d]">{detail}</p>
      <span className="mt-auto pt-4 text-xs font-black text-[#45644d] transition group-hover:text-[#233c31]">
        بازکردن این بخش
      </span>
    </Link>
  );
}

export default async function AdminDashboardPage() {
  await requireActiveAdmin();
  const prisma = getPrisma();

  const [
    pendingVendors,
    pendingProducts,
    pendingReviews,
    paymentReviewOrders,
    unpaidOrders,
    fulfillmentOrders,
    recentAuditRows,
    recentOrders,
  ] = await Promise.all([
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
  const queueCount = pendingVendors + pendingProducts + pendingReviews + paymentReviewOrders;
  const dateTime = new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Tehran",
  });
  const price = (amount: number) => formatNumber(amount);

  return (
    <main dir="rtl" className="admin-dashboard min-h-screen px-4 py-6 text-[#29372e] sm:px-6 sm:py-8 lg:px-8">
      <div dir="ltr" className="admin-dashboard-layout">
        <AdminNavigation dashboard />
        <div dir="rtl" className="admin-dashboard-main mx-auto max-w-7xl">

        <header className="admin-dashboard-hero relative isolate overflow-hidden rounded-[2rem] bg-[linear-gradient(118deg,#1d3027_0%,#294638_57%,#3b6049_100%)] px-6 py-7 text-white shadow-[0_22px_54px_rgba(35,60,49,0.18)] sm:px-8 sm:py-9">
          <div aria-hidden="true" className="absolute -left-14 -top-24 -z-10 h-64 w-64 rounded-full border border-white/10" />
          <div aria-hidden="true" className="absolute -bottom-36 left-1/3 -z-10 h-72 w-72 rounded-full border border-white/10" />
          <div aria-hidden="true" className="admin-dashboard-hero-scene">
            <span className="admin-dashboard-hero-scene-tile" />
            <span className="admin-dashboard-hero-scene-orbit" />
          </div>
          <div className="admin-dashboard-hero-content flex flex-col justify-between gap-7 lg:flex-row lg:items-end">
            <div className="max-w-2xl">
              <p className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-bold text-[#efe6d4]">
                <span aria-hidden="true" className="h-2 w-2 rounded-full bg-[#d8a277]" />
                جانان‌کده · مرکز عملیات
              </p>
              <h1 className="mt-4 text-3xl font-black tracking-tight sm:text-4xl">نمای کلی بازارگاه</h1>
              <p className="mt-3 max-w-xl text-sm leading-7 text-white/80">
                صف‌های بررسی، سفارش‌های جاری و رویدادهای مدیریتی را از یک نقطه دنبال کنید.
              </p>
            </div>

            <div className="flex flex-wrap items-end justify-between gap-4 lg:justify-end">
              <div className="min-w-44 rounded-2xl border border-white/15 bg-white/10 px-4 py-3">
                <span className="block text-[11px] font-bold text-white/65">بخش‌های مدیریتی</span>
                <span className="mt-1 block text-sm font-black text-white">سفارش · کالا · پشتیبانی</span>
              </div>
              <div className="flex gap-2">
                <Link
                  href="/admin/readiness"
                  className="inline-flex min-h-11 items-center rounded-xl bg-[#f3ead8] px-4 text-sm font-black text-[#314438] transition hover:bg-white focus-visible:outline-white"
                >
                  آمادگی انتشار
                </Link>
                <Link
                  href="/account"
                  className="inline-flex min-h-11 items-center rounded-xl border border-white/20 bg-white/10 px-4 text-sm font-bold text-white transition hover:bg-white/20 focus-visible:outline-white"
                >
                  حساب مدیر
                </Link>
              </div>
            </div>
          </div>
        </header>

        {paymentReviewOrders > 0 && (
          <section role="alert" className="mt-5 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[#e8b7a7] bg-[#fff2ed] px-5 py-4 text-[#713b2a]">
            <div>
              <p className="font-black">پرداخت نیازمند رسیدگی دستی</p>
              <p className="mt-1 text-sm leading-6">
                {formatNumber(paymentReviewOrders)} سفارش برای بررسی وضعیت پرداخت در صف است.
              </p>
            </div>
            <Link href="/admin/orders?status=PAYMENT_REVIEW" className="rounded-xl bg-[#8e4933] px-4 py-2.5 text-sm font-black text-white transition hover:bg-[#753b2a]">
              رسیدگی به پرداخت‌ها
            </Link>
          </section>
        )}

        <section aria-labelledby="review-queue-heading" className="mt-8">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs font-black text-[#9b7652]">اولویت کارها</p>
              <h2 id="review-queue-heading" className="mt-1 text-xl font-black text-[#29372e] sm:text-2xl">
                صف‌های نیازمند بررسی
              </h2>
            </div>
            <span className="rounded-full border border-[#e5ddcf] bg-[#fffefa] px-3.5 py-2 text-xs font-bold text-[#716d62]">
              {formatNumber(queueCount)} مورد در صف
            </span>
          </div>

          <div className="admin-dashboard-card-grid grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <OverviewCard
              href="/admin/orders?status=PAYMENT_REVIEW"
              label="پرداخت‌های نیازمند بررسی"
              value={paymentReviewOrders}
              detail="مواردی که وضعیت پرداخت آن‌ها نیاز به رسیدگی مدیر دارد."
              tag="اولویت بالا"
              tone="attention"
            />
            <OverviewCard
              href="/admin/vendors"
              label="درخواست فروشندگی"
              value={pendingVendors}
              detail="درخواست‌های در انتظار تصمیم مدیر."
              tag="فروشندگان"
              tone="attention"
            />
            <OverviewCard
              href="/admin/products"
              label="کالاهای در انتظار بررسی"
              value={pendingProducts}
              detail="پیش از نمایش عمومی باید بررسی شوند."
              tag="کاتالوگ"
              tone="catalog"
            />
            <OverviewCard
              href="/admin/reviews"
              label="دیدگاه‌های در انتظار بررسی"
              value={pendingReviews}
              detail="صف بررسی محتوای ثبت‌شده توسط مشتریان."
              tag="محتوا"
              tone="catalog"
            />
          </div>

          {queueCount === 0 && (
            <p role="status" className="mt-3 rounded-2xl border border-[#d5e1d3] bg-[#eef5eb] px-5 py-4 text-sm font-bold leading-7 text-[#38563d]">
              همهٔ صف‌های بررسی خالی‌اند. وضعیت‌ها به‌محض ثبت مورد تازه در همین‌جا دیده می‌شوند.
            </p>
          )}
        </section>

        <section aria-labelledby="operations-heading" className="mt-8">
          <div className="mb-4">
            <p className="text-xs font-black text-[#9b7652]">نمای روزانه</p>
            <h2 id="operations-heading" className="mt-1 text-xl font-black text-[#29372e] sm:text-2xl">
              سفارش و سابقهٔ مدیریت
            </h2>
          </div>
          <div className="admin-dashboard-card-grid grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <OverviewCard
              href="/admin/orders?status=PENDING_PAYMENT"
              label="سفارش‌های در انتظار پرداخت"
              value={unpaidOrders}
              detail="سفارش‌های پرداخت‌نشده و رزروهای فعال."
              tag="سفارش‌ها"
              tone="orders"
            />
            <OverviewCard
              href="/admin/orders"
              label="سفارش‌های در حال انجام"
              value={fulfillmentOrders}
              detail="پرداخت‌شده، آماده‌سازی یا ارسال‌شده."
              tag="پیگیری"
              tone="orders"
            />
            <OverviewCard
              href="/admin/audit"
              label="رویدادهای مدیریتی"
              value={recentAuditEvents}
              detail="رویدادهای ثبت‌شده در ۳۰ روز اخیر."
              tag="۳۰ روز اخیر"
              tone="reports"
            />
          </div>
        </section>

        <section aria-labelledby="recent-orders-heading" className="mt-8 overflow-hidden rounded-[1.6rem] border border-[#e7dfd0] bg-[#fffefa] shadow-[0_10px_28px_rgba(52,64,48,0.05)]">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#eee8dc] px-5 py-4 sm:px-6">
            <div>
              <p className="text-xs font-black text-[#9b7652]">پیگیری</p>
              <h2 id="recent-orders-heading" className="mt-1 text-lg font-black text-[#29372e]">آخرین سفارش‌ها</h2>
              <p className="mt-1 text-xs leading-5 text-[#77776d]">اطلاعات شخصی خریداران در این نمای کلی نمایش داده نمی‌شود.</p>
            </div>
            <Link href="/admin/orders" className="rounded-xl border border-[#d8e2d9] bg-[#f3f7f1] px-4 py-2.5 text-sm font-black text-[#315343] transition hover:bg-[#e9f1e7]">
              همهٔ سفارش‌ها <span aria-hidden="true">←</span>
            </Link>
          </div>

          {recentOrders.length === 0 ? (
            <div className="flex flex-col items-start justify-between gap-4 px-5 py-7 sm:flex-row sm:items-center sm:px-6">
              <div className="flex items-start gap-3">
                <span aria-hidden="true" className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[#f3f0e7] text-lg text-[#667560]">◇</span>
                <div>
                  <p className="font-black text-[#3a473d]">هنوز سفارشی ثبت نشده است.</p>
                  <p className="mt-1 text-sm leading-6 text-[#77776d]">وقتی سفارش جدیدی ایجاد شود، وضعیت و زمان آن در این بخش نمایش داده می‌شود.</p>
                </div>
              </div>
              <Link href="/admin/products" className="text-sm font-black text-[#45644d] underline decoration-[#b9c8b6] underline-offset-4 hover:text-[#233c31]">
                رفتن به بررسی کالاها
              </Link>
            </div>
          ) : (
            <ol className="divide-y divide-[#eee8dc]">
              {recentOrders.map((order) => (
                <li key={order.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 transition hover:bg-[#faf8f2] sm:px-6">
                  <div>
                    <Link href={"/admin/orders/" + encodeURIComponent(order.id)} className="font-bold text-[#29372e] hover:text-[#49684f] hover:underline">
                      سفارش <span dir="ltr" className="font-mono text-sm">{order.id}</span>
                    </Link>
                    <p className={"mt-1 text-xs font-bold " + (order.status === "PAYMENT_REVIEW" ? "text-[#a14832]" : "text-[#77776d]")}>
                      {orderStatusLabels[order.status] ?? "در حال بررسی"}
                    </p>
                  </div>
                  <div className="text-left">
                    <p className="font-black text-[#344238]">{price(order.totalToman)} تومان</p>
                    <time className="mt-1 block text-xs text-[#8b8578]">{dateTime.format(order.createdAt)}</time>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>
        </div>
      </div>
    </main>
  );
}
