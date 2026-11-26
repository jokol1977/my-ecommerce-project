import "server-only";

const exampleAuthSecret = "replace_with_a_random_secret_of_at_least_32_bytes";

export function hasUsableAuthSecret(secret = process.env.AUTH_SECRET): boolean {
  return Boolean(
    secret && Buffer.byteLength(secret, "utf8") >= 32 &&
    secret !== exampleAuthSecret && !secret.startsWith("replace_with_"),
  );
}

export function hasUsableEmailConfig(
  host = process.env.SMTP_HOST,
  port = process.env.SMTP_PORT,
  user = process.env.SMTP_USER,
  password = process.env.SMTP_PASSWORD,
  secure = process.env.SMTP_SECURE,
  from = process.env.EMAIL_FROM,
): boolean {
  const numericPort = Number(port);
  const address = from?.match(/<([^<>]+)>/)?.[1] ?? from ?? "";
  return Boolean(
    host && /^[a-zA-Z0-9.-]+$/.test(host) &&
    !host.toLowerCase().endsWith(".example.ir") && !host.toLowerCase().endsWith(".example.com") &&
    Number.isSafeInteger(numericPort) && numericPort > 0 && numericPort <= 65_535 &&
    user && !user.startsWith("replace_with_") && password && !password.startsWith("replace_with_") &&
    (secure === "true" || secure === "false") &&
    /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(address) &&
    !address.toLowerCase().endsWith("@example.com"),
  );
}
