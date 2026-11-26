import { cache, Suspense } from "react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { getPublicProduct, hasCatalogDatabaseConfiguration } from "@/lib/catalog";
import { isProductionCheckoutConfigured } from "@/lib/payment-config";
import { getPrisma } from "@/lib/prisma";
import AddToCartButton from "./add-to-cart-button";
import ReviewForm from "./review-form";

type ProductRouteProps = {
  params: Promise<{ vendorSlug: string; productSlug: string }>;
};

const readProduct = cache((vendorSlug: string, productSlug: string) =>
  getPublicProduct(vendorSlug, productSlug),
);

function formatPrice(price: number) {
  return new Intl.NumberFormat("fa-IR").format(price);
}

export async function generateMetadata({ params }: ProductRouteProps): Promise<Metadata> {
  const { vendorSlug, productSlug } = await params;
  if (!hasCatalogDatabaseConfiguration()) return { title: "کالا پیدا نشد" };

  await connection();
  const product = await readProduct(vendorSlug, productSlug);
  if (!product) return { title: "کالا پیدا نشد" };

  return {
    title: `${product.name} | جانان‌کده`,
    description: product.description.slice(0, 160) || `${product.name} از فروشگاه ${product.vendor.storeName}`,
    openGraph: {
      title: `${product.name} | جانان‌کده`,
      description: product.description.slice(0, 160) || `خرید ${product.name} از جانان‌کده`,
      images: product.image ? [product.image.url] : undefined,
    },
  };
}

