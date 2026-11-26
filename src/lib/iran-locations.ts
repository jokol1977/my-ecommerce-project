import locationData from "@/data/iran-locations.json";

export type IranLocationRecord = { province: string; cities: string[] };

export const IRAN_LOCATIONS: IranLocationRecord[] = locationData;
export const IRAN_PROVINCES = IRAN_LOCATIONS.map((item) => item.province);

export function normalizeIranLocationName(value: string) {
  return value
    .normalize("NFKC")
    .replace(/[يى]/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/[\u200c\u200f\u202a-\u202e]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function findIranProvince(value: string) {
  const normalized = normalizeIranLocationName(value);
  return IRAN_LOCATIONS.find((item) => normalizeIranLocationName(item.province) === normalized)?.province ?? null;
}

export function getIranCities(province: string) {
  const canonicalProvince = findIranProvince(province);
  return IRAN_LOCATIONS.find((item) => item.province === canonicalProvince)?.cities ?? [];
}

export function findIranCity(province: string, city: string) {
  const normalized = normalizeIranLocationName(city);
  return getIranCities(province).find((item) => normalizeIranLocationName(item) === normalized) ?? null;
}
