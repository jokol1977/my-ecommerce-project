import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getPrisma } from "@/lib/prisma";
import { requireActiveAdmin } from "@/lib/require-active-admin";
import AdminNavigation from "@/app/admin/admin-navigation";

export const metadata: Metadata = { title: "گزارش فعالیت مدیران | جانان‌کده" };

const PAGE_SIZE = 50;
const targetLabels: Record<string, string> = {
  CATEGORY: "دسته‌بندی",
  VENDOR: "فروشگاه",
  PRODUCT: "کالا",
  PRODUCT_REVIEW: "دیدگاه",
  SUPPORT_CASE: "درخواست پشتیبانی",
};
const actionLabels: Record<string, string> = {
  CATEGORY_CREATED: "ایجاد دسته‌بندی",
  CATEGORY_ACTIVATED: "فعال‌کردن دسته‌بندی",
  CATEGORY_DEACTIVATED: "غیرفعال‌کردن دسته‌بندی",
  VENDOR_APPROVED: "تأیید فروشنده",
  VENDOR_REJECTED: "رد درخواست فروشندگی",
  PRODUCT_APPROVED: "تأیید کالا",
  PRODUCT_REJECTED: "رد کالا",
  REVIEW_APPROVED: "تأیید دیدگاه",
  REVIEW_REJECTED: "رد دیدگاه",
  SUPPORT_CASE_UNDER_REVIEW: "ارجاع درخواست پشتیبانی به بررسی مدیر",
  SUPPORT_CASE_WAITING_FOR_VENDOR: "انتظار پاسخ فروشنده در درخواست پشتیبانی",
  SUPPORT_CASE_WAITING_FOR_CUSTOMER: "انتظار پاسخ مشتری در درخواست پشتیبانی",
  SUPPORT_CASE_RESOLVED: "حل درخواست پشتیبانی",
  ZARINPAL_PAYMENT_REQUIRES_REVIEW: "پرداخت زرین‌پال نیازمند رسیدگی دستی",
};
targetLabels.ORDER = "سفارش";

type AdminAuditPageProps = {
  searchParams: Promise<{ page?: string | string[] }>;
};

export default async function AdminAuditPage({ searchParams }: AdminAuditPageProps) {
  await requireActiveAdmin();

  const { page: rawPage } = await searchParams;
  const page = typeof rawPage === "string" && /^[1-9]\d*$/.test(rawPage) ? Number(rawPage) : 1;
  if (!Number.isSafeInteger(page) || page > 1000 || Array.isArray(rawPage) || (rawPage !== undefined && String(page) !== rawPage)) {
    redirect("/admin/audit");
  }

  const events = await getPrisma().adminAuditEvent.findMany({
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE + 1,
    select: {
      id: true,
      action: true,
      targetType: true,
      targetId: true,
      createdAt: true,
      actor: { select: { email: true } },
    },
  });
  const hasNextPage = events.length > PAGE_SIZE;
  const visibleEvents = events.slice(0, PAGE_SIZE);
  if (visibleEvents.length === 0 && page > 1) redirect("/admin/audit");
  const dateTime = new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Tehran",
  });
  const pageHref = (value: number) => value === 1 ? "/admin/audit" : `/admin/audit?page=${value}`;

  return (
    <main dir="rtl" className="min-h-screen bg-slate-50 px-4 py-10">
      <div className="mx-auto max-w-5xl">
        <AdminNavigation />
        <h1 className="mt-5 text-2xl font-black text-slate-900">گزارش فعالیت مدیران</h1>
        <p className="mt-2 text-sm leading-7 text-slate-600">تأییدها و تغییرهای مهم مدیریتی همراه با حساب مدیر ثبت می‌شوند. متن دیدگاه‌ها و گفت‌وگوهای پشتیبانی، نشانی مشتریان و رمزها در این گزارش ذخیره نمی‌شوند.</p>

        {visibleEvents.length === 0 ? (
          <p className="mt-7 rounded-2xl bg-white p-8 text-slate-600">هنوز رویداد مدیریتی ثبت نشده است.</p>
        ) : (
          <div className="mt-7 overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
            <ol className="divide-y divide-slate-100">
              {visibleEvents.map((event) => (
                <li key={event.id} className="flex flex-col gap-2 p-5 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-bold text-slate-900">{actionLabels[event.action] ?? "رویداد مدیریتی"}</p>
                    <p className="mt-1 text-sm text-slate-600">عامل: <span dir="ltr" className="inline-block">{event.actor?.email ?? (event.action.startsWith("ZARINPAL_") ? "سامانه" : "حساب حذف‌شده")}</span></p>
                    <p className="mt-1 text-xs text-slate-500">هدف: {targetLabels[event.targetType] ?? "رکورد"} · شناسه: <span dir="ltr" className="font-mono">{event.targetId}</span></p>
                  </div>
                  <time className="shrink-0 text-sm text-slate-500">{dateTime.format(event.createdAt)}</time>
                </li>
              ))}
            </ol>
          </div>
        )}

        {(page > 1 || hasNextPage) && (
          <nav aria-label="صفحه‌بندی گزارش فعالیت مدیران" className="mt-7 flex justify-between">
            {page > 1 ? <Link href={pageHref(page - 1)} className="rounded-lg bg-white px-4 py-2 text-sm font-bold text-blue-700 shadow-sm">صفحهٔ قبلی</Link> : <span />}
            {hasNextPage && <Link href={pageHref(page + 1)} className="rounded-lg bg-white px-4 py-2 text-sm font-bold text-blue-700 shadow-sm">صفحهٔ بعدی</Link>}
          </nav>
        )}
      </div>
    </main>
  );
}
