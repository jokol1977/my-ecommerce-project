import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getPrisma } from "@/lib/prisma";
import { requireActiveAdmin } from "@/lib/require-active-admin";
import AdminNavigation from "@/app/admin/admin-navigation";
import ReviewActions from "./review-actions";

export const metadata: Metadata = { title: "بررسی دیدگاه‌ها | جانان‌کده" };
const PAGE_SIZE = 25;

type AdminReviewsPageProps = {
  searchParams: Promise<{ page?: string | string[] }>;
};

export default async function AdminReviewsPage({ searchParams }: AdminReviewsPageProps) {
  await requireActiveAdmin();
  const { page: rawPage } = await searchParams;
  const page = typeof rawPage === "string" && /^[1-9]\d*$/.test(rawPage) ? Number(rawPage) : 1;
  if (!Number.isSafeInteger(page) || page > 1000 || Array.isArray(rawPage) || (rawPage !== undefined && String(page) !== rawPage)) redirect("/admin/reviews");

  const reviews = await getPrisma().productReview.findMany({
    where: { status: "PENDING" },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE + 1,
    select: {
      id: true,
      rating: true,
      body: true,
      createdAt: true,
      product: { select: { name: true, slug: true, vendor: { select: { slug: true } } } },
    },
  });
  const hasNextPage = reviews.length > PAGE_SIZE;
  const visibleReviews = reviews.slice(0, PAGE_SIZE);
  if (visibleReviews.length === 0 && page > 1) redirect("/admin/reviews");
  const pageHref = (value: number) => value === 1 ? "/admin/reviews" : `/admin/reviews?page=${value}`;

  return <main dir="rtl" className="min-h-screen bg-slate-50 px-4 py-10"><div className="mx-auto max-w-4xl">
    <AdminNavigation />
    <h1 className="mt-5 text-2xl font-black text-slate-900">دیدگاه‌های در انتظار بررسی</h1>
    {visibleReviews.length === 0 ? <p className="mt-7 rounded-2xl bg-white p-8 text-slate-600">دیدگاهی در صف بررسی نیست.</p> : <div className="mt-7 space-y-4">{visibleReviews.map((review) => <article key={review.id} className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-black text-slate-900">{review.product.name}</h2><time className="text-sm text-slate-500">{new Intl.DateTimeFormat("fa-IR-u-ca-persian", { dateStyle: "long", timeZone: "Asia/Tehran" }).format(review.createdAt)}</time></div>
      <p className="mt-2 text-sm font-bold text-amber-700">امتیاز {review.rating} از ۵</p>
      <p className="mt-3 whitespace-pre-wrap text-sm leading-8 text-slate-700">{review.body}</p>
      <Link href={`/products/${encodeURIComponent(review.product.vendor.slug)}/${encodeURIComponent(review.product.slug)}`} className="mt-3 inline-block text-sm font-bold text-blue-700 hover:underline">مشاهدهٔ کالا</Link>
      <ReviewActions reviewId={review.id} />
    </article>)}</div>}
    {(page > 1 || hasNextPage) && <nav aria-label="صفحه‌بندی دیدگاه‌های در انتظار بررسی" className="mt-7 flex justify-between">
      {page > 1 ? <Link href={pageHref(page - 1)} className="rounded-lg bg-white px-4 py-2 text-sm font-bold text-blue-700 shadow-sm">صفحهٔ قبلی</Link> : <span />}
      {hasNextPage && <Link href={pageHref(page + 1)} className="rounded-lg bg-white px-4 py-2 text-sm font-bold text-blue-700 shadow-sm">صفحهٔ بعدی</Link>}
    </nav>}
  </div></main>;
}
