import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getPrisma } from "@/lib/prisma";
import { requireActiveAdmin } from "@/lib/require-active-admin";
import AdminNavigation from "@/app/admin/admin-navigation";

export const metadata: Metadata = { title: "تطبیق پرداخت‌ها | مدیریت جانان‌کده" };

const PAGE_SIZE = 30;
const ISSUE_TYPES = ["missing-ledger", "ledger-mismatch", "duplicate-capture"] as const;
type IssueType = (typeof ISSUE_TYPES)[number];
type ReconciliationPageProps = { searchParams: Promise<{ issue?: string | string[]; page?: string | string[] }> };

type LedgerMismatch = {
  id: string;
  paymentId: string;
  orderId: string;
  paymentOrderId: string;
  amountToman: number;
  paymentAmountToman: number;
  debitAccount: string;
  creditAccount: string;
  eventType: string;
  provider: string;
  paymentStatus: string;
  orderTotalToman: number;
  orderStatus: string;
  providerTransactionId: string | null;
  verifiedAt: Date | null;
  createdAt: Date;
  issues: string;
};

type DuplicateCapture = {
  orderId: string;
  orderStatus: string;
  orderTotalToman: number;
  paymentCount: number;
  paymentTotalToman: bigint;
};

const issueTitles: Record<IssueType, string> = {
  "missing-ledger": "پرداخت موفق بدون ثبت دفتر",
  "ledger-mismatch": "ثبت ناسازگار با پرداخت",
  "duplicate-capture": "چند پرداخت موفق برای یک سفارش",
};

const accountLabels: Record<string, string> = {
  GATEWAY_CLEARING: "وجوه تأییدشده نزد درگاه",
  UNALLOCATED_ORDER_FUNDS: "وجوه سفارشِ تخصیص‌نیافته",
};

const statusLabels: Record<string, string> = {
  PENDING_PAYMENT: "در انتظار پرداخت",
  PAYMENT_REVIEW: "نیازمند بررسی پرداخت",
  PAID: "پرداخت‌شده",
  PROCESSING: "در حال آماده‌سازی",
  SHIPPED: "ارسال‌شده",
  DELIVERED: "تحویل‌شده",
  CANCELLED: "لغوشده",
  REFUNDED: "بازپرداخت‌شده",
  SUCCEEDED: "موفق",
  FAILED: "ناموفق",
  PENDING: "در انتظار",
};

