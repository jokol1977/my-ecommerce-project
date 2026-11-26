import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getPrisma } from "@/lib/prisma";
import { requireActiveAdmin } from "@/lib/require-active-admin";
import { isVendorApprovalEnabled } from "@/lib/marketplace-config";
import { getCurrentVendorAgreement } from "@/lib/vendor-agreement";
import AdminNavigation from "@/app/admin/admin-navigation";
import ReviewActions from "./review-actions";

export const metadata: Metadata = { title: "بررسی فروشندگان | جانان‌کده" };
const PAGE_SIZE = 25;

type AdminVendorsPageProps = {
  searchParams: Promise<{ page?: string | string[] }>;
};

export default async function AdminVendorsPage({ searchParams }: AdminVendorsPageProps) {
  await requireActiveAdmin();
  const approvalFlagEnabled = isVendorApprovalEnabled();
  const currentAgreement = approvalFlagEnabled ? await getCurrentVendorAgreement() : null;
  const canApproveVendor = approvalFlagEnabled && currentAgreement !== null;
  const { page: rawPage } = await searchParams;
  const page = typeof rawPage === "string" && /^[1-9]\d*$/.test(rawPage) ? Number(rawPage) : 1;
  if (!Number.isSafeInteger(page) || page > 1000 || Array.isArray(rawPage) || (rawPage !== undefined && String(page) !== rawPage)) redirect("/admin/vendors");

  const applications = await getPrisma().vendorProfile.findMany({
    where: { status: "PENDING" },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE + 1,
    select: {
      id: true,
      storeName: true,
      slug: true,
      description: true,
      createdAt: true,
      user: { select: { email: true } },
      agreementAcceptances: {
        take: 1,
        orderBy: { acceptedAt: "desc" },
        select: { contractVersion: true, documentSha256: true, acceptedAt: true },
      },
    },
  });
  const hasNextPage = applications.length > PAGE_SIZE;
  const visibleApplications = applications.slice(0, PAGE_SIZE).map((vendor) => {
    const latestAcceptance = vendor.agreementAcceptances[0] ?? null;
    const hasCurrentAcceptance = Boolean(
      latestAcceptance &&
      currentAgreement &&
      latestAcceptance.contractVersion === currentAgreement.version &&
      latestAcceptance.documentSha256 === currentAgreement.documentSha256,
    );
    return { ...vendor, latestAcceptance, hasCurrentAcceptance };
  });
  if (visibleApplications.length === 0 && page > 1) redirect("/admin/vendors");
  const pageHref = (value: number) => value === 1 ? "/admin/vendors" : `/admin/vendors?page=${value}`;

  return (
    <main dir="rtl" className="min-h-screen bg-slate-50 px-4 py-10">
      <div className="mx-auto max-w-4xl">
        <AdminNavigation />
        <h1 className="mt-5 text-2xl font-black text-slate-900">درخواست‌های فروشندگی</h1>
        {!canApproveVendor && <p role="status" className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold leading-7 text-amber-900">تأیید فروشنده در محیط تولید تا آماده‌شدن قرارداد نسخه‌دار و بررسی‌های هویتی، مالیاتی و تسویه بسته است. رد درخواست‌ها همچنان در دسترس است.</p>}
        {visibleApplications.length === 0 ? (
          <p className="mt-7 rounded-2xl bg-white p-8 text-slate-600">درخواست در انتظار بررسی وجود ندارد.</p>
        ) : (
          <div className="mt-7 space-y-4">
            {visibleApplications.map((vendor) => (
              <article key={vendor.id} className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
                <div className="flex flex-wrap justify-between gap-3">
                  <h2 className="text-lg font-black text-slate-900">{vendor.storeName}</h2>
                  <time className="text-sm text-slate-500">{new Intl.DateTimeFormat("fa-IR-u-ca-persian", { dateStyle: "long", timeZone: "Asia/Tehran" }).format(vendor.createdAt)}</time>
                </div>
                <p dir="ltr" className="mt-1 text-right text-sm text-slate-500">/{vendor.slug}</p>
                <p dir="ltr" className="mt-2 text-right text-sm font-bold text-slate-700">{vendor.user.email}</p>
                <p className="mt-4 whitespace-pre-wrap text-sm leading-7 text-slate-600">{vendor.description}</p>
                {vendor.latestAcceptance ? (
                  <div className="mt-4 rounded-xl bg-slate-50 p-3 text-sm leading-7 text-slate-700">
                    <p className="font-bold">پذیرش قرارداد: نسخهٔ {vendor.latestAcceptance.contractVersion}{vendor.hasCurrentAcceptance ? " · نسخهٔ جاری" : " · نیازمند پذیرش نسخهٔ جاری"}</p>
                    <time dateTime={vendor.latestAcceptance.acceptedAt.toISOString()} className="block">زمان ثبت: {new Intl.DateTimeFormat("fa-IR-u-ca-persian", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Tehran" }).format(vendor.latestAcceptance.acceptedAt)}</time>
                    <p dir="ltr" className="break-all font-mono text-xs">SHA-256: {vendor.latestAcceptance.documentSha256}</p>
                    {vendor.hasCurrentAcceptance && currentAgreement && <a href={currentAgreement.href} target="_blank" rel="noopener noreferrer" className="font-bold text-blue-700 underline">مشاهدهٔ متن پذیرفته‌شده</a>}
                  </div>
                ) : (
                  <p className="mt-4 rounded-xl bg-amber-50 p-3 text-sm font-bold text-amber-900">پذیرش نسخه‌دار قرارداد ثبت نشده است؛ تأیید فروشگاه مجاز نیست.</p>
                )}
                <ReviewActions vendorId={vendor.id} canApprove={canApproveVendor && vendor.hasCurrentAcceptance} />
              </article>
            ))}
          </div>
        )}
        {(page > 1 || hasNextPage) && <nav aria-label="صفحه‌بندی درخواست‌های فروشندگی" className="mt-7 flex justify-between">
          {page > 1 ? <Link href={pageHref(page - 1)} className="rounded-lg bg-white px-4 py-2 text-sm font-bold text-blue-700 shadow-sm">صفحهٔ قبلی</Link> : <span />}
          {hasNextPage && <Link href={pageHref(page + 1)} className="rounded-lg bg-white px-4 py-2 text-sm font-bold text-blue-700 shadow-sm">صفحهٔ بعدی</Link>}
        </nav>}
      </div>
    </main>
  );
}
