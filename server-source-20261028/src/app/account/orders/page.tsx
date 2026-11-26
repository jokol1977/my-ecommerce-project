import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getPrisma } from "@/lib/prisma";
import { releaseExpiredOrderReservations } from "@/lib/order-reservations";
import type { OrderStatus as OrderStatusType } from "@/generated/prisma/enums";

export const metadata: Metadata = { title: "سفارش‌های من | جانان‌کده" };
const PAGE_SIZE = 25;
const ORDER_STATUSES = ["PENDING_PAYMENT", "PAYMENT_REVIEW", "PAID", "PROCESSING", "SHIPPED", "DELIVERED", "CANCELLED", "REFUNDED"] as const satisfies readonly OrderStatusType[];

type OrdersPageProps = {
  searchParams: Promise<{ page?: string | string[]; orderId?: string | string[]; status?: string | string[] }>;
};

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

export default async function OrdersPage({ searchParams }: OrdersPageProps) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

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
    redirect("/account/orders");
  }

  const filterQuery = new URLSearchParams();
  if (orderId) filterQuery.set("orderId", orderId);
  if (status) filterQuery.set("status", status);
  const filters = filterQuery.toString();

  const prisma = getPrisma();
  await prisma.$transaction((tx) => releaseExpiredOrderReservations(tx), { timeout: 15_000 });
  const orders = await prisma.order.findMany({
    where: {
      customerId: session.user.id,
      ...(orderId ? { id: orderId } : {}),
      ...(selectedStatus ? { status: selectedStatus } : {}),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE + 1,
    select: {
      id: true,
      status: true,
      totalToman: true,
      createdAt: true,
        vendorOrders: {
          select: {
            id: true,
            status: true,
            vendor: { select: { storeName: true } },
            items: { select: { quantity: true } },
          },
        },
    },
  });

  const hasNextPage = orders.length > PAGE_SIZE;
  const visibleOrders = orders.slice(0, PAGE_SIZE);
  const formatPrice = (amount: number) => new Intl.NumberFormat("fa-IR").format(amount);
  const pageHref = (value: number) => {
    const query = new URLSearchParams(filters);
    if (value > 1) query.set("page", String(value));
    const queryString = query.toString();
    return queryString ? `/account/orders?${queryString}` : "/account/orders";
  };

  return (
    <main dir="rtl" className="min-h-screen bg-slate-50 px-4 py-10">
      <div className="mx-auto max-w-4xl">
        <Link href="/account" className="text-sm font-bold text-blue-700 hover:underline">بازگشت به حساب کاربری</Link>
        <h1 className="mt-4 text-2xl font-black text-slate-900">سفارش‌های من</h1>

        <form action="/account/orders" method="get" className="mt-6 grid gap-3 rounded-2xl border border-slate-100 bg-white p-4 sm:grid-cols-[1fr_15rem_auto_auto] sm:items-end">
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
          <Link href="/account/orders" className="py-3 text-center text-sm font-bold text-slate-600 hover:text-blue-700">پاک‌کردن</Link>
        </form>

        {visibleOrders.length === 0 ? (
          <section className="mt-7 rounded-2xl bg-white p-8 text-center shadow-sm">
            <p className="font-bold text-slate-700">{orderId || status ? "سفارشی با این فیلترها پیدا نشد." : "هنوز سفارشی ثبت نکرده‌اید."}</p>
            {!orderId && !status && <Link href="/" className="mt-4 inline-block rounded-xl bg-blue-700 px-5 py-3 font-bold text-white">رفتن به فروشگاه</Link>}
          </section>
        ) : (
          <div className="mt-7 space-y-4">
            {visibleOrders.map((order) => {
              const itemCount = order.vendorOrders.reduce(
                (total, vendorOrder) => total + vendorOrder.items.reduce((sum, item) => sum + item.quantity, 0),
                0,
              );
              return (
                <article key={order.id} className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <p className="font-black text-slate-900">{statusLabels[order.status] ?? "در حال بررسی"}</p>
                      <p className="mt-2 text-sm text-slate-500">{new Intl.DateTimeFormat("fa-IR-u-ca-persian", { dateStyle: "long", timeZone: "Asia/Tehran" }).format(order.createdAt)}</p>
                      <p className="mt-1 text-sm text-slate-500">{formatPrice(itemCount)} کالا از {formatPrice(order.vendorOrders.length)} فروشنده</p>
                      <ul className="mt-3 flex flex-wrap gap-2" aria-label="وضعیت هر فروشنده">
                        {order.vendorOrders.map((vendorOrder) => (
                          <li key={vendorOrder.id} className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs text-slate-700">
                            <span className="font-bold">{vendorOrder.vendor.storeName}</span> · {statusLabels[vendorOrder.status] ?? "در حال بررسی"}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <p className="font-black text-blue-800">{formatPrice(order.totalToman)} تومان</p>
                  </div>
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
                    <p className="text-xs text-slate-500">شناسه: <span dir="ltr" className="font-mono">{order.id}</span></p>
                    <Link href={`/orders/${encodeURIComponent(order.id)}`} className="rounded-lg bg-blue-50 px-4 py-2 text-sm font-bold text-blue-800 hover:bg-blue-100">مشاهدهٔ جزئیات</Link>
                  </div>
                </article>
              );
            })}
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
