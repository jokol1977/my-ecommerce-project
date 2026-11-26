import { isValidIranianPostalCode, normalizeIranianMobile } from "@/lib/iranian-input";

export type AddressData = {
  title: string;
  recipient: string;
  phone: string;
  province: string;
  city: string;
  addressLine: string;
  postalCode: string;
};

function text(value: unknown, min: number, max: number): string | null {
  if (typeof value !== "string") return null;
  const result = value.normalize("NFKC").trim();
  if (result.length < min || result.length > max || /[\u0000-\u001f\u007f]/.test(result)) return null;
  return result;
}

export function parseAddressData(value: unknown): AddressData | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const data = value as Record<string, unknown>;
  const title = text(data.title, 2, 50);
  const recipient = text(data.recipient, 2, 120);
  const phone = normalizeIranianMobile(data.phone);
  const province = text(data.province, 2, 100);
  const city = text(data.city, 2, 100);
  const addressLine = text(data.addressLine, 8, 1000);
  const postalCode = typeof data.postalCode === "string" ? data.postalCode.trim() : "";

  if (!title || !recipient || !phone || !province || !city || !addressLine || !isValidIranianPostalCode(postalCode)) return null;
  return { title, recipient, phone, province, city, addressLine, postalCode };
}
