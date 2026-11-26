import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getPrisma } from "@/lib/prisma";
import { requireActiveAdmin } from "@/lib/require-active-admin";
import AdminNavigation from "@/app/admin/admin-navigation";
import ProductReviewActions from "./review-actions";
import AdminProductImages from "./image-actions";

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
    select: { id: true, name: true, description: true, brandName: true, productType: true, modelCode: true, sellerSku: true, publicProductId: true, originCountry: true, packageLengthMm: true, packageWidthMm: true, packageHeightMm: true, packageWeightGrams: true, warrantyDescription: true, specificationsText: true, sourceReference: true, sellerContentAttestedAt: true, priceToman: true, stockQuantity: true, createdAt: true,
      category: { select: { name: true } }, vendor: { select: { storeName: true, user: { select: { email: true } } } },
      images: { where: { url: { startsWith: "/api/product-images/" } }, orderBy: { position: "asc" }, select: { id: true, url: true, altText: true, storageReady: true, storageDeleting: true } } },
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
      {(product.brandName || product.productType || product.modelCode || product.sellerSku || product.publicProductId || product.originCountry) && <dl className="mt-4 grid gap-2 rounded-xl bg-slate-50 p-4 text-sm sm:grid-cols-2">
        {product.brandName && <div><dt className="font-bold text-slate-600">برند یا سازنده</dt><dd className="mt-1">{product.brandName}</dd></div>}
        {product.productType && <div><dt className="font-bold text-slate-600">نوع کالا</dt><dd className="mt-1">{product.productType}</dd></div>}
        {product.modelCode && <div><dt className="font-bold text-slate-600">مدل یا کد سازنده</dt><dd className="mt-1">{product.modelCode}</dd></div>}
        {product.sellerSku && <div><dt className="font-bold text-slate-600">کد داخلی فروشنده</dt><dd className="mt-1">{product.sellerSku}</dd></div>}
        {product.publicProductId && <div><dt className="font-bold text-slate-600">شناسهٔ عمومی اعلام‌شده</dt><dd className="mt-1">{product.publicProductId}</dd></div>}
        {product.originCountry && <div><dt className="font-bold text-slate-600">کشور سازنده</dt><dd className="mt-1">{product.originCountry}</dd></div>}
      </dl>}
      {(product.packageLengthMm || product.packageWidthMm || product.packageHeightMm || product.packageWeightGrams) && <p className="mt-3 text-sm text-slate-600">بسته‌بندی: {product.packageLengthMm && product.packageWidthMm && product.packageHeightMm ? `${product.packageLengthMm} × ${product.packageWidthMm} × ${product.packageHeightMm} میلی‌متر` : "ابعاد ناقص"}{product.packageWeightGrams ? ` · وزن ${product.packageWeightGrams.toLocaleString("fa-IR")} گرم` : ""}</p>}
      {product.warrantyDescription && <p className="mt-3 text-sm text-slate-700"><span className="font-bold">شرایط گارانتی اعلام‌شده:</span> {product.warrantyDescription}</p>}
      {product.specificationsText && <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-slate-700"><span className="font-bold">ویژگی‌های اعلام‌شده:</span> {product.specificationsText}</p>}
      {product.description && <p className="mt-4 whitespace-pre-wrap text-sm leading-7 text-slate-700">{product.description}</p>}
      <p className="mt-3 text-sm text-slate-600">اظهار مجازبودن محتوا: {product.sellerContentAttestedAt ? "ثبت شده" : "ثبت نشده"}</p>
      {product.sourceReference ? <p className="mt-1 break-all text-sm">مرجع اعلامی فروشنده: <a href={product.sourceReference} target="_blank" rel="noopener noreferrer" className="font-bold text-blue-700 underline">مشاهده پیوند</a></p> : <p className="mt-1 text-sm text-slate-500">مرجع عمومی کالا ارائه نشده است.</p>}
      {product.images.length === 0 && <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">برای انتشار، دست‌کم یک تصویر کامل و بارگذاری‌شده لازم است.</p>}
      {product.images.some((image) => image.storageDeleting) && <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">حذف یک تصویر هنوز کامل نشده است؛ برای تلاش دوباره، دکمهٔ حذف همان تصویر را بزنید.</p>}
      {product.images.some((image) => !image.storageReady && !image.storageDeleting) && <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">تصویر رزروشدهٔ ناقص وجود دارد؛ فروشنده باید آن را کامل یا حذف کند پیش از انتشار.</p>}
      {product.images.length > 0 && <AdminProductImages productId={product.id} images={product.images} />}
      <ProductReviewActions productId={product.id} approvalDisabledReason={!product.sellerContentAttestedAt ? "برای تأیید، ابتدا اظهار مجازبودن محتوای فروشنده باید ثبت شود." : product.images.length === 0 ? "برای انتشار، دست‌کم یک تصویر کامل و بارگذاری‌شده لازم است." : product.images.some((image) => image.storageDeleting) ? "برای تأیید، پاک‌سازی تصویر در حال حذف باید کامل شود؛ حذف آن را دوباره امتحان کنید." : product.images.some((image) => !image.storageReady) ? "برای تأیید، تصویرهای رزروشدهٔ ناقص را حذف یا بارگذاری‌شان را کامل کنید." : undefined} />
    </article>)}</div>}
    {(page > 1 || hasNextPage) && <nav aria-label="صفحه‌بندی صف بررسی کالاها" className="mt-7 flex justify-between">
      {page > 1 ? <Link href={pageHref(page - 1)} className="rounded-lg bg-white px-4 py-2 text-sm font-bold text-blue-700 shadow-sm">صفحهٔ قبلی</Link> : <span />}
      {hasNextPage && <Link href={pageHref(page + 1)} className="rounded-lg bg-white px-4 py-2 text-sm font-bold text-blue-700 shadow-sm">صفحهٔ بعدی</Link>}
    </nav>}
  </div></main>;
}
