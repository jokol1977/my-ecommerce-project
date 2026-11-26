import { auth } from "@/auth";
import { getPrisma } from "@/lib/prisma";
import { readRequestBody } from "@/lib/request-body";
import { checkAccountRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
const noStore = { "Cache-Control": "no-store" };

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "ابتدا وارد حساب شوید." }, { status: 401, headers: noStore });
  if (session.user.status !== "ACTIVE" || session.user.role !== "CUSTOMER") {
    return Response.json({ error: "ثبت دیدگاه برای حساب مشتری فعال امکان‌پذیر است." }, { status: 403, headers: noStore });
  }
  if (process.env.NODE_ENV === "production" && !process.env.AUTH_URL) {
    return Response.json({ error: "نشانی رسمی سایت پیکربندی نشده است." }, { status: 503, headers: noStore });
  }
  try {
    const origin = request.headers.get("origin");
    if (!origin || new URL(origin).origin !== new URL(process.env.AUTH_URL ?? request.url).origin) {
      return Response.json({ error: "مبدأ درخواست معتبر نیست." }, { status: 403, headers: noStore });
    }
  } catch {
    return Response.json({ error: "مبدأ درخواست معتبر نیست." }, { status: 403, headers: noStore });
  }
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    return Response.json({ error: "قالب درخواست معتبر نیست." }, { status: 415, headers: noStore });
  }

  let parsed: unknown;
  try {
    const body = await readRequestBody(request, 4096);
    if (body === null) return Response.json({ error: "درخواست بیش از حد بزرگ است." }, { status: 413, headers: noStore });
    parsed = JSON.parse(body);
  } catch {
    return Response.json({ error: "اطلاعات دیدگاه معتبر نیست." }, { status: 400, headers: noStore });
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return Response.json({ error: "اطلاعات دیدگاه معتبر نیست." }, { status: 400, headers: noStore });
  }
  const data = parsed as Record<string, unknown>;
  const productId = typeof data.productId === "string" ? data.productId : "";
  const body = typeof data.body === "string" ? data.body.normalize("NFKC").trim() : "";
  if (!/^[a-zA-Z0-9_-]{1,40}$/.test(productId) || !Number.isInteger(data.rating) || Number(data.rating) < 1 || Number(data.rating) > 5 || body.length < 10 || body.length > 2000 || /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(body)) {
    return Response.json({ error: "امتیاز باید ۱ تا ۵ و متن دیدگاه ۱۰ تا ۲۰۰۰ نویسه باشد." }, { status: 400, headers: noStore });
  }

  try {
    const prisma = getPrisma();
    const customer = await prisma.user.findFirst({
      where: { id: session.user.id, role: "CUSTOMER", status: "ACTIVE", emailVerified: { not: null } },
      select: { id: true },
    });
    if (!customer) return Response.json({ error: "حساب فعال و تأییدشده لازم است." }, { status: 403, headers: noStore });

    const rateLimit = await checkAccountRateLimit("product-review", customer.id, 5, 60 * 60);
    if (!rateLimit.allowed) {
      return Response.json({ error: "RATE_LIMITED" }, {
        status: 429,
        headers: { ...noStore, "Retry-After": String(rateLimit.retryAfterSeconds) },
      });
    }

    const deliveredPurchase = await prisma.orderItem.findFirst({
      where: {
        productId,
        vendorOrder: { status: "DELIVERED", order: { customerId: customer.id } },
      },
      select: { id: true },
    });
    if (!deliveredPurchase) return Response.json({ error: "ثبت دیدگاه فقط برای کالای سفارش تحویل‌شده ممکن است." }, { status: 403, headers: noStore });

    const review = await prisma.productReview.create({
      data: { productId, customerId: customer.id, rating: Number(data.rating), body },
      select: { id: true, status: true },
    });
    return Response.json(review, { status: 201, headers: noStore });
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") {
      return Response.json({ error: "برای این کالا قبلاً دیدگاه ثبت کرده‌اید." }, { status: 409, headers: noStore });
    }
    console.error("Product review submission failed.", error);
    return Response.json({ error: "ثبت دیدگاه انجام نشد." }, { status: 503, headers: noStore });
  }
}
