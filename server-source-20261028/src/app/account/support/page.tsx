import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getPrisma } from "@/lib/prisma";
import { SUPPORT_CASE_CATEGORY_LABELS, SUPPORT_CASE_STATUS_LABELS } from "@/lib/support-case-labels";

export const metadata: Metadata = { title: "درخواست‌های پشتیبانی | جانان‌کده" };
const PAGE_SIZE = 25;

type CustomerSupportPageProps = { searchParams: Promise<{ page?: string | string[] }> };

export default async function CustomerSupportPage({ searchParams }: CustomerSupportPageProps) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (session.user.status !== "ACTIVE" || session.user.role !== "CUSTOMER") redirect("/account");

  const { page: rawPage } = await searchParams;
  const page = typeof rawPage === "string" && /^[1-9]\d*$/.test(rawPage) ? Number(rawPage) : 1;
  if (!Number.isSafeInteger(page) || page > 1000 || Array.isArray(rawPage) || (rawPage !== undefined && String(page) !== rawPage)) redirect("/account/support");

  const cases = await getPrisma().supportCase.findMany({
    where: { customerId: session.user.id },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE + 1,
    select: {
      id: true,
      category: true,
      status: true,
      updatedAt: true,
      vendorOrder: { select: { order: { select: { id: true } }, vendor: { select: { storeName: true } } } },
    },
  });
  const hasNextPage = cases.length > PAGE_SIZE;
  const visibleCases = cases.slice(0, PAGE_SIZE);
  if (visibleCases.length === 0 && page > 1) redirect("/account/support");
  const pageHref = (value: number) => value === 1 ? "/account/support" : `/account/support?page=${value}`;

  return (
    <main dir="rtl" className="min-h-screen bg-slate-50 px-4 py-10">
      <div className="mx-auto max-w-4xl">
        <Link href="/account" className="text-sm font-bold text-blue-700 hover:underline">بازگشت به حساب کاربری</Link>
        <h1 className="mt-5 text-2xl font-black text-slate-900">درخواست‌های پشتیبانی من</h1>
        <p className="mt-2 text-sm leading-7 text-slate-600">برای ثبت درخواست تازه، از صفحهٔ جزئیات سفارش اقدام کنید. پرونده‌های هر فروشگاه جداگانه پیگیری می‌شوند.</p>
        {visibleCases.length === 0 ? (
          <section className="mt-6 rounded-2xl bg-white p-7 shadow-sm">
            <p className="text-slate-700">هنوز درخواست پشتیبانی ثبت نکرده‌اید.</p>
            <Link href="/account/orders" className="mt-4 inline-block rounded-xl bg-blue-700 px-5 py-3 font-bold text-white hover:bg-blue-800">رفتن به سفارش‌های من</Link>
          </section>
        ) : (
          <div className="mt-6 space-y-3">
            {visibleCases.map((supportCase) => (
              <article key={supportCase.id} className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="font-black text-slate-900">{SUPPORT_CASE_CATEGORY_LABELS[supportCase.category]}</h2>
                    <p className="mt-1 text-sm text-slate-600">فروشگاه {supportCase.vendorOrder.vendor.storeName} · سفارش <span dir="ltr" className="inline-block font-mono">{supportCase.vendorOrder.order.id}</span></p>
                  </div>
                  <span className="rounded-full bg-blue-50 px-3 py-1.5 text-sm font-bold text-blue-800">{SUPPORT_CASE_STATUS_LABELS[supportCase.status]}</span>
                </div>
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
                  <time className="text-xs text-slate-500">آخرین به‌روزرسانی: {new Intl.DateTimeFormat("fa-IR-u-ca-persian", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Tehran" }).format(supportCase.updatedAt)}</time>
                  <Link href={`/support/cases/${encodeURIComponent(supportCase.id)}`} className="font-bold text-blue-700 hover:underline">مشاهدهٔ گفتگو</Link>
                </div>
              </article>
            ))}
          </div>
        )}
        {(page > 1 || hasNextPage) && <nav aria-label="صفحه‌بندی درخواست‌های پشتیبانی" className="mt-6 flex justify-between">
          {page > 1 ? <Link href={pageHref(page - 1)} className="rounded-lg bg-white px-4 py-2 text-sm font-bold text-blue-700 shadow-sm">درخواست‌های جدیدتر</Link> : <span />}
          {hasNextPage && <Link href={pageHref(page + 1)} className="rounded-lg bg-white px-4 py-2 text-sm font-bold text-blue-700 shadow-sm">درخواست‌های قدیمی‌تر</Link>}
        </nav>}
      </div>
    </main>
  );
}
