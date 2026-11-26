import { auth } from "@/auth";
import { getPrisma } from "@/lib/prisma";
import { readRequestBody } from "@/lib/request-body";
import { hasSameOrigin } from "@/lib/request-security";
import { isSupportCaseStatus } from "@/lib/support-cases";
import { recordAdminAuditEvent, type AdminAuditAction } from "@/lib/admin-audit";

export const runtime = "nodejs";
const noStore = { "Cache-Control": "no-store" };

function errorResponse(message: string, status: number) {
  return Response.json({ error: message }, { status, headers: noStore });
}

const auditActions: Record<string, AdminAuditAction> = {
  UNDER_REVIEW: "SUPPORT_CASE_UNDER_REVIEW",
  WAITING_FOR_VENDOR: "SUPPORT_CASE_WAITING_FOR_VENDOR",
  WAITING_FOR_CUSTOMER: "SUPPORT_CASE_WAITING_FOR_CUSTOMER",
  RESOLVED: "SUPPORT_CASE_RESOLVED",
};

export async function PATCH(request: Request, { params }: { params: Promise<{ caseId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return errorResponse("ورود لازم است.", 401);
  if (session.user.status !== "ACTIVE" || session.user.role !== "ADMIN" || session.user.mfaVerified !== true) return errorResponse("دسترسی مدیر لازم است.", 403);
  if (!hasSameOrigin(request)) return errorResponse("مبدأ درخواست معتبر نیست.", 403);
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) return errorResponse("قالب درخواست معتبر نیست.", 415);

  let parsed: unknown;
  try {
    const body = await readRequestBody(request, 1024);
    if (body === null) return errorResponse("درخواست بیش از حد بزرگ است.", 413);
    parsed = JSON.parse(body);
  } catch {
    return errorResponse("اطلاعات وضعیت معتبر نیست.", 400);
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return errorResponse("اطلاعات وضعیت معتبر نیست.", 400);
  const data = parsed as Record<string, unknown>;
  const requestedStatus = data.status;
  if (Object.keys(data).some((key) => key !== "status") || !isSupportCaseStatus(requestedStatus)) return errorResponse("وضعیت درخواست معتبر نیست.", 400);

  const { caseId } = await params;
  if (!/^[a-zA-Z0-9_-]{1,40}$/.test(caseId)) return errorResponse("شناسهٔ درخواست معتبر نیست.", 400);

  try {
    const result = await getPrisma().$transaction(async (tx) => {
      const supportCase = await tx.supportCase.findUnique({ where: { id: caseId }, select: { id: true, status: true } });
      if (!supportCase) return null;
      if (supportCase.status === requestedStatus) return { status: supportCase.status };

      const updated = await tx.supportCase.updateMany({
        where: { id: supportCase.id, status: supportCase.status },
        data: { status: requestedStatus },
      });
      if (updated.count !== 1) return null;
      await recordAdminAuditEvent(tx, session.user.id, auditActions[requestedStatus], "SUPPORT_CASE", supportCase.id);
      return { status: requestedStatus };
    }, { isolationLevel: "Serializable", timeout: 10_000 });
    if (!result) return errorResponse("وضعیت درخواست هم‌زمان تغییر کرد یا درخواست پیدا نشد؛ صفحه را تازه کنید.", 409);
    return Response.json(result, { headers: noStore });
  } catch (error) {
    console.error("Support case status update failed.", error);
    return errorResponse("به‌روزرسانی وضعیت انجام نشد.", 503);
  }
}
