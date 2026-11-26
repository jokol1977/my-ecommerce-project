import "server-only";
import { checkAccountRateLimit } from "@/lib/rate-limit";

const noStore = { "Cache-Control": "no-store" };

/** Limit address creation, updates, and deletion across all devices for one account. */
export async function limitAddressBookWrites(userId: string): Promise<Response | null> {
  try {
    const rateLimit = await checkAccountRateLimit("address-book-write", userId, 30, 60 * 60);
    if (!rateLimit.allowed) {
      return Response.json({ error: "تعداد تغییرات دفترچهٔ نشانی در این ساعت به سقف مجاز رسیده است." }, {
        status: 429,
        headers: { ...noStore, "Retry-After": String(rateLimit.retryAfterSeconds) },
      });
    }
    return null;
  } catch (error) {
    console.error("Address book rate limit check failed.", error);
    return Response.json({ error: "تغییر دفترچهٔ نشانی فعلاً در دسترس نیست." }, { status: 503, headers: noStore });
  }
}
