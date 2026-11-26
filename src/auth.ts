import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import type { Prisma } from "@/generated/prisma/client";
import { getPrisma } from "@/lib/prisma";
import {
  constantTimeSecretEqual,
  hashAdminRecoveryCode,
  hashEmailLoginCode,
  normalizeLoginEmail,
} from "@/lib/auth/credentials";
import { decryptAdminTotpSecret } from "@/lib/auth/mfa-secrets";
import { decideAdminMfa, evaluateEmailChallenge } from "@/lib/auth/policy";
import { getMatchingTotpCounter } from "@/lib/auth/totp";
import {
  hasUsableAdminEnrollmentSecret,
  hasUsableAuthSecret,
  isEmailLoginEnabled,
} from "@/lib/auth-config";
import {
  checkEmailSignInVerificationRateLimit,
  checkRequestIpRateLimit,
} from "@/lib/rate-limit";

const MAX_CHALLENGE_ATTEMPTS = 5;
const ADMIN_SETUP_SESSION_MS = 10 * 60 * 1_000;

type LockedChallenge = { codeHash: string; expiresAt: Date; attempts: number };

async function rejectAttempt(tx: Prisma.TransactionClient, email: string) {
  await tx.emailLoginChallenge.update({
    where: { email },
    data: { attempts: { increment: 1 } },
  });
}

async function authorizeEmailCode(credentials: Record<string, unknown>, request: Request) {
  if (!isEmailLoginEnabled() || !hasUsableAuthSecret()) return null;
  const email = normalizeLoginEmail(credentials.email);
  const code = typeof credentials.code === "string" ? credentials.code : "";
  if (!email || !/^\d{6}$/.test(code)) return null;

  try {
    const [ipLimit, emailLimit] = await Promise.all([
      checkRequestIpRateLimit(request, "email-login-verify", 5, 15 * 60),
      checkEmailSignInVerificationRateLimit(email),
    ]);
    if (!ipLimit.allowed || !emailLimit.allowed) return null;

    const prisma = getPrisma();
    return await prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<LockedChallenge[]>`
        SELECT "codeHash", "expiresAt", "attempts"
        FROM "EmailLoginChallenge"
        WHERE "email" = ${email}
        FOR UPDATE
      `;
      const challenge = locked[0];
      if (!challenge) return null;
      const expectedCodeHash = hashEmailLoginCode(email, code);
      const challengeState = evaluateEmailChallenge({
        attempts: challenge.attempts,
        expiresAt: challenge.expiresAt,
        storedCodeHash: challenge.codeHash,
        suppliedCodeHash: expectedCodeHash,
        maximumAttempts: MAX_CHALLENGE_ATTEMPTS,
      });
      if (challengeState === "expired" || challengeState === "locked") {
        await tx.emailLoginChallenge.deleteMany({ where: { email } });
        return null;
      }
      if (challengeState === "mismatch") {
        await rejectAttempt(tx, email);
        return null;
      }

      let user = await tx.user.findFirst({
        where: { email: { equals: email, mode: "insensitive" } },
      });
      if (!user) {
        user = await tx.user.create({
          data: { email, emailVerified: new Date(), role: "CUSTOMER", status: "ACTIVE" },
        });
      } else if (user.status !== "ACTIVE") {
        await tx.emailLoginChallenge.deleteMany({ where: { email } });
        return null;
      } else if (!user.emailVerified) {
        user = await tx.user.update({ where: { id: user.id }, data: { emailVerified: new Date() } });
      }

      let mfaVerified = false;
      let adminMfaSetup = false;
      let adminMfaSetupExpiresAt: number | undefined;

      if (user.role === "ADMIN") {
        const factor = await tx.adminTotpFactor.findUnique({ where: { userId: user.id } });
        if (factor?.enabledAt) {
          const totp = typeof credentials.totp === "string" ? credentials.totp.trim() : "";
          if (totp) {
            const secret = decryptAdminTotpSecret(user.id, factor.encryptedSecret);
            const counter = getMatchingTotpCounter(secret, totp);
            if (counter !== null) {
              const consumed = await tx.adminTotpFactor.updateMany({
                where: {
                  userId: user.id,
                  enabledAt: { not: null },
                  OR: [
                    { lastUsedCounter: null },
                    { lastUsedCounter: { lt: BigInt(counter) } },
                  ],
                },
                data: { lastUsedCounter: BigInt(counter) },
              });
              mfaVerified = consumed.count === 1;
            }
          }

          const recoveryCode = typeof credentials.recoveryCode === "string"
            ? credentials.recoveryCode
            : "";
          if (!mfaVerified && recoveryCode) {
            try {
              const codeHash = hashAdminRecoveryCode(user.id, recoveryCode);
              const consumed = await tx.adminRecoveryCode.updateMany({
                where: { userId: user.id, codeHash, usedAt: null },
                data: { usedAt: new Date() },
              });
              mfaVerified = consumed.count === 1;
            } catch {
              mfaVerified = false;
            }
          }

          const decision = decideAdminMfa({
            isAdmin: true,
            factorEnabled: true,
            factorVerified: mfaVerified,
            bootstrapAuthorized: false,
          });
          if (!decision.allowed) {
            await rejectAttempt(tx, email);
            return null;
          }
          mfaVerified = decision.mfaVerified;
        } else {
          const suppliedBootstrapSecret = typeof credentials.bootstrapSecret === "string"
            ? credentials.bootstrapSecret
            : "";
          const expectedBootstrapSecret = process.env.AUTH_ADMIN_MFA_ENROLLMENT_SECRET ?? "";
          const decision = decideAdminMfa({
            isAdmin: true,
            factorEnabled: false,
            factorVerified: false,
            bootstrapAuthorized: hasUsableAdminEnrollmentSecret(expectedBootstrapSecret) &&
              constantTimeSecretEqual(expectedBootstrapSecret, suppliedBootstrapSecret),
          });
          if (!decision.allowed) {
            await rejectAttempt(tx, email);
            return null;
          }
          adminMfaSetup = decision.setupRequired;
          adminMfaSetupExpiresAt = Date.now() + ADMIN_SETUP_SESSION_MS;
        }
      }

      await tx.emailLoginChallenge.deleteMany({ where: { email } });
      return {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        status: user.status,
        mfaVerified,
        adminMfaSetup,
        adminMfaSetupExpiresAt,
      };
    }, { maxWait: 5_000, timeout: 10_000 });
  } catch {
    return null;
  }
}

