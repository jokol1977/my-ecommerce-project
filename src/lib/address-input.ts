import { findIranCity, findIranProvince } from "@/lib/iran-locations";
import { isValidIranianPostalCode, normalizeIranianDigits, normalizeIranianMobile } from "@/lib/iranian-input";

export type AddressData = {
  title: string;
  recipient: string;
  phone: string;
  province: string;
  city: string;
  addressLine: string;
  buildingNumber: string | null;
  unit: string | null;
  postalCode: string;
};

function text(value: unknown, min: number, max: number): string | null {
  if (typeof value !== "string") return null;
  const result = value.normalize("NFKC").trim();
  if (result.length < min || result.length > max || /[\u0000-\u001f\u007f]/.test(result)) return null;
  return result;
}

function optionalText(value: unknown, max: number): string | null | undefined {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") return undefined;
  if (!value.trim()) return null;
  return text(value, 1, max) ?? undefined;
}

export function parseAddressData(value: unknown): AddressData | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const data = value as Record<string, unknown>;
  const title = text(data.title, 2, 50);
  const recipient = text(data.recipient, 2, 120);
  const phone = normalizeIranianMobile(data.phone);
  const rawProvince = text(data.province, 2, 100);
  const rawCity = text(data.city, 2, 100);
  const province = rawProvince ? findIranProvince(rawProvince) : null;
  const city = province && rawCity ? findIranCity(province, rawCity) : null;
  const addressLine = text(data.addressLine, 8, 1000);
  const buildingNumber = optionalText(data.buildingNumber, 40);
  const unit = optionalText(data.unit, 40);
  const postalCode = typeof data.postalCode === "string" ? normalizeIranianDigits(data.postalCode.normalize("NFKC").trim()) : "";

  if (!title || !recipient || !phone || !province || !city || !addressLine || buildingNumber === undefined || unit === undefined || !isValidIranianPostalCode(postalCode)) return null;
  return { title, recipient, phone, province, city, addressLine, buildingNumber, unit, postalCode };
}
