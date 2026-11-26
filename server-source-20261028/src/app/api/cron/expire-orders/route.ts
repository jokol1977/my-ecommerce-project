import { timingSafeEqual } from "node:crypto";
import { getPrisma } from "@/lib/prisma";
import { hasUsableCronSecret } from "@/lib/cron-config";
import { releaseExpiredOrderReservations } from "@/lib/order-reservations";
import { processQueuedSmsNotifications } from "@/lib/sms-outbox";

export const runtime = "nodejs";
const noStore = { "Cache-Control": "no-store" };
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!hasUsableCronSecret(secret)) {
    console.error("CRON_SECRET is missing, too short, or still set to its example value.");
    return Response.json({ error: "پیکربندی امنیتی سرویس کامل نیست." }, { status: 503, headers: noStore });
  }

  const authorization = request.headers.get("authorization") ?? "";
  const supplied = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  const suppliedBytes = Buffer.from(supplied);
  const secretBytes = Buffer.from(secret, "utf8");
  if (suppliedBytes.length !== secretBytes.length || !timingSafeEqual(suppliedBytes, secretBytes)) {
    return Response.json({ error: "دسترسی معتبر نیست." }, { status: 401, headers: noStore });
  }
  try {
    const result = await getPrisma().$transaction(async (tx) => ({
      releasedCount: await releaseExpiredOrderReservations(tx),
    }), { timeout: 15_000 });
    const smsNotifications = await processQueuedSmsNotifications();
    return Response.json({ ...result, smsNotifications }, { headers: noStore });
  } catch (error) {
    console.error("Expired order cleanup failed.", error);
    return Response.json({ error: "پاک‌سازی سفارش‌های منقضی انجام نشد." }, { status: 503, headers: noStore });
  }
}