const emailOtpProvider = Credentials({
  id: "email-otp",
  name: "Email code",
  credentials: {
    email: { label: "Email", type: "email" },
    code: { label: "One-time code", type: "text" },
    totp: { label: "Authenticator code", type: "text" },
    recoveryCode: { label: "Recovery code", type: "text" },
    bootstrapSecret: { label: "Administrator enrollment secret", type: "password" },
  },
  authorize: authorizeEmailCode,
});

const { handlers, auth, signIn, signOut } = NextAuth({
  providers: isEmailLoginEnabled() ? [emailOtpProvider] : [],
  secret: process.env.AUTH_SECRET,
  pages: { signIn: "/login" },
  session: { strategy: "jwt", maxAge: 12 * 60 * 60 },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.sub = user.id;
        token.role = user.role;
        token.status = user.status;
        token.mfaVerified = user.mfaVerified === true;
        token.adminMfaSetup = user.adminMfaSetup === true;
        token.adminMfaSetupExpiresAt = user.adminMfaSetupExpiresAt;
      } else if (token.sub) {
        try {
          const currentUser = await getPrisma().user.findUnique({
            where: { id: token.sub },
            select: { role: true, status: true, adminTotpFactor: { select: { enabledAt: true } } },
          });
          if (!currentUser) {
            token.role = "CUSTOMER";
            token.status = "SUSPENDED";
            token.mfaVerified = false;
            token.adminMfaSetup = false;
          } else {
            token.role = currentUser.role;
            token.status = currentUser.status;
            if (currentUser.role !== "ADMIN" || !currentUser.adminTotpFactor?.enabledAt) {
              token.mfaVerified = false;
            }
            if (currentUser.role !== "ADMIN" || !Number.isFinite(token.adminMfaSetupExpiresAt) ||
              Number(token.adminMfaSetupExpiresAt) <= Date.now()) {
              token.adminMfaSetup = false;
            }
          }
        } catch {
          token.status = "SUSPENDED";
          token.mfaVerified = false;
          token.adminMfaSetup = false;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub ?? "";
        session.user.role = token.role === "ADMIN" || token.role === "VENDOR" || token.role === "CUSTOMER"
          ? token.role
          : "CUSTOMER";
        session.user.status = token.status === "ACTIVE" || token.status === "SUSPENDED"
          ? token.status
          : "SUSPENDED";
        session.user.mfaVerified = token.mfaVerified === true;
        session.user.adminMfaSetup = token.adminMfaSetup === true;
        session.user.adminMfaSetupExpiresAt = typeof token.adminMfaSetupExpiresAt === "number"
          ? token.adminMfaSetupExpiresAt
          : undefined;
      }
      return session;
    },
  },
});

export { handlers, auth, signIn, signOut };
