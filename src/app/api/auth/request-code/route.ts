import { getPrisma } from "@/lib/prisma";
import { hasUsableAuthSecret, isEmailLoginEnabled } from "@/lib/auth-config";
import { sendEmailLoginCode } from "@/lib/auth/email";
import { authJson, isSameOriginAuthRequest, readSmallJson } from "@/lib/auth/http";
import { generateEmailLoginCode, hashEmailLoginCode, normalizeLoginEmail } from "@/lib/auth/credentials";
import {
  checkEmailSignInDeliveryRateLimit,
  checkEmailSignInRateLimit,
  checkRequestIpRateLimit,
} from "@/lib/rate-limit";

export const runtime = "nodejs";

const CODE_LIFETIME_MS = 10 * 60 * 1_000;
const GENERIC_RESPONSE = {
  ok: true,
  message: "اگر نشانی ایمیل معتبر باشد، کد ورود ارسال می‌شود.",
};

export async function POST(request: Request): Promise<Response> {
  if (!isSameOriginAuthRequest(request)) {
    return authJson({ ok: false, message: "درخواست معتبر نیست." }, 403);
  }
  if (!isEmailLoginEnabled() || !hasUsableAuthSecret()) {
    return authJson({ ok: false, message: "ورود در این محیط آماده نیست." }, 503);
  }

  const payload = await readSmallJson(request);
  const email = normalizeLoginEmail(
    payload && typeof payload === "object" && "email" in payload
      ? (payload as { email?: unknown }).email
      : null,
  );
  if (!email) return authJson({ ok: false, message: "نشانی ایمیل را بررسی کنید." }, 400);

  try {
    const ipLimit = await checkRequestIpRateLimit(request, "email-login-request", 5, 15 * 60);
    if (!ipLimit.allowed) {
      return authJson(GENERIC_RESPONSE, 429, { "Retry-After": String(ipLimit.retryAfterSeconds) });
    }

    const emailLimit = await checkEmailSignInRateLimit(email);
    const deliveryLimit = await checkEmailSignInDeliveryRateLimit(email);
    if (!emailLimit.allowed || !deliveryLimit.allowed) {
      const retryAfterSeconds = Math.max(emailLimit.retryAfterSeconds, deliveryLimit.retryAfterSeconds);
      return authJson(GENERIC_RESPONSE, 429, { "Retry-After": String(retryAfterSeconds) });
    }

    const code = generateEmailLoginCode();
    const codeHash = hashEmailLoginCode(email, code);
    const prisma = getPrisma();
    await prisma.emailLoginChallenge.upsert({
      where: { email },
      create: { email, codeHash, expiresAt: new Date(Date.now() + CODE_LIFETIME_MS), attempts: 0 },
      update: { codeHash, expiresAt: new Date(Date.now() + CODE_LIFETIME_MS), attempts: 0 },
    });

    try {
      await sendEmailLoginCode(email, code);
    } catch {
      await prisma.emailLoginChallenge.deleteMany({ where: { email, codeHash } }).catch(() => undefined);
      console.error("Authentication email delivery failed.");
    }
  } catch {
    return authJson({ ok: false, message: "ارسال کد موقتاً ممکن نیست." }, 503);
  }

  return authJson(GENERIC_RESPONSE, 202);
}
