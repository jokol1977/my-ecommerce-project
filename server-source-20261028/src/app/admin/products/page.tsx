import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getPrisma } from "@/lib/prisma";
import { requireActiveAdmin } from "@/lib/require-active-admin";
import AdminNavigation from "@/app/admin/admin-navigation";
import ProductReviewActions from "./review-actions";

export const metadata: Metadata = { title: "بررسی کالاها | جانان‌کده" };
const PAGE_SIZE = 25;

type AdminProductsPageProps = {
  searchParams: Promise<{ page?: string | string[] }>;
};

export default async function AdminProductsPage({ searchParams }: AdminProductsPageProps) {
  await requireActiveAdmin();
  const { page: rawPage } = await searchParams;
  const page = typeof rawPage === "string" && /^[1-9]\d*$/.test(rawPage) ? Number(rawPage) : 1;
  if (!Number.isSafeInteger(page) || page > 1000 || Array.isArray(rawPage) || (rawPage !== undefined && String(page) !== rawPage)) redirect("/admin/products");

  const products = await getPrisma().product.findMany({
    where: { status: "PENDING_REVIEW" }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE + 1,
    select: { id: true, name: true, description: true, priceToman: true, stockQuantity: true, createdAt: true,
      category: { select: { name: true } }, vendor: { select: { storeName: true, user: { select: { email: true } } } } },
  });
  const hasNextPage = products.length > PAGE_SIZE;
  const visibleProducts = products.slice(0, PAGE_SIZE);
  if (visibleProducts.length === 0 && page > 1) redirect("/admin/products");
  const pageHref = (value: number) => value === 1 ? "/admin/products" : `/admin/products?page=${value}`;

  return <main dir="rtl" className="min-h-screen bg-slate-50 px-4 py-10"><div className="mx-auto max-w-4xl">
    <AdminNavigation />
    <h1 className="mt-5 text-2xl font-black text-slate-900">کالاهای در انتظار بررسی</h1>
    {visibleProducts.length === 0 ? <p className="mt-7 rounded-2xl bg-white p-8 text-slate-600">کالایی در صف بررسی نیست.</p> : <div className="mt-7 space-y-4">{visibleProducts.map((product) => <article key={product.id} className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3"><h2 className="text-lg font-black text-slate-900">{product.name}</h2><time className="text-sm text-slate-500">{new Intl.DateTimeFormat("fa-IR-u-ca-persian", { dateStyle: "long", timeZone: "Asia/Tehran" }).format(product.createdAt)}</time></div>
      <p className="mt-2 text-sm text-slate-600">فروشگاه: {product.vendor.storeName} · {product.vendor.user.email}</p><p className="mt-1 text-sm text-slate-600">{product.category.name} · {product.priceToman.toLocaleString("fa-IR")} تومان · موجودی {product.stockQuantity.toLocaleString("fa-IR")}</p>
      {product.description && <p className="mt-4 whitespace-pre-wrap text-sm leading-7 text-slate-700">{product.description}</p>}<ProductReviewActions productId={product.id} />
    </article>)}</div>}
    {(page > 1 || hasNextPage) && <nav aria-label="صفحه‌بندی صف بررسی کالاها" className="mt-7 flex justify-between">
      {page > 1 ? <Link href={pageHref(page - 1)} className="rounded-lg bg-white px-4 py-2 text-sm font-bold text-blue-700 shadow-sm">صفحهٔ قبلی</Link> : <span />}
      {hasNextPage && <Link href={pageHref(page + 1)} className="rounded-lg bg-white px-4 py-2 text-sm font-bold text-blue-700 shadow-sm">صفحهٔ بعدی</Link>}
    </nav>}
  </div></main>;
}
