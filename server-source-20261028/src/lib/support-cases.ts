export const SUPPORT_CASE_CATEGORIES = ["DELIVERY", "ITEM_QUALITY", "MISSING_ITEM", "OTHER"] as const;
export type SupportCaseCategoryValue = (typeof SUPPORT_CASE_CATEGORIES)[number];

export const SUPPORT_CASE_STATUSES = [
  "WAITING_FOR_VENDOR",
  "WAITING_FOR_CUSTOMER",
  "UNDER_REVIEW",
  "RESOLVED",
] as const;
export type SupportCaseStatusValue = (typeof SUPPORT_CASE_STATUSES)[number];

export const SUPPORT_CASE_ORDER_STATUSES = ["PAID", "PROCESSING", "SHIPPED", "DELIVERED", "CANCELLED", "REFUNDED"] as const;

export function isSupportCaseCategory(value: unknown): value is SupportCaseCategoryValue {
  return typeof value === "string" && SUPPORT_CASE_CATEGORIES.some((category) => category === value);
}

export function isSupportCaseStatus(value: unknown): value is SupportCaseStatusValue {
  return typeof value === "string" && SUPPORT_CASE_STATUSES.some((status) => status === value);
}

export function normalizeSupportCaseMessage(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const body = value.normalize("NFKC").replace(/\r\n?/g, "\n").replace(/\t/g, " ").trim();
  if (body.length < 10 || body.length > 2000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(body)) return null;
  return body;
}
