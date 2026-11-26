import "server-only";

export const PRODUCT_SITEMAP_PRODUCT_LIMIT = 49_999;

export function getPublicSiteOrigin() {
  const configuredUrl = process.env.AUTH_URL;
  if (!configuredUrl) return null;

  try {
    const url = new URL(configuredUrl);
    if (url.pathname !== "/" || url.search || url.hash) return null;
    if (process.env.NODE_ENV === "production" && url.protocol !== "https:") return null;
    return url.origin;
  } catch {
    return null;
  }
}

const publicProductWhere = {
  status: "ACTIVE" as const,
  vendor: { status: "ACTIVE" as const },
  category: { isActive: true },
};

export { publicProductWhere };
