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

export async function POST(request: Request) {
  const access = await authorize(request);
  if ("response" in access) return access.response;
  const rateLimitResponse = await limitAddressBookWrites(access.userId);
  if (rateLimitResponse) return rateLimitResponse;
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
    const saved = await getPrisma().$transaction(async (tx) => {
      const count = await tx.address.count({ where: { userId: access.userId } });
      if (count >= 20) return null;
      return tx.address.create({
        data: { userId: access.userId, ...address },
        select: { id: true, title: true, recipient: true, phone: true, province: true, city: true, addressLine: true, buildingNumber: true, unit: true, postalCode: true },
      });
    }, { isolationLevel: "Serializable" });
    if (!saved) return Response.json({ error: "هر حساب حداکثر می‌تواند ۲۰ نشانی ذخیره کند." }, { status: 409, headers: noStore });
    return Response.json(saved, { status: 201, headers: noStore });
  } catch (error) {
    console.error("Address creation failed.", error);
    return Response.json({ error: "ذخیرهٔ نشانی انجام نشد." }, { status: 503, headers: noStore });
  }
}
