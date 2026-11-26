import "server-only";

const insecurePlaceholder = "replace_with_a_different_random_secret_of_at_least_32_bytes";

export function hasUsableCronSecret(secret: string | undefined = process.env.CRON_SECRET): secret is string {
  return Boolean(
    secret && Buffer.byteLength(secret, "utf8") >= 32 &&
    secret !== insecurePlaceholder && !secret.startsWith("replace_with_"),
  );
}
