import { randomUUID } from "node:crypto";
import { auth } from "@/auth";
import { getPrisma } from "@/lib/prisma";
import { readRequestBody } from "@/lib/request-body";
import { recordAdminAuditEvent } from "@/lib/admin-audit";

export const runtime = "nodejs";
const noStore = { "Cache-Control": "no-store" };

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "ورود لازم است." }, { status: 401, headers: noStore });
  if (session.user.status !== "ACTIVE" || session.user.role !== "ADMIN" || session.user.mfaVerified !== true) return Response.json({ error: "دسترسی مدیر لازم است." }, { status: 403, headers: noStore });
  if (process.env.NODE_ENV === "production" && !process.env.AUTH_URL) return Response.json({ error: "نشانی رسمی سایت پیکربندی نشده است." }, { status: 503, headers: noStore });
  try {
    const origin = request.headers.get("origin");
    if (!origin || new URL(origin).origin !== new URL(process.env.AUTH_URL ?? request.url).origin) return Response.json({ error: "مبدأ درخواست معتبر نیست." }, { status: 403, headers: noStore });
  } catch { return Response.json({ error: "مبدأ درخواست معتبر نیست." }, { status: 403, headers: noStore }); }
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) return Response.json({ error: "قالب درخواست معتبر نیست." }, { status: 415, headers: noStore });

  let parsed: unknown;
  try {
    const body = await readRequestBody(request, 4096);
    if (body === null) return Response.json({ error: "درخواست بیش از حد بزرگ است." }, { status: 413, headers: noStore });
    parsed = JSON.parse(body);
  } catch { return Response.json({ error: "اطلاعات دسته‌بندی معتبر نیست." }, { status: 400, headers: noStore }); }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return Response.json({ error: "اطلاعات دسته‌بندی معتبر نیست." }, { status: 400, headers: noStore });
  const data = parsed as Record<string, unknown>;
  const name = typeof data.name === "string" ? data.name.normalize("NFKC").trim() : "";
  const slug = typeof data.slug === "string" ? data.slug.trim().toLowerCase() : "";
  const rawParentId = data.parentId;
  const parentId = rawParentId === undefined || rawParentId === null || rawParentId === "" ? null : rawParentId;
  if (name.length < 2 || name.length > 60 || /[\u0000-\u001f]/.test(name) || !/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(slug) || slug.length < 2 || slug.length > 60) {
    return Response.json({ error: "نام یا شناسهٔ لاتین دسته‌بندی معتبر نیست." }, { status: 400, headers: noStore });
  }
  if (parentId !== null && (typeof parentId !== "string" || !/^[a-zA-Z0-9_-]{1,50}$/.test(parentId))) {
    return Response.json({ error: "دسته‌بندی والد معتبر نیست." }, { status: 400, headers: noStore });
  }

  try {
    const category = await getPrisma().$transaction(async (tx) => {
      if (parentId) {
        const parent = await tx.category.findFirst({ where: { id: parentId, isActive: true }, select: { id: true } });
        if (!parent) return null;
      }
      const category = await tx.category.create({
        data: { id: `cat-${randomUUID().replaceAll("-", "")}`, name, slug, parentId },
        select: { id: true, name: true, slug: true, parentId: true, isActive: true },
      });
      await recordAdminAuditEvent(tx, session.user.id, "CATEGORY_CREATED", "CATEGORY", category.id);
      return category;
    }, { isolationLevel: "Serializable" });
    if (!category) return Response.json({ error: "دسته‌بندی والد فعال پیدا نشد." }, { status: 400, headers: noStore });
    return Response.json(category, { status: 201, headers: noStore });
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") return Response.json({ error: "این شناسهٔ دسته‌بندی قبلاً استفاده شده است." }, { status: 409, headers: noStore });
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2034") return Response.json({ error: "دسته‌بندی‌ها هم‌زمان تغییر کردند؛ صفحه را تازه کنید." }, { status: 409, headers: noStore });
    console.error("Category creation failed.", error);
    return Response.json({ error: "ثبت دسته‌بندی انجام نشد." }, { status: 503, headers: noStore });
  }
}