const toman = new Intl.NumberFormat("fa-IR");
const dateTime = new Intl.DateTimeFormat("fa-IR-u-ca-persian", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Tehran" });
const formatAmount = (amount: number | bigint) => `${toman.format(amount)} تومان`;

function orderLink(orderId: string) {
  return <Link href={`/admin/orders/${encodeURIComponent(orderId)}`} className="font-mono font-bold text-blue-700 hover:underline" dir="ltr">{orderId}</Link>;
}

export default async function AdminFinanceReconciliationPage({ searchParams }: ReconciliationPageProps) {
  await requireActiveAdmin();
  const { issue: rawIssue, page: rawPage } = await searchParams;
  const issue = typeof rawIssue === "string" && ISSUE_TYPES.includes(rawIssue as IssueType) ? rawIssue as IssueType : "missing-ledger";
  const page = typeof rawPage === "string" && /^[1-9]\d*$/.test(rawPage) ? Number(rawPage) : 1;
  if (
    Array.isArray(rawIssue) || (rawIssue !== undefined && rawIssue !== issue) ||
    Array.isArray(rawPage) || !Number.isSafeInteger(page) || page > 1000 ||
    (rawPage !== undefined && String(page) !== rawPage)
  ) {
    redirect("/admin/finance/reconciliation");
  }

  const prisma = getPrisma();
  const offset = (page - 1) * PAGE_SIZE;
  const [missingCount, mismatchCounts, duplicateCounts] = await Promise.all([
    prisma.payment.count({ where: { provider: "zarinpal", status: "SUCCEEDED", ledgerTransfers: { none: {} } } }),
    prisma.$queryRaw<Array<{ count: bigint }>>`
      WITH per_payment AS (
        SELECT "paymentId", COUNT(*) AS transfer_count
        FROM "LedgerTransfer"
        GROUP BY "paymentId"
      )
      SELECT COUNT(*) AS count
      FROM "LedgerTransfer" lt
      JOIN "Payment" p ON p."id" = lt."paymentId"
      JOIN "Order" o ON o."id" = p."orderId"
      JOIN per_payment pp ON pp."paymentId" = lt."paymentId"
      WHERE p."provider" <> 'zarinpal'
        OR p."status" <> 'SUCCEEDED'
        OR p."verifiedAt" IS NULL
        OR p."providerTransactionId" IS NULL
        OR p."amountToman" <> o."totalToman"
        OR lt."eventType"::text <> 'PAYMENT_CAPTURE_VERIFIED'
        OR lt."eventKey" <> ('payment-capture-verified:' || p."id")
        OR lt."debitAccount"::text <> 'GATEWAY_CLEARING'
        OR lt."creditAccount"::text <> 'UNALLOCATED_ORDER_FUNDS'
        OR lt."amountToman" <> p."amountToman"
        OR lt."orderId" <> p."orderId"
        OR pp.transfer_count > 1
    `,
    prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*) AS count
      FROM (
        SELECT "orderId"
        FROM "Payment"
        WHERE "provider" = 'zarinpal' AND "status" = 'SUCCEEDED'
        GROUP BY "orderId"
        HAVING COUNT(*) > 1
      ) duplicates
    `,
  ]);
  const mismatchCount = mismatchCounts[0]?.count ?? BigInt(0);
  const duplicateCount = duplicateCounts[0]?.count ?? BigInt(0);

  const records = issue === "missing-ledger"
    ? await prisma.payment.findMany({
        where: { provider: "zarinpal", status: "SUCCEEDED", ledgerTransfers: { none: {} } },
        orderBy: [{ verifiedAt: "desc" }, { id: "desc" }],
        skip: offset,
        take: PAGE_SIZE + 1,
        select: {
          id: true,
          amountToman: true,
          providerTransactionId: true,
          verifiedAt: true,
          order: { select: { id: true, status: true, totalToman: true } },
        },
      })
    : issue === "ledger-mismatch"
      ? await prisma.$queryRaw<LedgerMismatch[]>`
          WITH per_payment AS (
            SELECT "paymentId", COUNT(*) AS transfer_count
            FROM "LedgerTransfer"
            GROUP BY "paymentId"
          )
          SELECT
            lt."id",
            lt."paymentId",
            lt."orderId",
            lt."amountToman",
            lt."debitAccount"::text AS "debitAccount",
            lt."creditAccount"::text AS "creditAccount",
            lt."eventType"::text AS "eventType",
            lt."createdAt",
            p."provider",
            p."status"::text AS "paymentStatus",
            p."amountToman" AS "paymentAmountToman",
            p."providerTransactionId",
            p."verifiedAt",
            p."orderId" AS "paymentOrderId",
            o."totalToman" AS "orderTotalToman",
            o."status"::text AS "orderStatus",
            concat_ws('؛ ',
              CASE WHEN p."provider" <> 'zarinpal' THEN 'درگاه با زرین‌پال منطبق نیست' END,
              CASE WHEN p."status" <> 'SUCCEEDED' THEN 'وضعیت پرداخت موفق نیست' END,
              CASE WHEN p."verifiedAt" IS NULL THEN 'زمان تأیید پرداخت ثبت نشده' END,
              CASE WHEN p."providerTransactionId" IS NULL THEN 'شناسه تراکنش زرین‌پال ثبت نشده' END,
              CASE WHEN p."amountToman" <> o."totalToman" THEN 'مبلغ پرداخت با کل سفارش برابر نیست' END,
              CASE WHEN lt."eventType"::text <> 'PAYMENT_CAPTURE_VERIFIED' THEN 'نوع رویداد دفتر نادرست است' END,
              CASE WHEN lt."eventKey" <> ('payment-capture-verified:' || p."id") THEN 'کلید یکتای رویداد با پرداخت منطبق نیست' END,
              CASE WHEN lt."debitAccount"::text <> 'GATEWAY_CLEARING' THEN 'حساب بدهکار نادرست است' END,
              CASE WHEN lt."creditAccount"::text <> 'UNALLOCATED_ORDER_FUNDS' THEN 'حساب بستانکار نادرست است' END,
              CASE WHEN lt."amountToman" <> p."amountToman" THEN 'مبلغ ثبت دفتر با پرداخت برابر نیست' END,
              CASE WHEN lt."orderId" <> p."orderId" THEN 'سفارش ثبت دفتر با سفارش پرداخت برابر نیست' END,
              CASE WHEN pp.transfer_count > 1 THEN 'برای پرداخت بیش از یک ثبت دفتر وجود دارد' END
            ) AS issues
          FROM "LedgerTransfer" lt
          JOIN "Payment" p ON p."id" = lt."paymentId"
          JOIN "Order" o ON o."id" = p."orderId"
          JOIN per_payment pp ON pp."paymentId" = lt."paymentId"
          WHERE p."provider" <> 'zarinpal'
            OR p."status" <> 'SUCCEEDED'
            OR p."verifiedAt" IS NULL
            OR p."providerTransactionId" IS NULL
            OR p."amountToman" <> o."totalToman"
            OR lt."eventType"::text <> 'PAYMENT_CAPTURE_VERIFIED'
            OR lt."eventKey" <> ('payment-capture-verified:' || p."id")
            OR lt."debitAccount"::text <> 'GATEWAY_CLEARING'
            OR lt."creditAccount"::text <> 'UNALLOCATED_ORDER_FUNDS'
            OR lt."amountToman" <> p."amountToman"
            OR lt."orderId" <> p."orderId"
            OR pp.transfer_count > 1
          ORDER BY lt."createdAt" DESC, lt."id" DESC
          LIMIT ${PAGE_SIZE + 1} OFFSET ${offset}
        `
      : await prisma.$queryRaw<DuplicateCapture[]>`
          WITH duplicates AS (
            SELECT "orderId", COUNT(*)::integer AS "paymentCount", SUM("amountToman") AS "paymentTotalToman"
            FROM "Payment"
            WHERE "provider" = 'zarinpal' AND "status" = 'SUCCEEDED'
            GROUP BY "orderId"
            HAVING COUNT(*) > 1
          )
          SELECT d."orderId", d."paymentCount", d."paymentTotalToman", o."status"::text AS "orderStatus", o."totalToman" AS "orderTotalToman"
          FROM duplicates d
          JOIN "Order" o ON o."id" = d."orderId"
          ORDER BY d."orderId"
          LIMIT ${PAGE_SIZE + 1} OFFSET ${offset}
        `;

  const count = issue === "missing-ledger" ? BigInt(missingCount) : issue === "ledger-mismatch" ? mismatchCount : duplicateCount;
  const hasNextPage = records.length > PAGE_SIZE;
  const visibleRecords = records.slice(0, PAGE_SIZE);
  const maxPage = Math.max(1, Math.ceil(Number(count) / PAGE_SIZE));
  if (page > maxPage) redirect("/admin/finance/reconciliation");
  const issueHref = (value: IssueType) => `/admin/finance/reconciliation?issue=${value}`;
  const pageHref = (value: number) => `/admin/finance/reconciliation?issue=${issue}&page=${value}`;

  return (
    <main dir="rtl" className="min-h-screen bg-slate-50 px-4 py-10">
      <div className="mx-auto max-w-6xl">
        <AdminNavigation />
        <div className="mt-5 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black text-slate-900">صف تطبیق و استثناهای پرداخت</h1>
            <p className="mt-2 max-w-4xl text-sm leading-7 text-slate-600">
              این صفحه فقط موارد نیازمند بررسی را گزارش می‌کند و هیچ پرداخت، بازپرداخت یا وضعیت سفارشی را تغییر نمی‌دهد.
              موارد را با پنل زرین‌پال و مدارک مالی معتبر تطبیق دهید.
            </p>
          </div>
          <Link href="/admin/finance" className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 hover:border-blue-300 hover:text-blue-800">بازگشت به دفتر پرداخت</Link>
        </div>

        <nav aria-label="دسته‌های تطبیق" className="mt-6 flex flex-wrap gap-2">
          {ISSUE_TYPES.map((type) => {
            const active = type === issue;
            const value = type === "missing-ledger" ? missingCount : type === "ledger-mismatch" ? mismatchCount : duplicateCount;
            return (
              <Link key={type} aria-current={active ? "page" : undefined} href={issueHref(type)} className={`rounded-xl border px-4 py-3 text-sm font-bold ${active ? "border-blue-700 bg-blue-700 text-white" : "border-slate-200 bg-white text-slate-700 hover:border-blue-300"}`}>
                {issueTitles[type]} <span className="mr-1 opacity-80">({toman.format(value)})</span>
              </Link>
            );
          })}
        </nav>

        <h2 className="mt-7 text-lg font-black text-slate-900">{issueTitles[issue]}</h2>
        {visibleRecords.length === 0 ? (
          <p className="mt-4 rounded-2xl border border-emerald-100 bg-emerald-50 p-6 text-sm leading-7 text-emerald-900">در حال حاضر موردی در این دسته ثبت نشده است.</p>
        ) : issue === "missing-ledger" ? (
          <div className="mt-4 space-y-3">
            {visibleRecords.map((record) => {
              const payment = record as (typeof visibleRecords)[number] & {
                id: string; amountToman: number; providerTransactionId: string | null; verifiedAt: Date | null;
                order: { id: string; status: string; totalToman: number };
              };
              return (
                <article key={payment.id} className="rounded-2xl border border-amber-200 bg-white p-5 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="font-black text-slate-900">پرداخت موفق، بدون رویداد دفترکل</h3>
                      <p className="mt-2 text-sm text-slate-700">سفارش: {orderLink(payment.order.id)} · وضعیت سفارش: {statusLabels[payment.order.status] ?? payment.order.status}</p>
                      <p className="mt-1 text-xs text-slate-500">شناسه پرداخت: <span dir="ltr" className="font-mono">{payment.id}</span></p>
                      <p className="mt-1 text-xs text-slate-500">شناسه تراکنش درگاه: <span dir="ltr" className="font-mono">{payment.providerTransactionId ?? "ثبت نشده"}</span></p>
                    </div>
                    <div className="text-left sm:text-right">
                      <p className="font-black text-slate-900">پرداخت: {formatAmount(payment.amountToman)}</p>
                      <p className="mt-1 text-sm text-slate-600">سفارش: {formatAmount(payment.order.totalToman)}</p>
                      <time className="mt-1 block text-xs text-slate-500">{payment.verifiedAt ? dateTime.format(payment.verifiedAt) : "زمان تأیید ثبت نشده"}</time>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        ) : issue === "ledger-mismatch" ? (
          <div className="mt-4 space-y-3">
            {(visibleRecords as LedgerMismatch[]).map((entry) => (
              <article key={entry.id} className="rounded-2xl border border-rose-200 bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="font-black text-rose-900">ناسازگاری دفترکل</h3>
                    <p className="mt-2 text-sm text-slate-700">سفارش پرداخت: {orderLink(entry.paymentOrderId)}</p>
                    <p className="mt-1 text-xs text-slate-500">شناسه پرداخت: <span dir="ltr" className="font-mono">{entry.paymentId}</span> · ثبت دفتر: <span dir="ltr" className="font-mono">{entry.id}</span></p>
                    <p className="mt-2 text-sm leading-6 text-rose-800">{entry.issues}</p>
                    <p className="mt-1 text-xs text-slate-500">بدهکار: {accountLabels[entry.debitAccount] ?? entry.debitAccount} · بستانکار: {accountLabels[entry.creditAccount] ?? entry.creditAccount}</p>
                    <p className="mt-1 text-xs text-slate-500">وضعیت پرداخت: {statusLabels[entry.paymentStatus] ?? entry.paymentStatus} · سفارش: {statusLabels[entry.orderStatus] ?? entry.orderStatus}</p>
                  </div>
                  <div className="text-left sm:text-right">
                    <p className="font-black text-slate-900">دفتر: {formatAmount(entry.amountToman)}</p>
                    <p className="mt-1 text-sm text-slate-600">پرداخت: {formatAmount(entry.paymentAmountToman)}</p>
                    <p className="mt-1 text-xs text-slate-500">سفارش: {formatAmount(entry.orderTotalToman)}</p>
                    <time className="mt-1 block text-xs text-slate-500">{dateTime.format(entry.createdAt)}</time>
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {(visibleRecords as DuplicateCapture[]).map((entry) => (
              <article key={entry.orderId} className="rounded-2xl border border-rose-200 bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="font-black text-rose-900">برای یک سفارش چند پرداخت موفق ثبت شده</h3>
                    <p className="mt-2 text-sm text-slate-700">سفارش: {orderLink(entry.orderId)} · وضعیت سفارش: {statusLabels[entry.orderStatus] ?? entry.orderStatus}</p>
                    <p className="mt-1 text-sm text-slate-600">تعداد پرداخت موفق: {toman.format(entry.paymentCount)}</p>
                  </div>
                  <div className="text-left sm:text-right">
                    <p className="font-black text-slate-900">جمع پرداخت‌ها: {formatAmount(entry.paymentTotalToman)}</p>
                    <p className="mt-1 text-sm text-slate-600">مبلغ سفارش: {formatAmount(entry.orderTotalToman)}</p>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}

        {(page > 1 || hasNextPage) && (
          <nav aria-label="صفحه‌بندی موارد تطبیق" className="mt-6 flex justify-between">
            {page > 1 ? <Link href={pageHref(page - 1)} className="rounded-lg bg-white px-4 py-2 text-sm font-bold text-blue-700 shadow-sm">موارد جدیدتر / صفحه قبل</Link> : <span />}
            {hasNextPage && <Link href={pageHref(page + 1)} className="rounded-lg bg-white px-4 py-2 text-sm font-bold text-blue-700 shadow-sm">موارد بعدی</Link>}
          </nav>
        )}
      </div>
    </main>
  );
}
