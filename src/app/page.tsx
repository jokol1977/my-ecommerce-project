import { Suspense } from "react";
import { connection } from "next/server";
import { DEMO_PRODUCTS } from "@/data/demo-catalog";
import {
  getPublicCatalog,
  hasCatalogDatabaseConfiguration,
  shouldUseDemoCatalog,
} from "@/lib/catalog";
import { getPrisma } from "@/lib/prisma";
import { getCategoryPaths } from "@/lib/category-tree";
import {
  toStorefrontProduct,
  type StorefrontProduct,
} from "@/types/catalog";
import Storefront from "./storefront";

async function StorefrontContent() {
  if (!hasCatalogDatabaseConfiguration()) {
    if (shouldUseDemoCatalog()) {
      return <Storefront initialProducts={DEMO_PRODUCTS} demoMode />;
    }

    return (
      <Storefront
        initialProducts={[]}
        demoMode={false}
        initialCatalogError="پیکربندی پایگاه داده انجام نشده است."
      />
    );
  }

  await connection();

  let initialProducts: StorefrontProduct[] = [];
  let categoryOptions: Array<{ value: string; label: string }> = [{ value: "همه", label: "همه" }];
  let initialHasMore = false;
  let initialCursor: string | null = null;
  let initialCatalogError: string | null = null;

  try {
    const [catalog, categories] = await Promise.all([
      getPublicCatalog(),
      getPrisma().category.findMany({
        where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true, parentId: true },
      }),
    ]);
    initialProducts = catalog.products.map(toStorefrontProduct);
    const paths = getCategoryPaths(categories);
    categoryOptions = [{ value: "همه", label: "همه" }, ...categories.map((category) => ({ value: category.id, label: paths.get(category.id) ?? category.name }))];
    initialHasMore = catalog.hasMore;
    initialCursor = catalog.nextCursor;
  } catch (error) {
    console.error("Unable to render the public product catalog.", error);
    initialCatalogError = "فعلاً امکان دریافت فهرست محصولات وجود ندارد.";
  }

  return (
    <Storefront
      initialProducts={initialProducts}
      categoryOptions={categoryOptions}
      initialHasMore={initialHasMore}
      initialCursor={initialCursor}
      demoMode={false}
      initialCatalogError={initialCatalogError}
    />
  );
}

function CatalogFallback() {
  return (
    <main dir="rtl" className="min-h-screen bg-slate-50 px-4 py-12">
      <div className="mx-auto max-w-7xl animate-pulse">
        <div className="h-12 w-full rounded-xl bg-slate-200" />
        <div className="mt-8 h-40 rounded-3xl bg-slate-200" />
        <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className="h-72 rounded-2xl bg-slate-200" />
          ))}
        </div>
      </div>
    </main>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<CatalogFallback />}>
      <StorefrontContent />
    </Suspense>
  );
}
