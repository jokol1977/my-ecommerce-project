import { getPublicCatalog } from "@/lib/catalog";
import { checkRequestIpRateLimit } from "@/lib/rate-limit";
import type { CatalogCursor } from "@/types/catalog";

export const runtime = "nodejs";

const MAX_PAGE = 200;
const MAX_QUERY_LENGTH = 80;
const MAX_PRICE_TOMAN = 2_147_483_647;

const responseHeaders = {
  "Cache-Control": "no-store",
};

function decodeCursor(value: string, sort: string): CatalogCursor | null {
  if (value.length > 256 || !/^[A-Za-z0-9_-]+$/.test(value)) return null;
  try {
    const decoded = Buffer.from(value, "base64url");
    if (decoded.toString("base64url") !== value) return null;
    const payload: unknown = JSON.parse(decoded.toString("utf8"));
    if (typeof payload !== "object" || payload === null || Array.isArray(payload) || !("id" in payload) || !("sort" in payload)) return null;
    if (typeof payload.id !== "string" || !/^[a-zA-Z0-9_-]{1,40}$/.test(payload.id) || payload.sort !== sort) return null;
    if (sort === "newest" && "createdAt" in payload && typeof payload.createdAt === "string") {
      const date = new Date(payload.createdAt);
      if (Number.isFinite(date.getTime()) && date.toISOString() === payload.createdAt) {
        return { id: payload.id, sort: "newest", createdAt: payload.createdAt };
      }
    }
    if ((sort === "price-asc" || sort === "price-desc") && "priceToman" in payload && Number.isSafeInteger(payload.priceToman) && Number(payload.priceToman) >= 0 && Number(payload.priceToman) <= MAX_PRICE_TOMAN) {
      return { id: payload.id, sort, priceToman: Number(payload.priceToman) };
    }
    return null;
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  try {
    const rateLimit = await checkRequestIpRateLimit(request, "public-catalog", 300, 60);
    if (!rateLimit.allowed) {
      return Response.json(
        { error: "تعداد درخواست‌های فهرست کالا بیش از حد مجاز است." },
        {
          status: 429,
          headers: { ...responseHeaders, "Retry-After": String(rateLimit.retryAfterSeconds) },
        },
      );
    }
  } catch {
    console.error("Public catalog rate-limit check failed.");
    return Response.json(
      { error: "بررسی درخواست فهرست کالا در حال حاضر ممکن نیست." },
      { status: 503, headers: responseHeaders },
    );
  }

  const searchParams = new URL(request.url).searchParams;
  const rawPage = searchParams.get("page");
  const rawCursor = searchParams.get("cursor");
  const page = rawPage === null ? 1 : Number(rawPage);
  const query = (searchParams.get("q") ?? "").trim();
  const categoryId = (searchParams.get("categoryId") ?? "").trim();
  const sort = searchParams.get("sort") ?? "newest";
  const rawMinPrice = searchParams.get("minPrice");
  const rawMaxPrice = searchParams.get("maxPrice");
  const rawInStock = searchParams.get("inStock");
  const inStockOnly = rawInStock === "1";
  const minPriceToman = rawMinPrice === null ? undefined : Number(rawMinPrice);
  const maxPriceToman = rawMaxPrice === null ? undefined : Number(rawMaxPrice);
  const cursor = rawCursor === null ? undefined : decodeCursor(rawCursor, sort);

  if (
    !Number.isInteger(page) ||
    page < 1 ||
    (cursor === undefined && page > MAX_PAGE) ||
    (rawCursor !== null && cursor === undefined) ||
    (cursor !== undefined && rawPage !== null) ||
    query.length > MAX_QUERY_LENGTH ||
    (categoryId !== "" && !/^[a-zA-Z0-9_-]{1,50}$/.test(categoryId)) ||
    (sort !== "newest" && sort !== "price-asc" && sort !== "price-desc") ||
    (rawMinPrice !== null && (!/^\d{1,10}$/.test(rawMinPrice) || !Number.isSafeInteger(minPriceToman) || minPriceToman! > MAX_PRICE_TOMAN)) ||
    (rawMaxPrice !== null && (!/^\d{1,10}$/.test(rawMaxPrice) || !Number.isSafeInteger(maxPriceToman) || maxPriceToman! > MAX_PRICE_TOMAN)) ||
    (minPriceToman !== undefined && maxPriceToman !== undefined && minPriceToman > maxPriceToman) ||
    (rawInStock !== null && rawInStock !== "1")
  ) {
    return Response.json(
      { error: "پارامترهای جست‌وجو معتبر نیستند." },
      { status: 400, headers: responseHeaders },
    );
  }

  try {
    const catalog = await getPublicCatalog({
      query,
      categoryId,
      ...(cursor ? { cursor } : { page }),
      sort,
      minPriceToman,
      maxPriceToman,
      inStockOnly,
    });

    return Response.json(
      catalog,
      { headers: responseHeaders },
    );
  } catch (error) {
    console.error("Product catalog query failed.", error);

    return Response.json(
      { error: "در حال حاضر دریافت محصولات ممکن نیست." },
      { status: 503, headers: responseHeaders },
    );
  }
}
