import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getPrisma } from "@/lib/prisma";
import VendorOrderActions from "./order-actions";
import type { OrderStatus as OrderStatusType } from "@/generated/prisma/enums";

export const metadata: Metadata = { title: "سفارش‌های فروشگاه | جانان‌کده" };
const statusLabels = { PAID: "پرداخت‌شده؛ آمادهٔ پردازش", PROCESSING: "در حال آماده‌سازی", SHIPPED: "ارسال‌شده", DELIVERED: "تحویل‌شده" } as const;
const FULFILLMENT_STATUSES = ["PAID", "PROCESSING", "SHIPPED", "DELIVERED"] as const satisfies readonly OrderStatusType[];
const PAGE_SIZE = 25;

type SellerOrdersPageProps = {
  searchParams: Promise<{ page?: string | string[]; orderId?: string | string[]; status?: string | string[] }>;
};

export default async function SellerOrdersPage({ searchParams }: SellerOrdersPageProps) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (session.user.status !== "ACTIVE" || session.user.role !== "VENDOR") redirect("/account");
  const prisma = getPrisma();
  const vendor = await prisma.vendorProfile.findFirst({ where: { userId: session.user.id, status: "ACTIVE" }, select: { id: true, storeName: true } });
  if (!vendor) redirect("/seller/apply");

  const { page: rawPage, orderId: rawOrderId, status: rawStatus } = await searchParams;
  const page = typeof rawPage === "string" && /^[1-9]\d*$/.test(rawPage) ? Number(rawPage) : 1;
  const orderId = typeof rawOrderId === "string" ? rawOrderId.trim() : "";
  const selectedStatus: OrderStatusType | undefined = typeof rawStatus === "string" && FULFILLMENT_STATUSES.some((value) => value === rawStatus)
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
    redirect("/seller/orders");
  }

  const filterQuery = new URLSearchParams();
  if (orderId) filterQuery.set("orderId", orderId);
  if (status) filterQuery.set("status", status);
  const filters = filterQuery.toString();

  const orders = await prisma.vendorOrder.findMany({
    where: {
      vendorId: vendor.id,
      status: selectedStatus ?? { in: [...FULFILLMENT_STATUSES] },
      order: { status: { in: [...FULFILLMENT_STATUSES] }, ...(orderId ? { id: orderId } : {}) },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE + 1,
    select: {
      id: true, status: true, subtotalToman: true, shippingProvider: true, trackingCode: true, shippedAt: true, deliveryConfirmedAt: true,
      order: { select: { id: true, createdAt: true, recipient: true, phone: true, province: true, city: true, addressLine: true, postalCode: true } },
      items: { select: { productName: true, quantity: true, unitPriceToman: true } },
    },
  });
  const hasNextPage = orders.length > PAGE_SIZE;
  const visibleOrders = orders.slice(0, PAGE_SIZE);
  const pageHref = (value: number) => {
    const query = new URLSearchParams(filters);
    if (value > 1) query.set("page", String(value));
    const queryString = query.toString();
    return queryString ? `/seller/orders?${queryString}` : "/seller/orders";
  };

  return <main dir="rtl" className="min-h-screen bg-slate-50 px-4 py-10"><div className="mx-auto max-w-5xl">
    <nav className="flex flex-wrap gap-5 text-sm font-bold text-blue-700"><Link href="/seller" className="hover:underline">پنل فروشنده</Link><Link href="/seller/support" className="hover:underline">درخواست‌های پشتیبانی</Link><Link href="/account" className="hover:underline">حساب کاربری</Link></nav>
    <h1 className="mt-5 text-2xl font-black text-slate-900">سفارش‌های {vendor.storeName}</h1>
    <p className="mt-2 text-sm leading-7 text-slate-600">فقط زیرسفارش‌های همین فروشگاه نمایش داده می‌شوند. سفارش تا پیش از تأیید پرداخت در این فهرست قرار نمی‌گیرد.</p>
    <form action="/seller/orders" method="get" className="mt-6 grid gap-3 rounded-2xl border border-slate-100 bg-white p-4 sm:grid-cols-[1fr_15rem_auto_auto] sm:items-end">
      <label className="text-sm font-bold text-slate-700">شناسهٔ کامل سفارش
        <input name="orderId" defaultValue={orderId} maxLength={40} pattern="[a-zA-Z0-9_-]{1,40}" dir="ltr" className="mt-2 min-h-11 w-full rounded-xl border border-slate-300 px-3 text-left font-normal" />
      </label>
      <label className="text-sm font-bold text-slate-700">وضعیت زیرسفارش
        <select name="status" defaultValue={status} className="mt-2 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 font-normal">
          <option value="">همهٔ وضعیت‌ها</option>
          {FULFILLMENT_STATUSES.map((value) => <option key={value} value={value}>{statusLabels[value]}</option>)}
        </select>
      </label>
      <button type="submit" className="min-h-11 rounded-xl bg-blue-700 px-5 font-bold text-white hover:bg-blue-800">اعمال فیلتر</button>
      <Link href="/seller/orders" className="py-3 text-center text-sm font-bold text-slate-600 hover:text-blue-700">پاک‌کردن</Link>
    </form>
    {visibleOrders.length === 0 ? <p className="mt-7 rounded-2xl bg-white p-8 text-slate-600">{orderId || status ? "سفارشی با این فیلترها پیدا نشد." : "سفارش پرداخت‌شده‌ای برای پردازش ندارید. درگاه پرداخت هنوز فعال نشده است."}</p> : <div className="mt-7 space-y-4">{visibleOrders.map((vendorOrder) => (
      <article key={vendorOrder.id} className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-black text-slate-900">{statusLabels[vendorOrder.status as keyof typeof statusLabels] ?? "وضعیت نامشخص"}</h2><p className="mt-1 text-xs text-slate-500">سفارش <span dir="ltr" className="font-mono">{vendorOrder.order.id}</span> · {new Intl.DateTimeFormat("fa-IR-u-ca-persian", { dateStyle: "long", timeZone: "Asia/Tehran" }).format(vendorOrder.order.createdAt)}</p></div><p className="font-black text-blue-800">{vendorOrder.subtotalToman.toLocaleString("fa-IR")} تومان</p></div>
        {vendorOrder.shippedAt && <p className="mt-3 text-xs text-slate-500">زمان ثبت ارسال: {new Intl.DateTimeFormat("fa-IR-u-ca-persian", { dateStyle: "long", timeStyle: "short", timeZone: "Asia/Tehran" }).format(vendorOrder.shippedAt)}</p>}
        {vendorOrder.deliveryConfirmedAt && <p className="mt-1 text-xs text-slate-500">زمان تأیید دریافت: {new Intl.DateTimeFormat("fa-IR-u-ca-persian", { dateStyle: "long", timeStyle: "short", timeZone: "Asia/Tehran" }).format(vendorOrder.deliveryConfirmedAt)}</p>}
        <div className="mt-4 rounded-xl bg-slate-50 p-4"><h3 className="font-bold text-slate-800">نشانی تحویل</h3><p className="mt-2 text-sm leading-7 text-slate-700">{vendorOrder.order.recipient} · <span dir="ltr">{vendorOrder.order.phone}</span><br />{vendorOrder.order.province}، {vendorOrder.order.city}، {vendorOrder.order.addressLine}<br />کد پستی: {vendorOrder.order.postalCode}</p></div>
        <ul className="mt-4 space-y-2">{vendorOrder.items.map((item, index) => <li key={`${item.productName}-${index}`} className="flex justify-between gap-3 text-sm text-slate-700"><span>{item.productName} × {item.quantity.toLocaleString("fa-IR")}</span><span>{(item.unitPriceToman * item.quantity).toLocaleString("fa-IR")} تومان</span></li>)}</ul>
        {vendorOrder.status === "SHIPPED" && vendorOrder.trackingCode && <p className="mt-4 rounded-lg bg-blue-50 p-3 text-sm font-bold text-blue-900">{vendorOrder.shippingProvider}: کد رهگیری <span dir="ltr" className="font-mono">{vendorOrder.trackingCode}</span></p>}
        {vendorOrder.status !== "SHIPPED" && vendorOrder.status !== "DELIVERED" && <VendorOrderActions vendorOrderId={vendorOrder.id} status={vendorOrder.status} />}
      </article>
    ))}</div>}
    {(page > 1 || hasNextPage) && <nav aria-label="صفحه‌بندی سفارش‌های فروشگاه" className="mt-7 flex justify-between">
      {page > 1 ? <Link href={pageHref(page - 1)} className="rounded-lg bg-white px-4 py-2 text-sm font-bold text-blue-700 shadow-sm">سفارش‌های جدیدتر</Link> : <span />}
      {hasNextPage && <Link href={pageHref(page + 1)} className="rounded-lg bg-white px-4 py-2 text-sm font-bold text-blue-700 shadow-sm">سفارش‌های قدیمی‌تر</Link>}
    </nav>}
  </div></main>;
}
