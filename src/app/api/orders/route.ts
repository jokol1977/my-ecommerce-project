import { createHmac } from "node:crypto";
import { auth } from "@/auth";
import { getPrisma } from "@/lib/prisma";
import { ORDER_PAYMENT_WINDOW_MS, releaseExpiredOrderReservations } from "@/lib/order-reservations";
import { checkAccountRateLimit } from "@/lib/rate-limit";
import { MAX_ORDER_TOTAL_TOMAN } from "@/lib/money";
import { isProductionCheckoutConfigured } from "@/lib/payment-config";
import { findIranCity, findIranProvince } from "@/lib/iran-locations";
import { isValidIranianPostalCode, normalizeIranianDigits, normalizeIranianMobile } from "@/lib/iranian-input";

export const runtime = "nodejs";

const MAX_BODY_SIZE = 16_384;
const MAX_ITEMS = 50;
const MAX_QUANTITY = 99;
const responseHeaders = { "Cache-Control": "no-store" };

type CheckoutItem = { productId: string; quantity: number };
type ExpectedPrice = { productId: string; unitPriceToman: number };
type DeliveryAddress = {
  recipient: string;
  phone: string;
  province: string;
  city: string;
  addressLine: string;
  buildingNumber: string | null;
  unit: string | null;
  postalCode: string;
};

class CheckoutError extends Error {
  constructor(public status: number, message: string, public code?: string) {
    super(message);
  }
}

