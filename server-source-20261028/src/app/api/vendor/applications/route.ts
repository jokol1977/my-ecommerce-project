import { randomUUID } from "node:crypto";
import { auth } from "@/auth";
import { getPrisma } from "@/lib/prisma";
import { readRequestBody } from "@/lib/request-body";
import { checkAccountRateLimit } from "@/lib/rate-limit";
import { isVendorApprovalEnabled } from "@/lib/marketplace-config";

export const runtime = "nodejs";
const noStore = { "Cache-Control": "no-store" };

function responseError(message: string, status: number) {
  return Response.json({ error: message }, { status, headers: noStore });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return responseError("برای درخواست فروشندگی ابتدا وارد حساب شوید.", 401);
  if (session.user.status !== "ACTIVE" || session.user.role !== "CUSTOMER") {
    return responseError("این حساب امکان ثبت درخواست فروشندگی ندارد.", 403);
  }
  if (!isVendorApprovalEnabled()) {
    return responseError("پذیرش و بررسی درخواست‌های فروشندگی تا آماده‌شدن قرارداد و فرایند احراز هویت در تولید غیرفعال است.", 503);
  }

  if (process.env.NODE_ENV === "production" && !process.env.AUTH_URL) {
    return responseError("نشانی رسمی سایت پیکربندی نشده است.", 503);
  }
  const origin = request.headers.get("origin");
  try {
    const expected = new URL(process.env.AUTH_URL ?? request.url).origin;
    if (!origin || new URL(origin).origin !== expected) return responseError("مبدأ درخواست معتبر نیست.", 403);
  } catch {
    return responseError("مبدأ درخواست معتبر نیست.", 403);
  }

  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    return responseError("فرمت درخواست معتبر نیست.", 415);
  }

  let body: unknown;
  try {
    const text = await readRequestBody(request, 4096);
    if (text === null) return responseError("درخواست بیش از حد بزرگ است.", 413);
    body = JSON.parse(text);
  } catch {
    return responseError("بدنهٔ درخواست معتبر نیست.", 400);
  }

  if (typeof body !== "object" || body === null || Array.isArray(body)) return responseError("اطلاعات فروشگاه معتبر نیست.", 400);
  const data = body as Record<string, unknown>;
  if (typeof data.storeName !== "string" || typeof data.description !== "string") {
    return responseError("نام فروشگاه و معرفی آن لازم است.", 400);
  }
  const storeName = data.storeName.normalize("NFKC").trim();
  const description = data.description.normalize("NFKC").trim();
  const slug = typeof data.slug === "string" && data.slug.trim()
    ? data.slug.trim().toLowerCase()
    : `shop-${randomUUID().slice(0, 8)}`;

  if (storeName.length < 2 || storeName.length > 80 || /[\u0000-\u001F]/.test(storeName)) {
    return responseError("نام فروشگاه باید بین ۲ تا ۸۰ نویسه باشد.", 400);
  }
  if (description.length < 20 || description.length > 1000 || /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(description)) {
    return responseError("معرفی فروشگاه باید بین ۲۰ تا ۱۰۰۰ نویسه باشد.", 400);
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length < 3 || slug.length > 50) {
    return responseError("نشانی فروشگاه فقط می‌تواند شامل حروف انگلیسی کوچک، عدد و خط تیره باشد.", 400);
  }

  try {
    const user = await getPrisma().user.findFirst({
      where: { id: session.user.id, role: "CUSTOMER", status: "ACTIVE", emailVerified: { not: null } },
      select: { id: true },
    });
    if (!user) return responseError("حساب فعال و تأییدشده لازم است.", 403);

    const rateLimit = await checkAccountRateLimit("vendor-application", user.id, 3, 24 * 60 * 60);
    if (!rateLimit.allowed) {
      return Response.json({ error: "RATE_LIMITED" }, {
        status: 429,
        headers: { ...noStore, "Retry-After": String(rateLimit.retryAfterSeconds) },
      });
    }

    const existing = await getPrisma().vendorProfile.findUnique({
      where: { userId: user.id },
      select: { id: true, status: true },
    });
    if (existing) return responseError(`برای این حساب پیش‌تر درخواست ثبت شده است (${existing.status}).`, 409);

    const vendor = await getPrisma().vendorProfile.create({
      data: { userId: user.id, storeName, slug, description, status: "PENDING" },
      select: { id: true, status: true, storeName: true },
    });
    return Response.json(vendor, { status: 201, headers: noStore });
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") {
      const existing = await getPrisma().vendorProfile.findUnique({
        where: { userId: session.user.id },
        select: { status: true },
      });
      if (existing) return responseError(`برای این حساب پیش‌تر درخواست ثبت شده است (${existing.status}).`, 409);
      return responseError("این نشانی فروشگاه قبلاً استفاده شده است؛ نشانی دیگری انتخاب کنید.", 409);
    }
    console.error("Vendor application creation failed.", error);
    return responseError("در حال حاضر ثبت درخواست فروشندگی ممکن نیست.", 503);
  }
}
