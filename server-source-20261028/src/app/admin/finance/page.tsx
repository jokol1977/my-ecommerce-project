import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getPrisma } from "@/lib/prisma";
import { requireActiveAdmin } from "@/lib/require-active-admin";
import AdminNavigation from "@/app/admin/admin-navigation";

export const metadata: Metadata = { title: "دفتر ثبت پرداخت‌ها | مدیریت جانان‌کده" };

const PAGE_SIZE = 50;
type AdminFinancePageProps = { searchParams: Promise<{ page?: string | string[] }> };

const accountLabels: Record<string, string> = {
  GATEWAY_CLEARING: "وجوه تأییدشده نزد درگاه",
  UNALLOCATED_ORDER_FUNDS: "وجوه سفارشِ تخصیص‌نیافته",
};

export default async function AdminFinancePage({ searchParams }: AdminFinancePageProps) {
  await requireActiveAdmin();
  const { page: rawPage } = await searchParams;
  const page = typeof rawPage === "string" && /^[1-9]\d*$/.test(rawPage) ? Number(rawPage) : 1;
  if (!Number.isSafeInteger(page) || page > 1000 || Array.isArray(rawPage) || (rawPage !== undefined && String(page) !== rawPage)) {
    redirect("/admin/finance");
  }

  const prisma = getPrisma();
  const [entries, count, total, unmatchedCount] = await Promise.all([
    prisma.ledgerTransfer.findMany({
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE + 1,
      select: {
        id: true,
        eventType: true,
        debitAccount: true,
        creditAccount: true,
        amountToman: true,
        orderId: true,
        payment: { select: { provider: true, providerTransactionId: true, verifiedAt: true } },
        createdAt: true,
      },
    }),
    prisma.ledgerTransfer.count(),
    prisma.ledgerTransfer.aggregate({ _sum: { amountToman: true } }),
    prisma.payment.count({
      where: { provider: "zarinpal", status: "SUCCEEDED", ledgerTransfers: { none: {} } },
    }),
  ]);

  const hasNextPage = entries.length > PAGE_SIZE;
  const visibleEntries = entries.slice(0, PAGE_SIZE);
  if (visibleEntries.length === 0 && page > 1) redirect("/admin/finance");
  const pageHref = (value: number) => value === 1 ? "/admin/finance" : `/admin/finance?page=${value}`;
  const toman = new Intl.NumberFormat("fa-IR");
  const dateTime = new Intl.DateTimeFormat("fa-IR-u-ca-persian", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Tehran" });

  return (
    <main dir="rtl" className="min-h-screen bg-slate-50 px-4 py-10">
      <div className="mx-auto max-w-6xl">
        <AdminNavigation />
        <h1 className="mt-5 text-2xl font-black text-slate-900">دفتر ثبت پرداخت‌های تأییدشده</h1>
        <p className="mt-2 max-w-4xl text-sm leading-7 text-slate-600">
          این گزارش فقط ثبت داخلی پرداخت‌هایی است که پاسخ آن‌ها از زرین‌پال تأیید شده است؛ ماندهٔ نقدی، طلب فروشنده یا مبلغ قابل‌تسویه را نشان نمی‌دهد.
          هر ثبت به‌صورت تغییرناپذیر و هم‌زمان با تأیید پرداخت ذخیره می‌شود.
        </p>

        <section aria-label="خلاصه دفتر" className="mt-6 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
            <p className="text-sm font-bold text-slate-600">تعداد ثبت‌ها</p>
            <p className="mt-2 text-2xl font-black text-slate-900">{toman.format(count)}</p>
          </div>
          <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
            <p className="text-sm font-bold text-slate-600">جمع مبلغ ثبت‌شده</p>
            <p className="mt-2 text-2xl font-black text-slate-900">{toman.format(total._sum.amountToman ?? 0)} <span className="text-sm">تومان</span></p>
          </div>
          <div className={`rounded-2xl border p-5 shadow-sm ${unmatchedCount ? "border-rose-200 bg-rose-50" : "border-emerald-100 bg-emerald-50"}`}>
            <p className="text-sm font-bold text-slate-700">پرداخت موفق بدون ثبت دفترکل</p>
            <p className="mt-2 text-2xl font-black text-slate-900">{toman.format(unmatchedCount)}</p>
          </div>
        </section>

        <Link href="/admin/finance/reconciliation" className="mt-5 inline-flex rounded-xl bg-slate-900 px-4 py-3 text-sm font-bold text-white hover:bg-slate-700">
          بررسی موارد تطبیق پرداخت
        </Link>

        {unmatchedCount > 0 && (
          <p role="alert" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm leading-7 text-rose-900">
            برای این پرداخت‌ها تطبیق لازم است. پیش از هر اقدام مالی، جزئیات پرداخت در پنل زرین‌پال و سفارش متناظر را بررسی کنید.
          </p>
        )}

        {visibleEntries.length === 0 ? (
          <p className="mt-6 rounded-2xl bg-white p-8 text-slate-600">هنوز پرداخت تأییدشده‌ای در دفتر ثبت نشده است.</p>
        ) : (
          <div className="mt-6 space-y-3">
            {visibleEntries.map((entry) => (
              <article key={entry.id} className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="font-black text-slate-900">دریافت تأییدشده از زرین‌پال</h2>
                    <p className="mt-1 text-sm text-slate-600">سفارش <Link href={`/admin/orders/${encodeURIComponent(entry.orderId)}`} className="font-mono font-bold text-blue-700 hover:underline" dir="ltr">{entry.orderId}</Link></p>
                    <p className="mt-1 text-xs leading-6 text-slate-500">بدهکار: {accountLabels[entry.debitAccount]} · بستانکار: {accountLabels[entry.creditAccount]}</p>
                    <p className="mt-1 text-xs text-slate-500">شناسهٔ تراکنش درگاه: <span dir="ltr" className="font-mono">{entry.payment.providerTransactionId ?? "ثبت نشده"}</span></p>
                  </div>
                  <div className="text-left sm:text-right">
                    <p className="font-black text-slate-900">{toman.format(entry.amountToman)} تومان</p>
                    <time className="mt-1 block text-xs text-slate-500">{dateTime.format(entry.payment.verifiedAt ?? entry.createdAt)}</time>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}

        {(page > 1 || hasNextPage) && (
          <nav aria-label="صفحه‌بندی دفتر پرداخت" className="mt-6 flex justify-between">
            {page > 1 ? <Link href={pageHref(page - 1)} className="rounded-lg bg-white px-4 py-2 text-sm font-bold text-blue-700 shadow-sm">ثبت‌های جدیدتر</Link> : <span />}
            {hasNextPage && <Link href={pageHref(page + 1)} className="rounded-lg bg-white px-4 py-2 text-sm font-bold text-blue-700 shadow-sm">ثبت‌های قدیمی‌تر</Link>}
          </nav>
        )}
      </div>
    </main>
  );
}
