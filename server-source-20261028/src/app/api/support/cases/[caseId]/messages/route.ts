import { auth } from "@/auth";
import { getPrisma } from "@/lib/prisma";
import { readRequestBody } from "@/lib/request-body";
import { checkAccountRateLimit } from "@/lib/rate-limit";
import { hasSameOrigin } from "@/lib/request-security";
import { normalizeSupportCaseMessage, type SupportCaseStatusValue } from "@/lib/support-cases";

export const runtime = "nodejs";
const noStore = { "Cache-Control": "no-store" };
type SupportMessageResult = { error: string; statusCode: number } | { status: SupportCaseStatusValue };

function errorResponse(message: string, status: number, headers: Record<string, string> = {}) {
  return Response.json({ error: message }, { status, headers: { ...noStore, ...headers } });
}

export async function POST(request: Request, { params }: { params: Promise<{ caseId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return errorResponse("ابتدا وارد حساب شوید.", 401);
  if (session.user.status !== "ACTIVE" || !["CUSTOMER", "VENDOR", "ADMIN"].includes(session.user.role)) return errorResponse("دسترسی فعال لازم است.", 403);
  if (!hasSameOrigin(request)) return errorResponse("مبدأ درخواست معتبر نیست.", 403);

  let rateLimit: Awaited<ReturnType<typeof checkAccountRateLimit>>;
  try {
    rateLimit = await checkAccountRateLimit("support-case-message", session.user.id, 20, 60 * 60);
  } catch (error) {
    console.error("Support message rate limit check failed.", error);
    return errorResponse("ارسال پیام فعلاً در دسترس نیست.", 503);
  }
  if (!rateLimit.allowed) return errorResponse("تعداد پیام‌های شما در این ساعت به سقف مجاز رسیده است.", 429, { "Retry-After": String(rateLimit.retryAfterSeconds) });
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) return errorResponse("قالب درخواست معتبر نیست.", 415);

  let parsed: unknown;
  try {
    const body = await readRequestBody(request, 8192);
    if (body === null) return errorResponse("درخواست بیش از حد بزرگ است.", 413);
    parsed = JSON.parse(body);
  } catch {
    return errorResponse("اطلاعات پیام معتبر نیست.", 400);
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return errorResponse("اطلاعات پیام معتبر نیست.", 400);
  const data = parsed as Record<string, unknown>;
  if (Object.keys(data).some((key) => key !== "message")) return errorResponse("فیلد پیام معتبر نیست.", 400);
  const message = normalizeSupportCaseMessage(data.message);
  if (!message) return errorResponse("متن پیام باید ۱۰ تا ۲۰۰۰ نویسه باشد.", 400);

  const { caseId } = await params;
  if (!/^[a-zA-Z0-9_-]{1,40}$/.test(caseId)) return errorResponse("شناسهٔ درخواست معتبر نیست.", 400);

  try {
    const result = await getPrisma().$transaction(async (tx): Promise<SupportMessageResult> => {
      let vendorId: string | undefined;
      if (session.user.role === "VENDOR") {
        const vendor = await tx.vendorProfile.findFirst({
          where: { userId: session.user.id, status: "ACTIVE", user: { role: "VENDOR", status: "ACTIVE" } },
          select: { id: true },
        });
        if (!vendor) return { error: "فروشگاه فعال پیدا نشد.", statusCode: 403 } as const;
        vendorId = vendor.id;
      }

      const supportCase = await tx.supportCase.findFirst({
        where: {
          id: caseId,
          ...(session.user.role === "CUSTOMER" ? { customerId: session.user.id } : {}),
          ...(vendorId ? { vendorOrder: { vendorId } } : {}),
        },
        select: { id: true, status: true },
      });
      if (!supportCase) return { error: "درخواست پشتیبانی پیدا نشد.", statusCode: 404 } as const;
      if (session.user.role === "VENDOR" && supportCase.status === "RESOLVED") {
        return { error: "این درخواست حل‌شده است؛ مشتری باید برای بازگشایی آن پیام تازه بفرستد.", statusCode: 409 } as const;
      }

      const nextStatus: SupportCaseStatusValue = session.user.role === "CUSTOMER"
        ? "WAITING_FOR_VENDOR"
        : session.user.role === "VENDOR"
          ? "WAITING_FOR_CUSTOMER"
          : supportCase.status;
      await tx.supportCaseMessage.create({
        data: {
          supportCaseId: supportCase.id,
          authorUserId: session.user.id,
          authorRole: session.user.role,
          body: message,
        },
      });
      await tx.supportCase.update({ where: { id: supportCase.id }, data: { status: nextStatus } });
      return { status: nextStatus };
    }, { isolationLevel: "Serializable", timeout: 10_000 });

    if ("error" in result) return errorResponse(result.error, result.statusCode);
    return Response.json(result, { headers: noStore });
  } catch (error) {
    console.error("Support case message submission failed.", error);
    return errorResponse("ارسال پیام انجام نشد.", 503);
  }
}
