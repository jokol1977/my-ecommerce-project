export interface PublicCatalogProduct {
  id: string;
  slug: string;
  name: string;
  priceToman: number;
  inStock: boolean;
  averageRating?: number | null;
  reviewCount?: number;
  category: { name: string; slug: string; path: string };
  vendor: { storeName: string; slug: string };
  image: { url: string; altText: string } | null;
}

export interface PublicProductDetails extends PublicCatalogProduct {
  description: string;
  brandName: string | null;
  productType: string | null;
  modelCode: string | null;
  originCountry: string | null;
  warrantyDescription: string | null;
  specificationsText: string | null;
  images: Array<{ url: string; altText: string }>;
}

export type CatalogCursor =
  | { id: string; sort: "newest"; createdAt: string }
  | { id: string; sort: "price-asc" | "price-desc"; priceToman: number };

export interface PublicCatalogPage {
  products: PublicCatalogProduct[];
  page: number;
  pageSize: number;
  hasMore: boolean;
  nextCursor: string | null;
}

export interface StorefrontProduct {
  id: string | number;
  name: string;
  price: string;
  image: string;
  vendorName: string;
  category: string;
  badge: string;
  inStock?: boolean;
  averageRating?: number | null;
  reviewCount?: number;
  href?: string;
  vendorHref?: string;
}

export function toStorefrontProduct(
  product: PublicCatalogProduct,
): StorefrontProduct {
  return {
    id: product.id,
    name: product.name,
    price: new Intl.NumberFormat("fa-IR").format(product.priceToman),
    image: product.image?.url ?? "/images/placeholder.png",
    vendorName: product.vendor.storeName,
    category: product.category.path,
    badge: product.inStock ? "موجود" : "ناموجود",
    inStock: product.inStock,
    averageRating: product.averageRating,
    reviewCount: product.reviewCount,
    href: `/products/${encodeURIComponent(product.vendor.slug)}/${encodeURIComponent(product.slug)}`,
    vendorHref: `/stores/${encodeURIComponent(product.vendor.slug)}`,
  };
}
