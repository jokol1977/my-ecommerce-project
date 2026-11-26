import "server-only";

const MERCHANT_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const AUTHORITY_PATTERN = /^[A-Za-z0-9]{16,80}$/;
const REQUEST_TIMEOUT_MS = 8_000;

export const ZARINPAL_PROVIDER = "ZARINPAL";
export const ZARINPAL_MINIMUM_AMOUNT_TOMAN = 1_000;

type ZarinpalMode = "sandbox" | "production";

type ZarinpalResponse = {
  data?: {
    code?: unknown;
    authority?: unknown;
    ref_id?: unknown;
  };
  errors?: { code?: unknown } | Array<{ code?: unknown }>;
};

export type ZarinpalConfiguration = {
  mode: ZarinpalMode;
  merchantId: string;
  siteOrigin: string;
  apiOrigin: string;
  startPayOrigin: string;
};

export function getZarinpalConfiguration(): ZarinpalConfiguration | null {
  const mode = process.env.ZARINPAL_MODE;
  const merchantId = process.env.ZARINPAL_MERCHANT_ID?.trim() ?? "";
  const siteUrl = process.env.AUTH_URL?.trim() ?? "";
  if ((mode !== "sandbox" && mode !== "production") || !MERCHANT_ID_PATTERN.test(merchantId)) return null;

  let parsedSiteUrl: URL;
  try {
    parsedSiteUrl = new URL(siteUrl);
  } catch {
    return null;
  }
  if (
    !["http:", "https:"].includes(parsedSiteUrl.protocol) ||
    parsedSiteUrl.username || parsedSiteUrl.password || parsedSiteUrl.search || parsedSiteUrl.hash ||
    (mode === "production" && (process.env.NODE_ENV !== "production" || parsedSiteUrl.protocol !== "https:")) ||
    (mode === "sandbox" && process.env.NODE_ENV === "production") ||
    (mode === "sandbox" && parsedSiteUrl.protocol === "http:" && !["localhost", "127.0.0.1", "::1"].includes(parsedSiteUrl.hostname))
  ) {
    return null;
  }

  const apiOrigin = mode === "sandbox" ? "https://sandbox.zarinpal.com" : "https://api.zarinpal.com";
  const startPayOrigin = mode === "sandbox" ? "https://sandbox.zarinpal.com" : "https://www.zarinpal.com";
  return { mode, merchantId, siteOrigin: parsedSiteUrl.origin, apiOrigin, startPayOrigin };
}

export function isZarinpalConfigured() {
  return getZarinpalConfiguration() !== null;
}

export function zarinpalCallbackUrl(configuration: ZarinpalConfiguration) {
  return new URL("/api/payments/zarinpal/callback", configuration.siteOrigin).toString();
}

export function zarinpalStartPayUrl(configuration: ZarinpalConfiguration, authority: string) {
  if (!AUTHORITY_PATTERN.test(authority)) throw new Error("Invalid ZarinPal authority.");
  return `${configuration.startPayOrigin}/pg/StartPay/${encodeURIComponent(authority)}`;
}

function parseRefId(value: unknown): string | null {
  if (typeof value === "string" && /^\d{1,40}$/.test(value)) return value;
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) return String(value);
  return null;
}

async function post<T extends ZarinpalResponse>(
  configuration: ZarinpalConfiguration,
  path: string,
  payload: Record<string, string | number>,
): Promise<{ response: Response; body: T | null }> {
  const response = await fetch(`${configuration.apiOrigin}/pg/v4/payment/${path}.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(payload),
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  let body: T | null = null;
  try {
    const parsed: unknown = await response.json();
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) body = parsed as T;
  } catch {
    body = null;
  }
  return { response, body };
}

export async function createZarinpalPayment(input: {
  configuration: ZarinpalConfiguration;
  amountToman: number;
  orderId: string;
}) {
  const amountRial = input.amountToman * 10;
  if (!Number.isSafeInteger(amountRial) || amountRial < ZARINPAL_MINIMUM_AMOUNT_TOMAN * 10) {
    throw new Error("Order amount is outside ZarinPal's supported range.");
  }

  const { response, body } = await post<ZarinpalResponse>(input.configuration, "request", {
    merchant_id: input.configuration.merchantId,
    amount: amountRial,
    callback_url: zarinpalCallbackUrl(input.configuration),
    description: `JananKadeh order ${input.orderId}`,
  });
  const code = body?.data?.code;
  const authority = body?.data?.authority;
  if (!response.ok || code !== 100 || typeof authority !== "string" || !AUTHORITY_PATTERN.test(authority)) {
    throw new Error("ZarinPal did not issue a valid payment authority.");
  }

  return { authority, redirectUrl: zarinpalStartPayUrl(input.configuration, authority) };
}

export async function verifyZarinpalPayment(input: {
  configuration: ZarinpalConfiguration;
  authority: string;
  amountToman: number;
}): Promise<{ kind: "verified"; transactionId: string | null } | { kind: "failed" } | { kind: "indeterminate" }> {
  const amountRial = input.amountToman * 10;
  if (!AUTHORITY_PATTERN.test(input.authority) || !Number.isSafeInteger(amountRial) || amountRial < ZARINPAL_MINIMUM_AMOUNT_TOMAN * 10) {
    return { kind: "indeterminate" };
  }

  let result: { response: Response; body: ZarinpalResponse | null };
  try {
    result = await post<ZarinpalResponse>(input.configuration, "verify", {
      merchant_id: input.configuration.merchantId,
      amount: amountRial,
      authority: input.authority,
    });
  } catch {
    return { kind: "indeterminate" };
  }

  const errors = result.body?.errors;
  const errorCode = Array.isArray(errors) ? errors[0]?.code : errors?.code;
  const code = typeof result.body?.data?.code === "number" ? result.body.data.code : errorCode;
  if (result.response.ok && (code === 100 || code === 101)) {
    return { kind: "verified", transactionId: parseRefId(result.body?.data?.ref_id) };
  }
  if (result.response.ok && typeof code === "number" && Number.isInteger(code)) return { kind: "failed" };
  return { kind: "indeterminate" };
}
