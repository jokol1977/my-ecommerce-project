import "server-only";
import { getPrisma } from "@/lib/prisma";
import { getCategoryBranchIds, getCategoryPaths } from "@/lib/category-tree";
import type { CatalogCursor, PublicCatalogPage, PublicProductDetails } from "@/types/catalog";

export const CATALOG_PAGE_SIZE = 24;
export type CatalogSort = "newest" | "price-asc" | "price-desc";

export function hasCatalogDatabaseConfiguration() {
  return Boolean(process.env.DATABASE_URL);
}

export function shouldUseDemoCatalog() {
  return process.env.NODE_ENV === "development" && !hasCatalogDatabaseConfiguration();
}

export async function getPublicCatalog(input: {
  query?: string;
  categoryId?: string;
  vendorSlug?: string;
  page?: number;
  cursor?: CatalogCursor;
  sort?: CatalogSort;
  minPriceToman?: number;
  maxPriceToman?: number;
  inStockOnly?: boolean;
} = {}): Promise<PublicCatalogPage> {
  const page = input.page ?? 1;
  const query = input.query?.trim() ?? "";
  const categoryId = input.categoryId?.trim() ?? "";
  const vendorSlug = input.vendorSlug?.trim() ?? "";
  const minPriceToman = input.minPriceToman;
  const maxPriceToman = input.maxPriceToman;
  const inStockOnly = input.inStockOnly ?? false;
  const sort = input.sort ?? "newest";
  const prisma = getPrisma();
  const activeCategories = await prisma.category.findMany({
    where: { isActive: true },
    select: { id: true, parentId: true, name: true },
  });
  const categoryPaths = getCategoryPaths(activeCategories);
  const categoryIds = categoryId
    ? activeCategories.some((category) => category.id === categoryId)
      ? getCategoryBranchIds(activeCategories, categoryId)
      : []
    : undefined;
  const orderBy = sort === "price-asc"
    ? [{ priceToman: "asc" as const }, { id: "asc" as const }]
    : sort === "price-desc"
      ? [{ priceToman: "desc" as const }, { id: "desc" as const }]
      : [{ createdAt: "desc" as const }, { id: "desc" as const }];
  const cursorWhere = input.cursor?.sort === "newest"
    ? {
        OR: [
          { createdAt: { lt: new Date(input.cursor.createdAt) } },
          { createdAt: new Date(input.cursor.createdAt), id: { lt: input.cursor.id } },
        ],
      }
    : input.cursor?.sort === "price-asc"
      ? {
          OR: [
            { priceToman: { gt: input.cursor.priceToman } },
            { priceToman: input.cursor.priceToman, id: { gt: input.cursor.id } },
          ],
        }
      : input.cursor?.sort === "price-desc"
        ? {
            OR: [
              { priceToman: { lt: input.cursor.priceToman } },
              { priceToman: input.cursor.priceToman, id: { lt: input.cursor.id } },
            ],
          }
        : undefined;

  const results = await prisma.product.findMany({
    where: {
      status: "ACTIVE",
      ...(inStockOnly ? { stockQuantity: { gt: 0 } } : {}),
      vendor: { status: "ACTIVE", ...(vendorSlug ? { slug: vendorSlug } : {}) },
      category: {
        isActive: true,
        ...(categoryIds !== undefined ? { id: { in: categoryIds } } : {}),
      },
      ...(minPriceToman !== undefined || maxPriceToman !== undefined
        ? { priceToman: { ...(minPriceToman !== undefined ? { gte: minPriceToman } : {}), ...(maxPriceToman !== undefined ? { lte: maxPriceToman } : {}) } }
        : {}),
      ...(query
        ? {
            OR: [
              { name: { contains: query, mode: "insensitive" } },
              {
                description: {
                  contains: query,
                  mode: "insensitive",
                },
              },
              {
                vendor: {
                  storeName: { contains: query, mode: "insensitive" },
                  status: "ACTIVE",
                },
              },
            ],
          }
        : {}),
      ...(cursorWhere ? { AND: [cursorWhere] } : {}),
    },
    orderBy,
    skip: input.cursor ? 0 : (page - 1) * CATALOG_PAGE_SIZE,
    take: CATALOG_PAGE_SIZE + 1,
    select: {
      id: true,
      createdAt: true,
      slug: true,
      name: true,
      priceToman: true,
      stockQuantity: true,
      category: { select: { id: true, name: true, slug: true } },
      vendor: { select: { storeName: true, slug: true } },
      images: {
        take: 1,
        orderBy: { position: "asc" },
        select: { url: true, altText: true },
      },
    },
  });

  const hasMore = results.length > CATALOG_PAGE_SIZE;
  const visibleProducts = results.slice(0, CATALOG_PAGE_SIZE);
  const reviewSummaries = visibleProducts.length
    ? await prisma.productReview.groupBy({
        by: ["productId"],
        where: { productId: { in: visibleProducts.map((product) => product.id) }, status: "APPROVED" },
        _avg: { rating: true },
        _count: { _all: true },
      })
    : [];
  const ratingsByProduct = new Map(reviewSummaries.map((summary) => [summary.productId, {
    averageRating: summary._avg.rating,
    reviewCount: summary._count._all,
  }]));
  const products = visibleProducts.map((product) => ({
    id: product.id,
    slug: product.slug,
    name: product.name,
    priceToman: product.priceToman,
    inStock: product.stockQuantity > 0,
    category: {
      name: product.category.name,
      slug: product.category.slug,
      path: categoryPaths.get(product.category.id) ?? product.category.name,
    },
    vendor: product.vendor,
    image: product.images[0] ?? null,
    averageRating: ratingsByProduct.get(product.id)?.averageRating ?? null,
    reviewCount: ratingsByProduct.get(product.id)?.reviewCount ?? 0,
  }));

  const lastVisibleProduct = visibleProducts.at(-1);
  const nextCursor = hasMore && lastVisibleProduct
    ? Buffer.from(JSON.stringify(sort === "newest"
        ? { id: lastVisibleProduct.id, sort, createdAt: lastVisibleProduct.createdAt.toISOString() }
        : { id: lastVisibleProduct.id, sort, priceToman: lastVisibleProduct.priceToman }), "utf8").toString("base64url")
    : null;
  return {
    products,
    page,
    pageSize: CATALOG_PAGE_SIZE,
    hasMore,
    nextCursor,
  };
}