async function readBody(request: Request): Promise<string | null> {
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

  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseItems(value: unknown): CheckoutItem[] {
  if (!record(value) || !Array.isArray(value.items) || value.items.length < 1 || value.items.length > MAX_ITEMS) {
    throw new CheckoutError(400, "اقلام سفارش معتبر نیستند.");
  }

  const result: CheckoutItem[] = [];
  const seen = new Set<string>();
  for (const item of value.items) {
    if (!record(item) || typeof item.productId !== "string" || !/^[a-zA-Z0-9_-]{1,40}$/.test(item.productId)) {
      throw new CheckoutError(400, "شناسهٔ کالا معتبر نیست.");
    }
    if (!Number.isSafeInteger(item.quantity) || Number(item.quantity) < 1 || Number(item.quantity) > MAX_QUANTITY) {
      throw new CheckoutError(400, "تعداد کالا معتبر نیست.");
    }
    if (seen.has(item.productId)) throw new CheckoutError(400, "یک کالا بیش از یک بار در فهرست آمده است.");
    seen.add(item.productId);
    result.push({ productId: item.productId, quantity: Number(item.quantity) });
  }
  return result;
}

function parseExpectedPrices(value: unknown, items: CheckoutItem[]): ExpectedPrice[] | null {
  if (!Array.isArray(value) || value.length !== items.length) return null;

  const itemIds = new Set(items.map((item) => item.productId));
  const prices = new Map<string, number>();
  for (const entry of value) {
    if (!record(entry) || typeof entry.productId !== "string" || !itemIds.has(entry.productId)) return null;
    if (!Number.isSafeInteger(entry.unitPriceToman) || Number(entry.unitPriceToman) < 0 || Number(entry.unitPriceToman) > MAX_ORDER_TOTAL_TOMAN) return null;
    if (prices.has(entry.productId)) return null;
    prices.set(entry.productId, Number(entry.unitPriceToman));
  }
  if (prices.size !== itemIds.size) return null;

  return [...prices.entries()]
    .map(([productId, unitPriceToman]) => ({ productId, unitPriceToman }))
    .sort((left, right) => left.productId.localeCompare(right.productId));
}

function requiredText(value: unknown, label: string, min: number, max: number) {
  if (typeof value !== "string") throw new CheckoutError(400, `${label} معتبر نیست.`);
  const cleaned = value.normalize("NFKC").trim();
  if (cleaned.length < min || cleaned.length > max || /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(cleaned)) {
    throw new CheckoutError(400, `${label} معتبر نیست.`);
  }
  return cleaned;
}

function optionalAddressDetail(value: unknown, label: string) {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") throw new CheckoutError(400, `${label} معتبر نیست.`);
  const cleaned = value.normalize("NFKC").trim();
  if (cleaned.length > 40 || /[\u0000-\u001f\u007f]/.test(cleaned)) throw new CheckoutError(400, `${label} معتبر نیست.`);
  return cleaned || null;
}

function parseAddress(value: unknown): DeliveryAddress {
  if (!record(value)) throw new CheckoutError(400, "نشانی تحویل کامل نیست.");
  const recipient = requiredText(value.recipient, "نام تحویل‌گیرنده", 2, 120);
  const phone = normalizeIranianMobile(requiredText(value.phone, "شمارهٔ تماس", 8, 24));
  const province = findIranProvince(requiredText(value.province, "استان", 2, 100));
  const rawCity = requiredText(value.city, "شهر", 2, 100);
  const city = province ? findIranCity(province, rawCity) : null;
  const addressLine = requiredText(value.addressLine, "نشانی", 8, 1000);
  const buildingNumber = optionalAddressDetail(value.buildingNumber, "شمارهٔ پلاک");
  const unit = optionalAddressDetail(value.unit, "طبقه / واحد");
  const postalCode = requiredText(value.postalCode, "کد پستی", 10, 10);

  if (!phone) throw new CheckoutError(400, "شمارهٔ موبایل معتبر نیست.");
  if (!province || !city) throw new CheckoutError(400, "استان و شهر انتخاب‌شده معتبر نیستند.");
  const normalizedPostalCode = normalizeIranianDigits(postalCode);
  if (!isValidIranianPostalCode(normalizedPostalCode)) throw new CheckoutError(400, "کد پستی باید ۱۰ رقم باشد.");

  return { recipient, phone, province, city, addressLine, buildingNumber, unit, postalCode: normalizedPostalCode };
}

function jsonError(message: string, status: number, code?: string) {
  return Response.json({ error: message, ...(code ? { code } : {}) }, { status, headers: responseHeaders });
}

export async function POST(request: Request) {
  const configuredOrigin = process.env.AUTH_URL;
  const isProduction = process.env.NODE_ENV === "production";
  if (isProduction && !configuredOrigin) {
    return jsonError("نشانی رسمی سایت برای ثبت سفارش پیکربندی نشده است.", 503);
  }
  if (isProduction && !isProductionCheckoutConfigured()) {
    return jsonError(
      "ثبت سفارش واقعی تا آماده‌شدن فرآیندهای فروش، بازگشت وجه و تسویه غیرفعال است.",
      503,
      "PAYMENT_NOT_CONFIGURED",
    );
  }

  const origin = request.headers.get("origin");
  try {
    const expectedOrigin = new URL(configuredOrigin ?? request.url).origin;
    if (!origin || new URL(origin).origin !== expectedOrigin) return jsonError("مبدأ درخواست معتبر نیست.", 403);
  } catch {
    return jsonError("مبدأ درخواست معتبر نیست.", 403);
  }

  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    return jsonError("فرمت درخواست معتبر نیست.", 415);
  }

  const key = request.headers.get("idempotency-key") ?? "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(key)) {
    return jsonError("شناسهٔ تلاش سفارش معتبر نیست.", 400);
  }

  let payload: unknown;
  try {
    const body = await readBody(request);
    if (body === null) return jsonError("درخواست بیش از حد بزرگ است.", 413);
    payload = JSON.parse(body);
  } catch {
    return jsonError("بدنهٔ درخواست معتبر نیست.", 400);
  }

  if (!record(payload)) return jsonError("اطلاعات سفارش معتبر نیست.", 400);

  let items: CheckoutItem[];
  let expectedPrices: ExpectedPrice[] | null;
  let address: DeliveryAddress | null = null;
  let addressId: string | null = null;
  try {
    items = parseItems(payload);
    expectedPrices = parseExpectedPrices(payload.expectedPrices, items);
    if (!expectedPrices) throw new CheckoutError(400, "قیمت‌های تأییدشدهٔ سبد معتبر نیستند.");
    if (payload.addressId !== undefined) {
      if (typeof payload.addressId !== "string" || !/^[a-zA-Z0-9_-]{1,40}$/.test(payload.addressId)) throw new CheckoutError(400, "شناسهٔ نشانی معتبر نیست.");
      addressId = payload.addressId;
    } else {
      address = parseAddress(payload.address);
    }
  } catch (error) {
    if (error instanceof CheckoutError) return jsonError(error.message, error.status);
    return jsonError("اطلاعات سفارش معتبر نیست.", 400);
  }

  const session = await auth();
  if (!session?.user?.id) return jsonError("برای ثبت سفارش ابتدا وارد حساب شوید.", 401);
  if (session.user.status !== "ACTIVE" || session.user.role !== "CUSTOMER") return jsonError("دسترسی مشتری فعال لازم است.", 403);
  if (!process.env.AUTH_SECRET) return jsonError("تنظیم امنیتی ثبت سفارش کامل نیست.", 503);

  const rateLimit = await checkAccountRateLimit("checkout", session.user.id, 20, 60 * 60);
  if (!rateLimit.allowed) {
    return Response.json({ error: "درخواست‌های ثبت سفارش بیش از حد مجاز است. لطفاً کمی بعد دوباره تلاش کنید." }, {
      status: 429,
      headers: { ...responseHeaders, "Retry-After": String(rateLimit.retryAfterSeconds) },
    });
  }

  const fingerprint = createHmac("sha256", process.env.AUTH_SECRET)
    .update(JSON.stringify({ items, expectedPrices, address: addressId ? { addressId } : address }))
    .digest("hex");

  try {
    const result = await getPrisma().$transaction(async (tx) => {
      await releaseExpiredOrderReservations(tx);
      const existing = await tx.order.findUnique({
        where: { idempotencyKey: key },
        select: { id: true, customerId: true, requestFingerprint: true, totalToman: true, status: true, paymentExpiresAt: true },
      });
      if (existing) {
        if (existing.customerId !== session.user.id || existing.requestFingerprint !== fingerprint) {
          throw new CheckoutError(409, "این شناسهٔ سفارش قبلاً برای درخواست دیگری استفاده شده است.", "IDEMPOTENCY_CONFLICT");
        }
        if (existing.status === "CANCELLED" && existing.paymentExpiresAt === null) {
          throw new CheckoutError(409, "مهلت پرداخت این سفارش پایان یافته است؛ سفارش تازه‌ای ثبت کنید.", "ORDER_EXPIRED");
        }
        return { orderId: existing.id, totalToman: existing.totalToman, status: existing.status, reused: true };
      }

      const customer = await tx.user.findFirst({
        where: { id: session.user.id, status: "ACTIVE", emailVerified: { not: null } },
        select: { id: true },
      });
      if (!customer) throw new CheckoutError(403, "حساب فعال و تأییدشده لازم است.");

      let orderAddress = address;
      if (addressId) {
        const savedAddress = await tx.address.findFirst({ where: { id: addressId, userId: customer.id } });
        if (!savedAddress) throw new CheckoutError(404, "نشانی ذخیره‌شده پیدا نشد.");
        orderAddress = {
          recipient: savedAddress.recipient,
          phone: savedAddress.phone,
          province: savedAddress.province,
          city: savedAddress.city,
          addressLine: savedAddress.addressLine,
          buildingNumber: savedAddress.buildingNumber,
          unit: savedAddress.unit,
          postalCode: savedAddress.postalCode,
        };
      }
      if (!orderAddress) throw new CheckoutError(400, "نشانی تحویل کامل نیست.");

      const products = await tx.product.findMany({
        where: {
          id: { in: items.map((item) => item.productId) },
          status: "ACTIVE",
          vendor: { status: "ACTIVE" },
          category: { isActive: true },
        },
        select: { id: true, name: true, vendorId: true, priceToman: true, stockQuantity: true },
      });
      const productsById = new Map(products.map((product) => [product.id, product]));
      const expectedPricesByProduct = new Map(expectedPrices.map((price) => [price.productId, price.unitPriceToman]));
      const orderLines = items.map((item) => {
        const product = productsById.get(item.productId);
        if (product && product.priceToman !== expectedPricesByProduct.get(product.id)) throw new CheckoutError(409, "قیمت یکی از کالاها تغییر کرده است.", "PRICE_CHANGED");
        if (!product) throw new CheckoutError(409, "یکی از کالاها دیگر برای سفارش در دسترس نیست.", "CART_CHANGED");
        if (product.stockQuantity < item.quantity) throw new CheckoutError(409, `موجودی «${product.name}» برای تعداد درخواستی کافی نیست.`, "CART_CHANGED");
        return { ...item, product, lineTotalToman: product.priceToman * item.quantity };
      });

      const totalToman = orderLines.reduce((total, line) => total + line.lineTotalToman, 0);
      if (!Number.isSafeInteger(totalToman) || totalToman < 1 || totalToman > MAX_ORDER_TOTAL_TOMAN) {
        throw new CheckoutError(400, "مبلغ کل از محدودهٔ قابل ثبت خارج است.");
      }

      for (const line of [...orderLines].sort((left, right) => left.product.id.localeCompare(right.product.id))) {
        const reserved = await tx.product.updateMany({
          where: {
            id: line.product.id,
            status: "ACTIVE",
            stockQuantity: { gte: line.quantity },
            vendor: { status: "ACTIVE" },
            category: { isActive: true },
          },
          data: { stockQuantity: { decrement: line.quantity } },
        });
        if (reserved.count !== 1) throw new CheckoutError(409, `موجودی «${line.product.name}» در همین فاصله تغییر کرد؛ سبد را دوباره بررسی کنید.`, "CART_CHANGED");
      }

      const groups = new Map<string, typeof orderLines>();
      for (const line of orderLines) {
        const group = groups.get(line.product.vendorId) ?? [];
        group.push(line);
        groups.set(line.product.vendorId, group);
      }

      const order = await tx.order.create({
        data: {
          idempotencyKey: key,
          requestFingerprint: fingerprint,
          customerId: customer.id,
          ...orderAddress,
          subtotalToman: totalToman,
          shippingFeeToman: 0,
          totalToman,
          status: "PENDING_PAYMENT",
          paymentExpiresAt: new Date(Date.now() + ORDER_PAYMENT_WINDOW_MS),
          vendorOrders: {
            create: [...groups.entries()].map(([vendorId, lines]) => ({
              vendorId,
              subtotalToman: lines.reduce((sum, line) => sum + line.lineTotalToman, 0),
              status: "PENDING_PAYMENT" as const,
              items: {
                create: lines.map((line) => ({
                  productId: line.product.id,
                  productName: line.product.name,
                  quantity: line.quantity,
                  unitPriceToman: line.product.priceToman,
                })),
              },
            })),
          },
        },
        select: { id: true, totalToman: true, status: true },
      });

      return { orderId: order.id, totalToman: order.totalToman, status: order.status, reused: false };
    }, { isolationLevel: "Serializable", timeout: 15_000 });

    return Response.json(result, { status: result.reused ? 200 : 201, headers: responseHeaders });
  } catch (error) {
    if (error instanceof CheckoutError) return jsonError(error.message, error.status, error.code);
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2034") {
      return jsonError("درخواست هم‌زمان دیگری موجودی یا سفارش را تغییر داد؛ سبد را دوباره بررسی کنید.", 409, "CART_CHANGED");
    }
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") {
      const existing = await getPrisma().order.findUnique({
        where: { idempotencyKey: key },
        select: { id: true, customerId: true, requestFingerprint: true, totalToman: true, status: true, paymentExpiresAt: true },
      });
      if (existing?.customerId === session.user.id && existing.requestFingerprint === fingerprint) {
        if (existing.status === "CANCELLED" && existing.paymentExpiresAt === null) return jsonError("مهلت پرداخت این سفارش پایان یافته است؛ سفارش تازه‌ای ثبت کنید.", 409, "ORDER_EXPIRED");
        return Response.json({ orderId: existing.id, totalToman: existing.totalToman, status: existing.status, reused: true }, { headers: responseHeaders });
      }
      return jsonError("این درخواست سفارش قبلاً ثبت شده است.", 409, "IDEMPOTENCY_CONFLICT");
    }
    console.error("Order creation failed.", error);
    return jsonError("در حال حاضر ثبت سفارش ممکن نیست.", 503);
  }
}
