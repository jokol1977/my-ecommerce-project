import { auth } from "@/auth";
import { getPrisma } from "@/lib/prisma";
import { readRequestBody } from "@/lib/request-body";
import { recordAdminAuditEvent } from "@/lib/admin-audit";

export const runtime = "nodejs";
const noStore = { "Cache-Control": "no-store" };

export async function PATCH(request: Request, { params }: { params: Promise<{ reviewId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "ورود لازم است." }, { status: 401, headers: noStore });
  if (session.user.status !== "ACTIVE" || session.user.role !== "ADMIN" || session.user.mfaVerified !== true) return Response.json({ error: "دسترسی مدیر لازم است." }, { status: 403, headers: noStore });
  if (process.env.NODE_ENV === "production" && !process.env.AUTH_URL) return Response.json({ error: "نشانی رسمی سایت پیکربندی نشده است." }, { status: 503, headers: noStore });
  try {
    const origin = request.headers.get("origin");
    if (!origin || new URL(origin).origin !== new URL(process.env.AUTH_URL ?? request.url).origin) return Response.json({ error: "مبدأ درخواست معتبر نیست." }, { status: 403, headers: noStore });
  } catch { return Response.json({ error: "مبدأ درخواست معتبر نیست." }, { status: 403, headers: noStore }); }
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) return Response.json({ error: "قالب درخواست معتبر نیست." }, { status: 415, headers: noStore });

  let action: unknown;
  try {
    const body = await readRequestBody(request, 1024);
    if (body === null) return Response.json({ error: "درخواست بیش از حد بزرگ است." }, { status: 413, headers: noStore });
    const data: unknown = JSON.parse(body);
    if (typeof data !== "object" || data === null || Array.isArray(data) || !("action" in data)) throw new Error("invalid");
    action = data.action;
  } catch { return Response.json({ error: "اطلاعات درخواست معتبر نیست." }, { status: 400, headers: noStore }); }
  if (action !== "approve" && action !== "reject") return Response.json({ error: "عملیات معتبر نیست." }, { status: 400, headers: noStore });

  const { reviewId } = await params;
  if (!/^[a-zA-Z0-9_-]{1,40}$/.test(reviewId)) return Response.json({ error: "شناسهٔ دیدگاه معتبر نیست." }, { status: 400, headers: noStore });
  try {
    const result = await getPrisma().$transaction(async (tx) => {
      const updated = await tx.productReview.updateMany({
        where: { id: reviewId, status: "PENDING" },
        data: { status: action === "approve" ? "APPROVED" : "REJECTED" },
      });
      if (updated.count !== 1) return null;
      await recordAdminAuditEvent(
        tx,
        session.user.id,
        action === "approve" ? "REVIEW_APPROVED" : "REVIEW_REJECTED",
        "PRODUCT_REVIEW",
        reviewId,
      );
      return { status: action === "approve" ? "APPROVED" : "REJECTED" };
    });
    if (!result) return Response.json({ error: "دیدگاه در صف بررسی پیدا نشد." }, { status: 409, headers: noStore });
    return Response.json(result, { headers: noStore });
  } catch (error) {
    console.error("Product review moderation failed.", error);
    return Response.json({ error: "بررسی دیدگاه انجام نشد." }, { status: 503, headers: noStore });
  }
}
