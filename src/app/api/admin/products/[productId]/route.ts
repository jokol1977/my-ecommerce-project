import { auth } from "@/auth";
import { getPrisma } from "@/lib/prisma";
import { readRequestBody } from "@/lib/request-body";
import { recordAdminAuditEvent } from "@/lib/admin-audit";

export const runtime = "nodejs";
const noStore = { "Cache-Control": "no-store" };

export async function PATCH(request: Request, { params }: { params: Promise<{ productId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "ورود لازم است." }, { status: 401, headers: noStore });
  if (session.user.status !== "ACTIVE" || session.user.role !== "ADMIN") return Response.json({ error: "دسترسی مدیر لازم است." }, { status: 403, headers: noStore });
  if (process.env.NODE_ENV === "production" && !process.env.AUTH_URL) return Response.json({ error: "نشانی رسمی سایت پیکربندی نشده است." }, { status: 503, headers: noStore });
  try {
    const origin = request.headers.get("origin");
    if (!origin || new URL(origin).origin !== new URL(process.env.AUTH_URL ?? request.url).origin) return Response.json({ error: "مبدأ درخواست معتبر نیست." }, { status: 403, headers: noStore });
  } catch { return Response.json({ error: "مبدأ درخواست معتبر نیست." }, { status: 403, headers: noStore }); }
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) return Response.json({ error: "قالب درخواست معتبر نیست." }, { status: 415, headers: noStore });
  let action: unknown;
  let reviewNote: unknown;
  try {
    const body = await readRequestBody(request, 2048);
    if (body === null) return Response.json({ error: "درخواست بیش از حد بزرگ است." }, { status: 413, headers: noStore });
    const parsed: unknown = JSON.parse(body);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed) || !("action" in parsed)) throw new Error("invalid");
    action = parsed.action;
    reviewNote = "reviewNote" in parsed ? parsed.reviewNote : undefined;
  } catch { return Response.json({ error: "اطلاعات درخواست معتبر نیست." }, { status: 400, headers: noStore }); }
  if (action !== "approve" && action !== "reject") return Response.json({ error: "عملیات معتبر نیست." }, { status: 400, headers: noStore });
  const note = typeof reviewNote === "string" ? reviewNote.normalize("NFKC").trim() : "";
  if (action === "reject" && (note.length < 5 || note.length > 500 || /[\u0000-\u001f\u007f]/.test(note))) {
    return Response.json({ error: "برای رد کالا دلیل روشن و حداکثر ۵۰۰ نویسه‌ای بنویسید." }, { status: 400, headers: noStore });
  }
  const { productId } = await params;
  if (!/^[a-zA-Z0-9_-]{1,40}$/.test(productId)) return Response.json({ error: "شناسهٔ کالا معتبر نیست." }, { status: 400, headers: noStore });
  try {
    const result = await getPrisma().$transaction(async (tx) => {
      const updated = await tx.product.updateMany({
        where: { id: productId, status: "PENDING_REVIEW" },
        data: { status: action === "approve" ? "ACTIVE" : "REJECTED", reviewNote: action === "reject" ? note : null },
      });
      if (updated.count !== 1) return null;
      await recordAdminAuditEvent(
        tx,
        session.user.id,
        action === "approve" ? "PRODUCT_APPROVED" : "PRODUCT_REJECTED",
        "PRODUCT",
        productId,
      );
      return { status: action === "approve" ? "ACTIVE" : "REJECTED" };
    });
    if (!result) return Response.json({ error: "کالای در انتظار بررسی پیدا نشد." }, { status: 409, headers: noStore });
    return Response.json(result, { headers: noStore });
  } catch (error) {
    console.error("Product review failed.", error);
    return Response.json({ error: "بررسی کالا انجام نشد." }, { status: 503, headers: noStore });
  }
}