async function ProductContent({ params }: ProductRouteProps) {
  const { vendorSlug, productSlug } = await params;
  if (!hasCatalogDatabaseConfiguration()) notFound();

  await connection();
  const product = await readProduct(vendorSlug, productSlug);
  if (!product) notFound();

  const session = await auth();
  const checkoutEnabled = isProductionCheckoutConfigured();
  const customerId = session?.user?.id && session.user.status === "ACTIVE" && session.user.role === "CUSTOMER"
    ? session.user.id
    : null;
  const prisma = getPrisma();
  const [reviews, reviewSummary, deliveredPurchase, existingReview] = await Promise.all([
    prisma.productReview.findMany({
      where: { productId: product.id, status: "APPROVED" },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 20,
      select: { rating: true, body: true, createdAt: true },
    }),
    prisma.productReview.aggregate({
      where: { productId: product.id, status: "APPROVED" },
      _avg: { rating: true },
      _count: { _all: true },
    }),
    customerId ? prisma.orderItem.findFirst({
      where: { productId: product.id, vendorOrder: { status: "DELIVERED", order: { customerId } } },
      select: { id: true },
    }) : Promise.resolve(null),
    customerId ? prisma.productReview.findUnique({
      where: { productId_customerId: { productId: product.id, customerId } },
      select: { status: true },
    }) : Promise.resolve(null),
  ]);
  const averageRating = reviewSummary._avg.rating;

  return (
    <main dir="rtl" className="min-h-screen bg-slate-50 px-4 py-8 sm:py-12">
      <div className="mx-auto max-w-6xl">
        <nav aria-label="مسیر صفحه" className="mb-6 text-sm text-slate-500">
          <Link href="/" className="hover:text-blue-700">جانان‌کده</Link>
          <span className="mx-2">/</span>
          <span>{product.category.path}</span>
        </nav>

        <article className="grid gap-8 rounded-3xl border border-slate-100 bg-white p-5 shadow-sm sm:p-8 lg:grid-cols-2">
          <div className="relative aspect-square overflow-hidden rounded-2xl bg-slate-100">
            {product.image ? (
              <Image src={product.image.url} alt={product.image.altText || product.name} fill preload sizes="(max-width: 639px) calc(100vw - 4.5rem), (max-width: 1023px) calc(100vw - 6rem), 528px" className="object-contain" />
            ) : (
              <div className="flex h-full items-center justify-center text-slate-400">تصویری برای این کالا ثبت نشده است</div>
            )}
          </div>

          <div className="flex flex-col py-2">
            <p className="text-sm font-bold text-blue-700">{product.category.path}</p>
            <h1 className="mt-3 text-2xl font-black leading-relaxed text-slate-900 sm:text-3xl">{product.name}</h1>
            <p className="mt-5 text-sm text-slate-600">
              فروشنده: <Link href={`/stores/${encodeURIComponent(product.vendor.slug)}`} className="font-bold text-slate-900 hover:text-blue-700 hover:underline">{product.vendor.storeName}</Link>
            </p>
            {(product.brandName || product.productType || product.modelCode || product.originCountry) && <dl className="mt-4 grid gap-3 rounded-xl bg-slate-50 p-4 text-sm sm:grid-cols-2">
              {product.brandName && <div><dt className="font-bold text-slate-500">برند یا سازنده</dt><dd className="mt-1 text-slate-800">{product.brandName}</dd></div>}
              {product.productType && <div><dt className="font-bold text-slate-500">نوع کالا</dt><dd className="mt-1 text-slate-800">{product.productType}</dd></div>}
              {product.modelCode && <div><dt className="font-bold text-slate-500">مدل یا کد سازنده</dt><dd className="mt-1 text-slate-800">{product.modelCode}</dd></div>}
              {product.originCountry && <div><dt className="font-bold text-slate-500">کشور سازنده</dt><dd className="mt-1 text-slate-800">{product.originCountry}</dd></div>}
            </dl>}
            <p className={`mt-4 text-sm font-bold ${product.inStock ? "text-emerald-700" : "text-slate-500"}`}>
              {product.inStock ? (checkoutEnabled ? "موجود و آماده سفارش" : "موجود") : "فعلاً ناموجود"}
            </p>

            <div className="mt-8 rounded-2xl bg-slate-50 p-5">
              <p className="text-sm text-slate-500">قیمت فروشنده</p>
              <p className="mt-2 text-2xl font-black text-blue-800">{formatPrice(product.priceToman)} <span className="text-sm">تومان</span></p>
              <p className="mt-4 text-xs leading-6 text-slate-500">موجودی و قیمت نهایی هنگام آماده‌سازی سفارش از سرور بررسی می‌شود.</p>
              <AddToCartButton
                product={{
                  id: product.id,
                  name: product.name,
                  price: formatPrice(product.priceToman),
                  image: product.image?.url ?? "/images/placeholder.png",
                  vendorName: product.vendor.storeName,
                  category: product.category.name,
                  badge: product.inStock ? "موجود" : "ناموجود",
                  inStock: product.inStock,
                  href: `/products/${encodeURIComponent(product.vendor.slug)}/${encodeURIComponent(product.slug)}`,
                }}
                enabled={checkoutEnabled}
              />
            </div>

            <section className="mt-8 border-t border-slate-100 pt-6">
              <h2 className="text-lg font-black">درباره این کالا</h2>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-8 text-slate-600">
                {product.description || "توضیحات بیشتری برای این کالا ثبت نشده است."}
              </p>
              {product.specificationsText && <div className="mt-5"><h3 className="font-bold text-slate-800">ویژگی‌های کالا</h3><p className="mt-2 whitespace-pre-wrap text-sm leading-8 text-slate-600">{product.specificationsText}</p></div>}
              {product.warrantyDescription && <p className="mt-5 rounded-xl bg-blue-50 p-4 text-sm leading-7 text-blue-900"><span className="font-bold">گارانتی اعلام‌شده:</span> {product.warrantyDescription}</p>}
            </section>
          </div>
        </article>
        <section className="mt-8 rounded-3xl border border-slate-100 bg-white p-5 shadow-sm sm:p-8" aria-labelledby="product-reviews-heading">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="product-reviews-heading" className="text-xl font-black">دیدگاه خریداران</h2>
            {averageRating !== null && <p className="font-bold text-amber-700">میانگین {averageRating.toLocaleString("fa-IR", { maximumFractionDigits: 1 })} از ۵ · {reviewSummary._count._all.toLocaleString("fa-IR")} دیدگاه</p>}
          </div>
          {reviews.length === 0 ? <p className="mt-4 text-sm leading-7 text-slate-600">هنوز دیدگاه تأییدشده‌ای برای این کالا ثبت نشده است.</p> : <div className="mt-5 divide-y divide-slate-100">{reviews.map((review, index) => <article key={`${review.createdAt.toISOString()}-${index}`} className="py-5 first:pt-0 last:pb-0">
            <p className="font-bold text-amber-700">امتیاز {review.rating} از ۵ · خریدار تأییدشده</p>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-8 text-slate-700">{review.body}</p>
            <time className="mt-2 block text-xs text-slate-500">{new Intl.DateTimeFormat("fa-IR-u-ca-persian", { dateStyle: "long", timeZone: "Asia/Tehran" }).format(review.createdAt)}</time>
          </article>)}</div>}
          {customerId && deliveredPurchase && !existingReview && <ReviewForm productId={product.id} />}
          {customerId && deliveredPurchase && existingReview && <p className="mt-5 rounded-xl bg-blue-50 p-4 text-sm leading-7 text-blue-900">برای این کالا دیدگاه ثبت کرده‌اید؛ پس از بررسی مدیر، در همین صفحه نمایش داده می‌شود.</p>}
          {!session?.user?.id && <p className="mt-5 text-sm text-slate-600">ثبت دیدگاه پس از فعال‌شدن ورود مشتریان و تحویل سفارش در دسترس خواهد بود.</p>}
          {session?.user?.id && !customerId && <p className="mt-5 text-sm text-slate-600">ثبت دیدگاه برای حساب مشتری پس از تحویل سفارش امکان‌پذیر است.</p>}
          {customerId && !deliveredPurchase && <p className="mt-5 text-sm text-slate-600">پس از تحویل این کالا، می‌توانید دیدگاه ثبت کنید.</p>}
        </section>
      </div>
    </main>
  );
}

function ProductFallback() {
  return <main className="min-h-screen bg-slate-50 p-8"><div className="mx-auto h-96 max-w-6xl animate-pulse rounded-3xl bg-slate-200" /></main>;
}

export default function ProductPage(props: ProductRouteProps) {
  return <Suspense fallback={<ProductFallback />}><ProductContent {...props} /></Suspense>;
}
