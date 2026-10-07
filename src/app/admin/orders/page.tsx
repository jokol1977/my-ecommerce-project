import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getPrisma } from "@/lib/prisma";
import { requireActiveAdmin } from "@/lib/require-active-admin";
import AdminNavigation from "@/app/admin/admin-navigation";
import type { OrderStatus as OrderStatusType } from "@/generated/prisma/enums";

export const metadata: Metadata = { title: "مدیریت سفارش‌ها | جانان‌کده" };

const PAGE_SIZE = 25;
const ORDER_STATUSES = ["PENDING_PAYMENT", "PAYMENT_REVIEW", "PAID", "PROCESSING", "SHIPPED", "DELIVERED", "CANCELLED", "REFUNDED"] as const satisfies readonly OrderStatusType[];
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

type AdminOrdersPageProps = {
  searchParams: Promise<{ page?: string | string[]; orderId?: string | string[]; status?: string | string[] }>;
};

export default async function AdminOrdersPage({ searchParams }: AdminOrdersPageProps) {
  await requireActiveAdmin();

  const { page: rawPage, orderId: rawOrderId, status: rawStatus } = await searchParams;
  const page = typeof rawPage === "string" && /^[1-9]\d*$/.test(rawPage) ? Number(rawPage) : 1;
  const orderId = typeof rawOrderId === "string" ? rawOrderId.trim() : "";
  const selectedStatus: OrderStatusType | undefined = typeof rawStatus === "string" && ORDER_STATUSES.some((value) => value === rawStatus)
    ? rawStatus as OrderStatusType
    : undefined;
  const status = selectedStatus ?? "";
  if (
    !Number.isSafeInteger(page) || page > 1000 ||
    Array.isArray(rawPage) || Array.isArray(rawOrderId) || Array.isArray(rawStatus) ||
    (rawPage !== undefined && String(page) !== rawPage) ||
    (rawOrderId !== undefined && (!/^[a-zA-Z0-9_-]{1,40}$/.test(orderId) || orderId !== rawOrderId)) ||
    (rawStatus !== undefined && !selectedStatus)
  ) {
    redirect("/admin/orders");
  }

  const filterQuery = new URLSearchParams();
  if (orderId) filterQuery.set("orderId", orderId);
  if (status) filterQuery.set("status", status);
  const filters = filterQuery.toString();
  const orders = await getPrisma().order.findMany({
    where: { ...(orderId ? { id: orderId } : {}), ...(selectedStatus ? { status: selectedStatus } : {}) },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE + 1,
    select: {
      id: true,
      status: true,
      totalToman: true,
      createdAt: true,
      vendorOrders: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          status: true,
          subtotalToman: true,
          vendor: { select: { storeName: true } },
          items: { select: { productName: true, quantity: true } },
        },
      },
    },
  });

  const hasNextPage = orders.length > PAGE_SIZE;
  const visibleOrders = orders.slice(0, PAGE_SIZE);
  const price = (amount: number) => new Intl.NumberFormat("fa-IR").format(amount);
  const pageHref = (value: number) => {
    const query = new URLSearchParams(filters);
    if (value > 1) query.set("page", String(value));
    const queryString = query.toString();
    return queryString ? `/admin/orders?${queryString}` : "/admin/orders";
  };

  return (
    <main dir="rtl" className="min-h-screen bg-slate-50 px-4 py-10">
      <div className="mx-auto max-w-5xl">
        <AdminNavigation />
        <h1 className="mt-5 text-2xl font-black text-slate-900">مدیریت سفارش‌ها</h1>
        <p className="mt-2 text-sm leading-7 text-slate-600">وضعیت سفارش و سهم هر فروشگاه را بررسی کنید. اطلاعات نشانی و تماس خریداران در این فهرست نمایش داده نمی‌شود.</p>

        <form action="/admin/orders" method="get" className="mt-6 grid gap-3 rounded-2xl border border-slate-100 bg-white p-4 sm:grid-cols-[1fr_15rem_auto_auto] sm:items-end">
          <label className="text-sm font-bold text-slate-700">شناسهٔ کامل سفارش
            <input name="orderId" defaultValue={orderId} maxLength={40} pattern="[a-zA-Z0-9_-]{1,40}" dir="ltr" className="mt-2 min-h-11 w-full rounded-xl border border-slate-300 px-3 text-left font-normal" />
          </label>
          <label className="text-sm font-bold text-slate-700">وضعیت سفارش
            <select name="status" defaultValue={status} className="mt-2 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 font-normal">
              <option value="">همهٔ وضعیت‌ها</option>
              {ORDER_STATUSES.map((value) => <option key={value} value={value}>{statusLabels[value]}</option>)}
            </select>
          </label>
          <button type="submit" className="min-h-11 rounded-xl bg-blue-700 px-5 font-bold text-white hover:bg-blue-800">اعمال فیلتر</button>
          <Link href="/admin/orders" className="py-3 text-center text-sm font-bold text-slate-600 hover:text-blue-700">پاک‌کردن</Link>
        </form>

        {visibleOrders.length === 0 ? (
          <p className="mt-7 rounded-2xl bg-white p-8 text-slate-600">{orderId || status ? "سفارشی با این فیلترها پیدا نشد." : "هنوز سفارشی ثبت نشده است."}</p>
        ) : (
          <div className="mt-7 space-y-4">
            {visibleOrders.map((order) => (
              <article key={order.id} className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className={`font-black ${order.status === "PAYMENT_REVIEW" ? "text-rose-800" : "text-slate-900"}`}>{statusLabels[order.status] ?? "در حال بررسی"}</h2>
                    {order.status === "PAYMENT_REVIEW" && <p className="mt-1 text-xs font-bold text-rose-700">تأیید پرداخت دریافت شده؛ پیش از هر اقدام، وضعیت موجودی و بازپرداخت را بررسی کنید.</p>}
                    <p className="mt-1 text-xs text-slate-500">شناسه: <span dir="ltr" className="font-mono">{order.id}</span></p>
                  </div>
                  <div className="text-left">
                    <p className="font-black text-blue-800">{price(order.totalToman)} تومان</p>
                    <time className="mt-1 block text-xs text-slate-500">{new Intl.DateTimeFormat("fa-IR-u-ca-persian", { dateStyle: "long", timeStyle: "short", timeZone: "Asia/Tehran" }).format(order.createdAt)}</time>
                  </div>
                </div>

                <div className="mt-4 space-y-3 border-t border-slate-100 pt-4">
                  {order.vendorOrders.map((vendorOrder) => (
                    <section key={vendorOrder.id} className="rounded-xl bg-slate-50 p-4">
                      <div className="flex flex-wrap justify-between gap-2 text-sm">
                        <h3 className="font-bold text-slate-800">{vendorOrder.vendor.storeName} · {statusLabels[vendorOrder.status] ?? "در حال بررسی"}</h3>
                        <span className="font-bold text-slate-700">{price(vendorOrder.subtotalToman)} تومان</span>
                      </div>
                      <ul className="mt-2 space-y-1 text-sm text-slate-600">
                        {vendorOrder.items.map((item, index) => <li key={`${item.productName}-${index}`}>{item.productName} × {price(item.quantity)}</li>)}
                      </ul>
                    </section>
                  ))}
                </div>
                <Link href={`/admin/orders/${encodeURIComponent(order.id)}`} className="mt-4 inline-block text-sm font-bold text-blue-700 hover:underline">مشاهدهٔ نشانی و جزئیات ارسال</Link>
              </article>
            ))}
          </div>
        )}

        <nav aria-label="صفحه‌بندی سفارش‌ها" className="mt-7 flex justify-between">
          {page > 1 ? <Link href={pageHref(page - 1)} className="rounded-lg bg-white px-4 py-2 text-sm font-bold text-blue-700 shadow-sm">سفارش‌های جدیدتر</Link> : <span />}
          {hasNextPage && <Link href={pageHref(page + 1)} className="rounded-lg bg-white px-4 py-2 text-sm font-bold text-blue-700 shadow-sm">سفارش‌های قدیمی‌تر</Link>}
        </nav>
      </div>
    </main>
  );
}
