import type { UserRole, UserStatus } from "@/generated/prisma/enums";
import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface User {
    role?: UserRole;
    status?: UserStatus;
    mfaVerified?: boolean;
    adminMfaSetup?: boolean;
    adminMfaSetupExpiresAt?: number;
  }

  interface Session {
    user: DefaultSession["user"] & {
      id: string;
      role: UserRole;
      status: UserStatus;
      mfaVerified: boolean;
      adminMfaSetup: boolean;
      adminMfaSetupExpiresAt?: number;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role?: UserRole;
    status?: UserStatus;
    mfaVerified?: boolean;
    adminMfaSetup?: boolean;
    adminMfaSetupExpiresAt?: number;
  }
}
