import NextAuth from "next-auth";
import Nodemailer from "next-auth/providers/nodemailer";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { getPrisma } from "@/lib/prisma";
import { hasUsableAuthSecret, hasUsableEmailConfig } from "@/lib/auth-config";
import { checkEmailSignInDeliveryRateLimit, checkRequestIpRateLimit } from "@/lib/rate-limit";

const authConfigured = Boolean(
  process.env.DATABASE_URL &&
  hasUsableAuthSecret() &&
  hasUsableEmailConfig(),
);

function createRateLimitedNodemailerProvider() {
  const provider = Nodemailer({
    server: {
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT),
      secure: process.env.SMTP_SECURE === "true",
      requireTLS: process.env.SMTP_SECURE !== "true",
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD,
      },
      tls: { minVersion: "TLSv1.2" },
    },
    from: process.env.EMAIL_FROM,
  });
  return {
    ...provider,
    async sendVerificationRequest(params: Parameters<typeof provider.sendVerificationRequest>[0]) {
      const [emailLimit, ipLimit] = await Promise.all([
        checkEmailSignInDeliveryRateLimit(params.identifier),
        checkRequestIpRateLimit(params.request, "email-sign-in", 20, 15 * 60),
      ]);
      if (!emailLimit.allowed || !ipLimit.allowed) {
        throw new Error("Email sign-in delivery rate limit exceeded.");
      }
      await provider.sendVerificationRequest(params);
    },
  };
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...(authConfigured ? { adapter: PrismaAdapter(getPrisma()) } : {}),
  providers: authConfigured
    ? [createRateLimitedNodemailerProvider()]
    : [],
  secret: process.env.AUTH_SECRET,
  pages: { signIn: "/login" },
  session: { strategy: "database" },
  callbacks: {
    async session({ session, user }) {
      const account = await getPrisma().user.findUnique({
        where: { id: user.id },
        select: { id: true, role: true, status: true },
      });

      // Auth.js passes AdapterSession fields here, including the bearer
      // sessionToken. Build a client session from an explicit allowlist.
      return {
        expires: session.expires,
        user: {
          name: session.user?.name ?? null,
          email: session.user?.email ?? null,
          image: session.user?.image ?? null,
          id: account?.id ?? "",
          role: account?.role ?? "CUSTOMER",
          status: account?.status ?? "SUSPENDED",
        },
      };
    },
  },
});
