import "server-only";
import { checkAccountRateLimit } from "@/lib/rate-limit";

const noStore = { "Cache-Control": "no-store" };

type WriteKind = "create" | "update" | "image";

const policies = {
  create: { scope: "vendor-product-create", limit: 20 },
  update: { scope: "vendor-product-update", limit: 120 },
  image: { scope: "vendor-product-image", limit: 30 },
} satisfies Record<WriteKind, { scope: string; limit: number }>;

/** Share seller catalog write limits across all app instances through Redis in production. */
export async function limitVendorCatalogWrites(userId: string, kind: WriteKind): Promise<Response | null> {
  try {
    const policy = policies[kind];
    const rateLimit = await checkAccountRateLimit(policy.scope, userId, policy.limit, 60 * 60);
    if (!rateLimit.allowed) {
      const error = kind === "create"
        ? "سقف ثبت کالای جدید در این ساعت به پایان رسیده است. بعداً دوباره تلاش کنید."
        : kind === "image"
          ? "سقف بارگذاری و حذف تصویر در این ساعت به پایان رسیده است. بعداً دوباره تلاش کنید."
          : "سقف تغییر اطلاعات و موجودی کالا در این ساعت به پایان رسیده است. بعداً دوباره تلاش کنید.";
      return Response.json({ error }, {
        status: 429,
        headers: { ...noStore, "Retry-After": String(rateLimit.retryAfterSeconds) },
      });
    }
    return null;
  } catch (error) {
    console.error("Vendor catalog write rate limit check failed.", error);
    return Response.json({ error: "بررسی محدودیت درخواست‌های فروشنده موقتاً در دسترس نیست." }, {
      status: 503,
      headers: noStore,
    });
  }
}
