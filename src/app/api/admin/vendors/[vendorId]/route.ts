import { auth } from "@/auth";
import { getPrisma } from "@/lib/prisma";
import { readRequestBody } from "@/lib/request-body";
import { recordAdminAuditEvent } from "@/lib/admin-audit";
import { isVendorApprovalEnabled } from "@/lib/marketplace-config";
import { getCurrentVendorAgreement } from "@/lib/vendor-agreement";

export const runtime = "nodejs";
const noStore = { "Cache-Control": "no-store" };

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ vendorId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "ورود لازم است." }, { status: 401, headers: noStore });
  if (session.user.status !== "ACTIVE" || session.user.role !== "ADMIN" || session.user.mfaVerified !== true) {
    return Response.json({ error: "دسترسی مدیر لازم است." }, { status: 403, headers: noStore });
  }

  if (process.env.NODE_ENV === "production" && !process.env.AUTH_URL) {
    return Response.json({ error: "نشانی رسمی سایت پیکربندی نشده است." }, { status: 503, headers: noStore });
  }
  const origin = request.headers.get("origin");
  try {
    const expected = new URL(process.env.AUTH_URL ?? request.url).origin;
    if (!origin || new URL(origin).origin !== expected) {
      return Response.json({ error: "مبدأ درخواست معتبر نیست." }, { status: 403, headers: noStore });
    }
  } catch {
    return Response.json({ error: "مبدأ درخواست معتبر نیست." }, { status: 403, headers: noStore });
  }

  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    return Response.json({ error: "فرمت درخواست معتبر نیست." }, { status: 415, headers: noStore });
  }

  let action: unknown;
  try {
    const body = await readRequestBody(request, 1024);
    if (body === null) return Response.json({ error: "درخواست بیش از حد بزرگ است." }, { status: 413, headers: noStore });
    const parsed: unknown = JSON.parse(body);
    if (typeof parsed !== "object" || parsed === null || !("action" in parsed)) throw new Error("invalid");
    action = parsed.action;
  } catch {
    return Response.json({ error: "بدنهٔ درخواست معتبر نیست." }, { status: 400, headers: noStore });
  }
  if (action !== "approve" && action !== "reject") {
    return Response.json({ error: "عملیات مدیر معتبر نیست." }, { status: 400, headers: noStore });
  }
  let agreement: Awaited<ReturnType<typeof getCurrentVendorAgreement>> = null;
  if (action === "approve" && !isVendorApprovalEnabled()) {
    return Response.json({ error: "تأیید فروشندگان در تولید تا آماده‌شدن قرارداد و بررسی‌های لازم غیرفعال است." }, { status: 503, headers: noStore });
  }
  if (action === "approve") {
    agreement = await getCurrentVendorAgreement();
    if (!agreement) {
      return Response.json({ error: "نسخهٔ نهایی قرارداد فروشنده در دسترس نیست؛ تأیید فروشگاه بسته است." }, { status: 503, headers: noStore });
    }
  }

  const { vendorId } = await params;
  if (!/^[a-zA-Z0-9_-]{1,40}$/.test(vendorId)) {
    return Response.json({ error: "شناسهٔ فروشگاه معتبر نیست." }, { status: 400, headers: noStore });
  }

  try {
    const result = await getPrisma().$transaction(async (tx) => {
      const vendor = await tx.vendorProfile.findUnique({
        where: { id: vendorId },
        select: { id: true, userId: true, status: true },
      });
      if (!vendor || vendor.status !== "PENDING") return null;

      if (action === "approve") {
        const acceptance = await tx.vendorAgreementAcceptance.findFirst({
          where: {
            userId: vendor.userId,
            vendorProfileId: vendor.id,
            contractVersion: agreement!.version,
            documentSha256: agreement!.documentSha256,
          },
          select: { id: true },
        });
        if (!acceptance) return { error: "agreement-not-accepted" as const };

        const applicant = await tx.user.findFirst({
          where: { id: vendor.userId, role: "CUSTOMER", status: "ACTIVE", emailVerified: { not: null } },
          select: { id: true },
        });
        if (!applicant) return null;
      }

      const updated = await tx.vendorProfile.updateMany({
        where: { id: vendor.id, status: "PENDING" },
        data: { status: action === "approve" ? "ACTIVE" : "REJECTED" },
      });
      if (updated.count !== 1) return null;
      if (action === "approve") {
        await tx.user.update({ where: { id: vendor.userId }, data: { role: "VENDOR" } });
      }
      await recordAdminAuditEvent(
        tx,
        session.user.id,
        action === "approve" ? "VENDOR_APPROVED" : "VENDOR_REJECTED",
        "VENDOR",
        vendor.id,
      );
      return { status: action === "approve" ? "ACTIVE" : "REJECTED" };
    });

    if (!result) return Response.json({ error: "درخواست در انتظار بررسی پیدا نشد." }, { status: 409, headers: noStore });
    if ("error" in result) {
      return Response.json({ error: "پذیرش نسخهٔ جاری قرارداد در پروندهٔ این فروشگاه ثبت نشده است." }, { status: 409, headers: noStore });
    }
    return Response.json(result, { headers: noStore });
  } catch (error) {
    console.error("Vendor application review failed.", error);
    return Response.json({ error: "بررسی درخواست انجام نشد." }, { status: 503, headers: noStore });
  }
}
