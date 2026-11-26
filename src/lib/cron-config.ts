import "server-only";
import {
  areDistinctUrlSafeSecrets,
  hasPlaceholderPrefix,
  isUrlSafeSecret,
} from "@/lib/config-secrets";

export function hasUsableCronSecret(secret: string | undefined = process.env.CRON_SECRET): secret is string {
  if (!secret || Buffer.byteLength(secret, "utf8") < 32 || hasPlaceholderPrefix(secret)) return false;
  if (process.env.NODE_ENV !== "production") return true;
  return isUrlSafeSecret(secret) && areDistinctUrlSafeSecrets([
    process.env.AUTH_SECRET,
    process.env.RATE_LIMIT_SECRET,
    secret,
  ]);
}
