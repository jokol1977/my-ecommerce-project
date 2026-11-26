import "server-only";
import { timingSafeEqual } from "node:crypto";

function constantTimeHexEqual(left: string, right: string): boolean {
  if (!/^[a-f0-9]{64}$/.test(left) || !/^[a-f0-9]{64}$/.test(right)) return false;
  return timingSafeEqual(Buffer.from(left, "hex"), Buffer.from(right, "hex"));
}

export type EmailChallengeState = "expired" | "locked" | "mismatch" | "verified";

export function evaluateEmailChallenge(input: {
  attempts: number;
  expiresAt: Date;
  storedCodeHash: string;
  suppliedCodeHash: string;
  now?: number;
  maximumAttempts?: number;
}): EmailChallengeState {
  if (input.expiresAt.getTime() <= (input.now ?? Date.now())) return "expired";
  if (input.attempts >= (input.maximumAttempts ?? 5)) return "locked";
  return constantTimeHexEqual(input.storedCodeHash, input.suppliedCodeHash) ? "verified" : "mismatch";
}

export type AdminMfaDecision = {
  allowed: boolean;
  mfaVerified: boolean;
  setupRequired: boolean;
};

export function decideAdminMfa(input: {
  isAdmin: boolean;
  factorEnabled: boolean;
  factorVerified: boolean;
  bootstrapAuthorized: boolean;
}): AdminMfaDecision {
  if (!input.isAdmin) return { allowed: true, mfaVerified: false, setupRequired: false };
  if (input.factorEnabled) {
    return {
      allowed: input.factorVerified,
      mfaVerified: input.factorVerified,
      setupRequired: false,
    };
  }
  return {
    allowed: input.bootstrapAuthorized,
    mfaVerified: false,
    setupRequired: input.bootstrapAuthorized,
  };
}