export async function getPublicVendorStore(slug: string) {
  return getPrisma().vendorProfile.findFirst({
    where: {
      slug,
      status: "ACTIVE",
      user: { status: "ACTIVE", role: "VENDOR" },
    },
    select: { storeName: true, slug: true, description: true },
  });
}

export async function getPublicProduct(
  vendorSlug: string,
  productSlug: string,
): Promise<PublicProductDetails | null> {
  const product = await getPrisma().product.findFirst({
    where: {
      slug: productSlug,
      status: "ACTIVE",
      vendor: { slug: vendorSlug, status: "ACTIVE" },
      category: { isActive: true },
    },
    select: {
      id: true,
      slug: true,
      name: true,
      description: true,
      priceToman: true,
      stockQuantity: true,
      category: { select: { id: true, name: true, slug: true } },
      vendor: { select: { storeName: true, slug: true } },
      images: {
        orderBy: { position: "asc" },
        select: { url: true, altText: true },
      },
    },
  });

  if (!product) return null;

  const categories = await getPrisma().category.findMany({
    where: { isActive: true },
    select: { id: true, name: true, parentId: true },
  });
  const categoryPath = getCategoryPaths(categories).get(product.category.id) ?? product.category.name;

  return {
    id: product.id,
    slug: product.slug,
    name: product.name,
    description: product.description,
    priceToman: product.priceToman,
    inStock: product.stockQuantity > 0,
    category: { ...product.category, path: categoryPath },
    vendor: product.vendor,
    image: product.images[0] ?? null,
    images: product.images,
  };
}
