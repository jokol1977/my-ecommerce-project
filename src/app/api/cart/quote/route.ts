import { getPrisma } from "@/lib/prisma";
import { MAX_ORDER_TOTAL_TOMAN } from "@/lib/money";
import { checkRequestIpRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

const MAX_BODY_SIZE = 8_192;
const MAX_ITEMS = 50;
const MAX_QUANTITY = 99;
const headers = { "Cache-Control": "no-store" };

type RequestedItem = { productId: string; quantity: number };

async function readBoundedBody(request: Request): Promise<string | null> {
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_SIZE) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(body);
}

function parseItems(value: unknown): RequestedItem[] | null {
  if (typeof value !== "object" || value === null || !("items" in value)) return null;
  const items = value.items;
  if (!Array.isArray(items) || items.length === 0 || items.length > MAX_ITEMS) return null;

  const parsed: RequestedItem[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    if (typeof item !== "object" || item === null || !("productId" in item) || !("quantity" in item)) return null;
    if (typeof item.productId !== "string" || !/^[a-zA-Z0-9_-]{1,40}$/.test(item.productId)) return null;
    if (!Number.isSafeInteger(item.quantity) || Number(item.quantity) < 1 || Number(item.quantity) > MAX_QUANTITY) return null;
    if (seen.has(item.productId)) return null;
    seen.add(item.productId);
    parsed.push({ productId: item.productId, quantity: Number(item.quantity) });
  }
  return parsed;
}

export async function POST(request: Request) {
  try {
    const rateLimit = await checkRequestIpRateLimit(request, "cart-quote", 60, 60);
    if (!rateLimit.allowed) {
      return Response.json({ error: "تعداد درخواست‌ها بیش از حد مجاز است." }, {
        status: 429,
        headers: { ...headers, "Retry-After": String(rateLimit.retryAfterSeconds) },
      });
    }
  } catch (error) {
    console.error("Cart quote rate-limit check failed.", error);
    return Response.json({ error: "بررسی درخواست در حال حاضر ممکن نیست." }, { status: 503, headers });
  }

  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    return Response.json({ error: "فرمت درخواست معتبر نیست." }, { status: 415, headers });
  }

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_BODY_SIZE) {
    return Response.json({ error: "درخواست بیش از حد بزرگ است." }, { status: 413, headers });
  }

  let payload: unknown;
  try {
    const body = await readBoundedBody(request);
    if (body === null) {
      return Response.json({ error: "درخواست بیش از حد بزرگ است." }, { status: 413, headers });
    }
    payload = JSON.parse(body);
  } catch {
    return Response.json({ error: "بدنهٔ درخواست معتبر نیست." }, { status: 400, headers });
  }

  const items = parseItems(payload);
  if (!items) {
    return Response.json({ error: "اقلام سبد معتبر نیستند." }, { status: 400, headers });
  }

  try {
    const products = await getPrisma().product.findMany({
      where: {
        id: { in: items.map((item) => item.productId) },
        status: "ACTIVE",
        vendor: { status: "ACTIVE" },
        category: { isActive: true },
      },
      select: {
        id: true,
        name: true,
        priceToman: true,
        stockQuantity: true,
        vendor: { select: { storeName: true } },
      },
    });

    const productsById = new Map(products.map((product) => [product.id, product]));
    const lines = items.map((item) => {
      const product = productsById.get(item.productId);
      const available = Boolean(product && product.stockQuantity >= item.quantity);
      return {
        productId: item.productId,
        name: product?.name ?? null,
        vendorName: product?.vendor.storeName ?? null,
        quantity: item.quantity,
        unitPriceToman: product?.priceToman ?? null,
        lineTotalToman: product ? product.priceToman * item.quantity : null,
        stockQuantity: product?.stockQuantity ?? 0,
        available,
      };
    });

    const totalToman = lines.reduce((total, line) => total + (line.available ? line.lineTotalToman ?? 0 : 0), 0);
    const cartTotalToman = lines.reduce((total, line) => total + (line.lineTotalToman ?? 0), 0);
    const totalExceedsLimit = cartTotalToman > MAX_ORDER_TOTAL_TOMAN;
    return Response.json({
      lines,
      totalToman,
      totalExceedsLimit,
      canContinue: lines.every((line) => line.available) && !totalExceedsLimit,
    }, { headers });
  } catch (error) {
    console.error("Cart quote query failed.", error);
    return Response.json({ error: "در حال حاضر بررسی سبد خرید ممکن نیست." }, { status: 503, headers });
  }
}
