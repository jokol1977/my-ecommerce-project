import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { connection } from "next/server";
import { notFound, redirect } from "next/navigation";
import { getPublicCatalog, getPublicVendorStore, hasCatalogDatabaseConfiguration } from "@/lib/catalog";

type StorePageProps = {
  params: Promise<{ vendorSlug: string }>;
  searchParams: Promise<{ page?: string | string[] }>;
};

function parsePage(value: string | string[] | undefined) {
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) return 1;
  return Number(value);
}

export async function generateMetadata({ params }: StorePageProps): Promise<Metadata> {
  const { vendorSlug } = await params;
  if (!hasCatalogDatabaseConfiguration()) return { title: "فروشگاه پیدا نشد" };
  await connection();
  const store = await getPublicVendorStore(vendorSlug);
  if (!store) return { title: "فروشگاه پیدا نشد" };
  return {
    title: `${store.storeName} | جانان‌کده`,
    description: store.description?.slice(0, 160) || `مشاهده کالاهای فروشگاه ${store.storeName} در جانان‌کده`,
  };
}

export default async function StorePage({ params, searchParams }: StorePageProps) {
  const [{ vendorSlug }, query] = await Promise.all([params, searchParams]);
  if (!hasCatalogDatabaseConfiguration()) notFound();
  await connection();

  const page = parsePage(query.page);
  if (page > 200 || (Array.isArray(query.page)) || (query.page !== undefined && String(page) !== query.page)) {
    redirect(`/stores/${encodeURIComponent(vendorSlug)}${page > 1 && page <= 200 ? `?page=${page}` : ""}`);
  }

  const [store, catalog] = await Promise.all([
    getPublicVendorStore(vendorSlug),
    getPublicCatalog({ vendorSlug, page }),
  ]);
  if (!store) notFound();
  if (!catalog.products.length && page > 1) notFound();

  const storePath = `/stores/${encodeURIComponent(store.slug)}`;
  const previousHref = page === 2 ? storePath : `${storePath}?page=${page - 1}`;
  const nextHref = `${storePath}?page=${page + 1}`;

  return (
    <main dir="rtl" className="min-h-screen bg-slate-50 px-4 py-8 sm:py-12">
      <div className="mx-auto max-w-7xl">
        <nav aria-label="مسیر صفحه" className="mb-6 text-sm text-slate-500">
          <Link href="/" className="hover:text-blue-700">جانان‌کده</Link>
          <span className="mx-2">/</span><span>{store.storeName}</span>
        </nav>
        <header className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm sm:p-9">
          <p className="text-sm font-bold text-blue-700">فروشگاه تأییدشده</p>
          <h1 className="mt-2 text-2xl font-black text-slate-900 sm:text-3xl">{store.storeName}</h1>
          {store.description && <p className="mt-4 max-w-3xl whitespace-pre-wrap text-sm leading-8 text-slate-600">{store.description}</p>}
        </header>

        <section className="mt-8" aria-labelledby="store-products-heading">
          <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
            <div><h2 id="store-products-heading" className="text-xl font-black text-slate-900">کالاهای این فروشگاه</h2>
              <p className="mt-1 text-sm text-slate-500">صفحه {page.toLocaleString("fa-IR")}</p></div>
          </div>
          {catalog.products.length === 0 ? (
            <div className="rounded-2xl border border-slate-100 bg-white p-8 text-center text-slate-600">در حال حاضر کالای فعالی برای نمایش وجود ندارد.</div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-5 lg:grid-cols-4">
              {catalog.products.map((product) => (
                <Link key={product.id} href={`/products/${encodeURIComponent(store.slug)}/${encodeURIComponent(product.slug)}`} className="group overflow-hidden rounded-2xl border border-slate-100 bg-white p-3 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md sm:p-4">
                  <div className="relative aspect-square overflow-hidden rounded-xl bg-slate-100">
                    {product.image ? <Image src={product.image.url} alt={product.image.altText || product.name} fill sizes="(max-width: 640px) 45vw, (max-width: 1024px) 30vw, 23vw" className="object-contain transition group-hover:scale-105" /> : <div className="flex h-full items-center justify-center px-3 text-center text-xs text-slate-400">تصویری برای این کالا ثبت نشده است</div>}
                  </div>
                  <p className="mt-3 text-xs font-bold text-blue-700">{product.category.path}</p>
                  <h3 className="mt-1 line-clamp-2 min-h-12 text-sm font-bold leading-6 text-slate-800">{product.name}</h3>
                  {product.reviewCount ? <p className="mt-1 text-xs font-bold text-amber-700">★ {product.averageRating?.toLocaleString("fa-IR", { maximumFractionDigits: 1 })} <span className="font-normal text-slate-500">({product.reviewCount.toLocaleString("fa-IR")} دیدگاه)</span></p> : null}
                  <p className="mt-3 font-black text-blue-800">{product.priceToman.toLocaleString("fa-IR")} <span className="text-xs">تومان</span></p>
                  <p className={`mt-1 text-xs font-bold ${product.inStock ? "text-emerald-700" : "text-slate-500"}`}>{product.inStock ? "موجود" : "ناموجود"}</p>
                </Link>
              ))}
            </div>
          )}
        </section>

        {(page > 1 || catalog.hasMore) && <nav aria-label="صفحه‌بندی کالاها" className="mt-8 flex justify-center gap-3">
          {page > 1 && <Link href={previousHref} className="rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-bold text-slate-700 hover:border-blue-300">صفحه قبل</Link>}
          {catalog.hasMore && <Link href={nextHref} className="rounded-xl bg-blue-700 px-5 py-3 text-sm font-bold text-white hover:bg-blue-800">صفحه بعد</Link>}
        </nav>}
      </div>
    </main>
  );
}
