import { auth } from "@/auth";
import { getPrisma } from "@/lib/prisma";
import { readRequestBody } from "@/lib/request-body";
import { recordAdminAuditEvent } from "@/lib/admin-audit";

export const runtime = "nodejs";
const noStore = { "Cache-Control": "no-store" };

export async function PATCH(request: Request, { params }: { params: Promise<{ categoryId: string }> }) {
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
    const parsed: unknown = JSON.parse(body);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed) || !("action" in parsed)) throw new Error("invalid");
    action = parsed.action;
  } catch { return Response.json({ error: "اطلاعات درخواست معتبر نیست." }, { status: 400, headers: noStore }); }
  if (action !== "activate" && action !== "deactivate") return Response.json({ error: "عملیات معتبر نیست." }, { status: 400, headers: noStore });
  const { categoryId } = await params;
  if (!/^[a-zA-Z0-9_-]{1,50}$/.test(categoryId)) return Response.json({ error: "شناسهٔ دسته‌بندی معتبر نیست." }, { status: 400, headers: noStore });

  try {
    const isActive = action === "activate";
    const result = await getPrisma().$transaction(async (tx) => {
      const categories = await tx.category.findMany({ select: { id: true, parentId: true, isActive: true } });
      const byId = new Map(categories.map((category) => [category.id, category]));
      const category = byId.get(categoryId);
      if (!category || category.isActive !== !isActive) return { error: "دسته‌بندی پیدا نشد یا وضعیت آن قبلاً تغییر کرده است." } as const;

      if (isActive) {
        let parentId = category.parentId;
        while (parentId) {
          const parent = byId.get(parentId);
          if (!parent || !parent.isActive) return { error: "برای فعال‌کردن این دسته، ابتدا همهٔ دسته‌های والد را فعال کنید." } as const;
          parentId = parent.parentId;
        }
      } else {
        const childrenByParent = new Map<string, typeof categories>();
        for (const child of categories) {
          if (!child.parentId) continue;
          const siblings = childrenByParent.get(child.parentId) ?? [];
          siblings.push(child);
          childrenByParent.set(child.parentId, siblings);
        }
        const pendingParents = [category.id];
        for (let index = 0; index < pendingParents.length; index += 1) {
          const children = childrenByParent.get(pendingParents[index]) ?? [];
          for (const child of children) {
            if (child.isActive) return { error: "ابتدا همهٔ زیرشاخه‌های فعال را غیرفعال کنید." } as const;
            pendingParents.push(child.id);
          }
        }
      }

      const updated = await tx.category.updateMany({ where: { id: categoryId, isActive: !isActive }, data: { isActive } });
      if (updated.count !== 1) return { error: "وضعیت دسته‌بندی هم‌زمان تغییر کرد؛ صفحه را تازه کنید." } as const;
      await recordAdminAuditEvent(
        tx,
        session.user.id,
        isActive ? "CATEGORY_ACTIVATED" : "CATEGORY_DEACTIVATED",
        "CATEGORY",
        categoryId,
      );
      return { isActive } as const;
    }, { isolationLevel: "Serializable" });
    if ("error" in result) return Response.json({ error: result.error }, { status: 409, headers: noStore });
    return Response.json(result, { headers: noStore });
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2034") return Response.json({ error: "دسته‌بندی‌ها هم‌زمان تغییر کردند؛ صفحه را تازه کنید." }, { status: 409, headers: noStore });
    console.error("Category status update failed.", error);
    return Response.json({ error: "تغییر وضعیت دسته‌بندی انجام نشد." }, { status: 503, headers: noStore });
  }
}
