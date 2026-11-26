import "server-only";
import { normalizeIranianMobile } from "@/lib/iranian-input";

const REQUEST_TIMEOUT_MS = 8_000;

type KavenegarResponse = {
  return?: { status?: unknown };
  entries?: Array<{ messageid?: unknown }>;
};

export function isIranianSmsConfigured() {
  return process.env.SMS_PROVIDER === "kavenegar" &&
    Boolean(process.env.KAVENEGAR_API_KEY?.trim()) &&
    Boolean(process.env.KAVENEGAR_SENDER?.trim());
}

/** Send a transactional SMS through the configured Iranian provider. */
export async function sendIranianSms(input: { to: string; message: string }) {
  if (process.env.SMS_PROVIDER !== "kavenegar") {
    throw new Error("SMS_PROVIDER is disabled or unsupported.");
  }

  const apiKey = process.env.KAVENEGAR_API_KEY?.trim();
  const sender = process.env.KAVENEGAR_SENDER?.trim();
  const phone = normalizeIranianMobile(input.to);
  const message = input.message.normalize("NFKC").trim();
  if (!apiKey || !sender) throw new Error("Kavenegar SMS credentials are incomplete.");
  if (!phone) throw new Error("SMS recipient must be a valid Iranian mobile number.");
  if (!message || message.length > 500 || /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(message)) {
    throw new Error("SMS message is invalid.");
  }

  const body = new URLSearchParams({ sender, receptor: phone, message });
  const response = await fetch(`https://api.kavenegar.com/v1/${encodeURIComponent(apiKey)}/sms/send.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
      Accept: "application/json",
    },
    body,
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  let result: KavenegarResponse | null = null;
  try {
    const payload: unknown = await response.json();
    if (typeof payload === "object" && payload !== null && !Array.isArray(payload)) {
      result = payload as KavenegarResponse;
    }
  } catch {
    result = null;
  }

  if (!response.ok || result?.return?.status !== 200) {
    throw new Error("Kavenegar did not accept the SMS request.");
  }

  const messageId = result.entries?.[0]?.messageid;
  return { provider: "KAVENEGAR" as const, messageId: typeof messageId === "number" || typeof messageId === "string" ? String(messageId) : null };
}
