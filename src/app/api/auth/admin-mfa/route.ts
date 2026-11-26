import { auth } from "@/auth";
import type { Session } from "next-auth";
import { createTotpProvisioningUri, generateTotpSecret, getMatchingTotpCounter } from "@/lib/auth/totp";
import { decryptAdminTotpSecret, encryptAdminTotpSecret } from "@/lib/auth/mfa-secrets";
import { generateAdminRecoveryCodes, hashAdminRecoveryCode } from "@/lib/auth/credentials";
import { authJson, isSameOriginAuthRequest, readSmallJson } from "@/lib/auth/http";
import { hasUsableAuthSecret, isEmailLoginEnabled } from "@/lib/auth-config";
import { getPrisma } from "@/lib/prisma";
import { checkAccountRateLimit, checkRequestIpRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

type EnrollmentRequest = { action?: unknown; code?: unknown };

function mayEnroll(session: Session | null): session is Session {
  return Boolean(
    session?.user?.id &&
    session.user.role === "ADMIN" &&
    session.user.status === "ACTIVE" &&
    session.user.adminMfaSetup === true &&
    typeof session.user.adminMfaSetupExpiresAt === "number" &&
    session.user.adminMfaSetupExpiresAt > Date.now(),
  );
}

export async function POST(request: Request): Promise<Response> {
  if (!isSameOriginAuthRequest(request)) return authJson({ ok: false }, 403);
  if (!isEmailLoginEnabled() || !hasUsableAuthSecret()) return authJson({ ok: false }, 503);

  const session = await auth();
  if (!mayEnroll(session)) return authJson({ ok: false }, 403);

  const payload = await readSmallJson(request) as EnrollmentRequest | null;
  if (!payload || (payload.action !== "start" && payload.action !== "confirm")) {
    return authJson({ ok: false, message: "درخواست معتبر نیست." }, 400);
  }

  try {
    const [ipLimit, accountLimit] = await Promise.all([
      checkRequestIpRateLimit(request, "admin-mfa-enrollment", 5, 15 * 60),
      checkAccountRateLimit("admin-mfa-enrollment", session!.user.id, 5, 15 * 60),
    ]);
    if (!ipLimit.allowed || !accountLimit.allowed) {
      return authJson({ ok: false, message: "تعداد تلاش‌ها زیاد است. کمی بعد دوباره امتحان کنید." }, 429, {
        "Retry-After": String(Math.max(ipLimit.retryAfterSeconds, accountLimit.retryAfterSeconds)),
      });
    }

    const prisma = getPrisma();
    if (payload.action === "start") {
      const secret = generateTotpSecret();
      const encryptedSecret = encryptAdminTotpSecret(session!.user.id, secret);
      const expiresAt = new Date(Date.now() + 10 * 60 * 1_000);
      const factor = await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${session!.user.id} FOR UPDATE`;
        await tx.$queryRaw<Array<{ userId: string }>>`
          SELECT "userId" FROM "AdminTotpFactor" WHERE "userId" = ${session!.user.id} FOR UPDATE
        `;
        const existing = await tx.adminTotpFactor.findUnique({ where: { userId: session!.user.id } });
        if (existing?.enabledAt) return null;
        return tx.adminTotpFactor.upsert({
          where: { userId: session!.user.id },
          create: { userId: session!.user.id, encryptedSecret, enrollmentExpiresAt: expiresAt },
          update: { encryptedSecret, enabledAt: null, enrollmentExpiresAt: expiresAt, lastUsedCounter: null },
        });
      }, { maxWait: 5_000, timeout: 10_000 });

      if (!factor) return authJson({ ok: false, message: "عامل دوم قبلاً فعال شده است." }, 409);
      const provisioningUri = createTotpProvisioningUri(secret, session!.user.email ?? session!.user.id);
      return authJson({ ok: true, secret, provisioningUri, expiresAt: expiresAt.toISOString() });
    }

    const code = typeof payload.code === "string" ? payload.code.trim() : "";
    if (!/^\d{6}$/.test(code)) return authJson({ ok: false, message: "کد تأیید معتبر نیست." }, 400);

    const recoveryCodes = generateAdminRecoveryCodes();
    const recoveryRows = recoveryCodes.map((recoveryCode) => ({
      userId: session!.user.id,
      codeHash: hashAdminRecoveryCode(session!.user.id, recoveryCode),
    }));
    const now = new Date();
    const confirmed = await prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ encryptedSecret: string; enabledAt: Date | null; enrollmentExpiresAt: Date | null }>>`
        SELECT "encryptedSecret", "enabledAt", "enrollmentExpiresAt"
        FROM "AdminTotpFactor"
        WHERE "userId" = ${session!.user.id}
        FOR UPDATE
      `;
      const pending = rows[0];
      if (!pending || pending.enabledAt || !pending.enrollmentExpiresAt || pending.enrollmentExpiresAt <= now) {
        return false;
      }

      const secret = decryptAdminTotpSecret(session!.user.id, pending.encryptedSecret);
      const counter = getMatchingTotpCounter(secret, code, now.getTime());
      if (counter === null) return false;

      const enabled = await tx.adminTotpFactor.updateMany({
        where: { userId: session!.user.id, enabledAt: null, enrollmentExpiresAt: { gt: now } },
        data: { enabledAt: now, enrollmentExpiresAt: null, lastUsedCounter: BigInt(counter) },
      });
      if (enabled.count !== 1) return false;

      await tx.adminRecoveryCode.deleteMany({ where: { userId: session!.user.id } });
      await tx.adminRecoveryCode.createMany({ data: recoveryRows });
      return true;
    }, { maxWait: 5_000, timeout: 10_000 });

    if (!confirmed) return authJson({ ok: false, message: "کد نادرست است یا مهلت راه‌اندازی تمام شده است." }, 400);
    return authJson({ ok: true, recoveryCodes });
  } catch {
    return authJson({ ok: false, message: "راه‌اندازی عامل دوم فعلاً ممکن نیست." }, 503);
  }
}
