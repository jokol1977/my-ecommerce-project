import type { MetadataRoute } from "next";
import { connection } from "next/server";
import { getPrisma } from "@/lib/prisma";
import {
  getPublicSiteOrigin,
  PRODUCT_SITEMAP_PRODUCT_LIMIT,
  publicProductWhere,
} from "@/lib/seo";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  await connection();
  const origin = getPublicSiteOrigin();
  if (!origin) return [];

  const entries: MetadataRoute.Sitemap = [{ url: origin, changeFrequency: "daily", priority: 1 }];
  if (!process.env.DATABASE_URL) return entries;

  const products = await getPrisma().product.findMany({
    where: publicProductWhere,
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    take: PRODUCT_SITEMAP_PRODUCT_LIMIT,
    select: {
      slug: true,
      updatedAt: true,
      vendor: { select: { slug: true } },
      images: { take: 1, orderBy: { position: "asc" }, select: { url: true } },
    },
  });

  return entries.concat(products.map((product) => ({
    url: `${origin}/products/${encodeURIComponent(product.vendor.slug)}/${encodeURIComponent(product.slug)}`,
    lastModified: product.updatedAt,
    changeFrequency: "weekly" as const,
    priority: 0.7,
    ...(product.images[0]?.url ? { images: [product.images[0].url] } : {}),
  })));
}
