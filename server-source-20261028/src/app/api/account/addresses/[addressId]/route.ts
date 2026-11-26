import { auth } from "@/auth";
import { parseAddressData } from "@/lib/address-input";
import { limitAddressBookWrites } from "@/lib/address-write-rate-limit";
import { getPrisma } from "@/lib/prisma";
import { readRequestBody } from "@/lib/request-body";

export const runtime = "nodejs";
const noStore = { "Cache-Control": "no-store" };

async function authorize(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return { response: Response.json({ error: "ابتدا وارد حساب شوید." }, { status: 401, headers: noStore }) };
  if (session.user.status !== "ACTIVE") return { response: Response.json({ error: "این حساب فعال نیست." }, { status: 403, headers: noStore }) };
  if (process.env.NODE_ENV === "production" && !process.env.AUTH_URL) return { response: Response.json({ error: "نشانی رسمی سایت پیکربندی نشده است." }, { status: 503, headers: noStore }) };
  try {
    const origin = request.headers.get("origin");
    if (!origin || new URL(origin).origin !== new URL(process.env.AUTH_URL ?? request.url).origin) return { response: Response.json({ error: "مبدأ درخواست معتبر نیست." }, { status: 403, headers: noStore }) };
  } catch { return { response: Response.json({ error: "مبدأ درخواست معتبر نیست." }, { status: 403, headers: noStore }) }; }
  return { userId: session.user.id };
}

export async function PATCH(request: Request, { params }: { params: Promise<{ addressId: string }> }) {
  const access = await authorize(request);
  if ("response" in access) return access.response;
  const rateLimitResponse = await limitAddressBookWrites(access.userId);
  if (rateLimitResponse) return rateLimitResponse;
  const { addressId } = await params;
  if (!/^[a-zA-Z0-9_-]{1,40}$/.test(addressId)) return Response.json({ error: "شناسهٔ نشانی معتبر نیست." }, { status: 400, headers: noStore });
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) return Response.json({ error: "قالب درخواست معتبر نیست." }, { status: 415, headers: noStore });
  let parsed: unknown;
  try {
    const body = await readRequestBody(request, 8192);
    if (body === null) return Response.json({ error: "درخواست بیش از حد بزرگ است." }, { status: 413, headers: noStore });
    parsed = JSON.parse(body);
  } catch { return Response.json({ error: "اطلاعات نشانی معتبر نیست." }, { status: 400, headers: noStore }); }
  const address = parseAddressData(parsed);
  if (!address) return Response.json({ error: "نام نشانی، گیرنده، موبایل، استان، شهر، نشانی یا کد پستی معتبر نیست." }, { status: 400, headers: noStore });
  try {
    const updated = await getPrisma().address.updateMany({ where: { id: addressId, userId: access.userId }, data: address });
    if (updated.count !== 1) return Response.json({ error: "نشانی پیدا نشد." }, { status: 404, headers: noStore });
    return Response.json({ id: addressId, ...address }, { headers: noStore });
  } catch (error) {
    console.error("Address update failed.", error);
    return Response.json({ error: "به‌روزرسانی نشانی انجام نشد." }, { status: 503, headers: noStore });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ addressId: string }> }) {
  const access = await authorize(request);
  if ("response" in access) return access.response;
  const rateLimitResponse = await limitAddressBookWrites(access.userId);
  if (rateLimitResponse) return rateLimitResponse;
  const { addressId } = await params;
  if (!/^[a-zA-Z0-9_-]{1,40}$/.test(addressId)) return Response.json({ error: "شناسهٔ نشانی معتبر نیست." }, { status: 400, headers: noStore });
  try {
    const deleted = await getPrisma().address.deleteMany({ where: { id: addressId, userId: access.userId } });
    if (deleted.count !== 1) return Response.json({ error: "نشانی پیدا نشد." }, { status: 404, headers: noStore });
    return Response.json({ deleted: true }, { headers: noStore });
  } catch (error) {
    console.error("Address deletion failed.", error);
    return Response.json({ error: "حذف نشانی انجام نشد." }, { status: 503, headers: noStore });
  }
}
