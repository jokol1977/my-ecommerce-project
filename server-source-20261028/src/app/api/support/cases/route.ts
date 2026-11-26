import { auth } from "@/auth";
import { getPrisma } from "@/lib/prisma";
import { readRequestBody } from "@/lib/request-body";
import { checkAccountRateLimit } from "@/lib/rate-limit";
import { hasSameOrigin } from "@/lib/request-security";
import {
  isSupportCaseCategory,
  normalizeSupportCaseMessage,
  SUPPORT_CASE_ORDER_STATUSES,
} from "@/lib/support-cases";

export const runtime = "nodejs";
const noStore = { "Cache-Control": "no-store" };

function errorResponse(message: string, status: number, headers: Record<string, string> = {}) {
  return Response.json({ error: message }, { status, headers: { ...noStore, ...headers } });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return errorResponse("ابتدا وارد حساب شوید.", 401);
  if (session.user.status !== "ACTIVE" || session.user.role !== "CUSTOMER") return errorResponse("ثبت درخواست فقط برای مشتری فعال ممکن است.", 403);
  if (!hasSameOrigin(request)) return errorResponse("مبدأ درخواست معتبر نیست.", 403);

  let rateLimit: Awaited<ReturnType<typeof checkAccountRateLimit>>;
  try {
    rateLimit = await checkAccountRateLimit("support-case-create", session.user.id, 5, 24 * 60 * 60);
  } catch (error) {
    console.error("Support case rate limit check failed.", error);
    return errorResponse("ثبت درخواست فعلاً در دسترس نیست.", 503);
  }
  if (!rateLimit.allowed) return errorResponse("تعداد درخواست‌های پشتیبانی امروز به سقف مجاز رسیده است.", 429, { "Retry-After": String(rateLimit.retryAfterSeconds) });
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) return errorResponse("قالب درخواست معتبر نیست.", 415);

  let parsed: unknown;
  try {
    const body = await readRequestBody(request, 8192);
    if (body === null) return errorResponse("درخواست بیش از حد بزرگ است.", 413);
    parsed = JSON.parse(body);
  } catch {
    return errorResponse("اطلاعات درخواست معتبر نیست.", 400);
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return errorResponse("اطلاعات درخواست معتبر نیست.", 400);
  const data = parsed as Record<string, unknown>;
  if (Object.keys(data).some((key) => !["vendorOrderId", "category", "message"].includes(key))) return errorResponse("فیلد درخواست معتبر نیست.", 400);
  const vendorOrderId = typeof data.vendorOrderId === "string" ? data.vendorOrderId.trim() : "";
  const category = data.category;
  const message = normalizeSupportCaseMessage(data.message);
  if (!/^[a-zA-Z0-9_-]{1,40}$/.test(vendorOrderId) || !isSupportCaseCategory(category) || !message) {
    return errorResponse("بخش سفارش، موضوع یا متن درخواست معتبر نیست. متن باید ۱۰ تا ۲۰۰۰ نویسه باشد.", 400);
  }

  try {
    const supportCase = await getPrisma().$transaction(async (tx) => {
      const vendorOrder = await tx.vendorOrder.findFirst({
        where: {
          id: vendorOrderId,
          order: { customerId: session.user.id, status: { in: [...SUPPORT_CASE_ORDER_STATUSES] } },
        },
        select: { id: true },
      });
      if (!vendorOrder) return null;
      return tx.supportCase.create({
        data: {
          customerId: session.user.id,
          vendorOrderId: vendorOrder.id,
          category,
          status: "WAITING_FOR_VENDOR",
          messages: {
            create: { authorUserId: session.user.id, authorRole: "CUSTOMER", body: message },
          },
        },
        select: { id: true, status: true },
      });
    }, { isolationLevel: "Serializable", timeout: 10_000 });
    if (!supportCase) return errorResponse("زیرسفارش پیدا نشد یا هنوز پرداخت آن تأیید نشده است.", 404);
    return Response.json(supportCase, { status: 201, headers: noStore });
  } catch (error) {
    console.error("Support case creation failed.", error);
    return errorResponse("ثبت درخواست پشتیبانی انجام نشد.", 503);
  }
}
