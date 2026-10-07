/** Convert Persian and Arabic-Indic digits to ASCII digits. */
export function normalizeIranianDigits(value: string) {
  return value.replace(/[۰-۹٠-٩]/g, (digit) => {
    const persian = "۰۱۲۳۴۵۶۷۸۹".indexOf(digit);
    return String(persian >= 0 ? persian : "٠١٢٣٤٥٦٧٨٩".indexOf(digit));
  });
}

/** Return Iranian mobile numbers in canonical 09xxxxxxxxx form. */
export function normalizeIranianMobile(value: unknown): string | null {
  if (typeof value !== "string") return null;
  let phone = normalizeIranianDigits(value.normalize("NFKC")).replace(/[\s()-]/g, "");
  if (phone.startsWith("+98")) phone = `0${phone.slice(3)}`;
  else if (phone.startsWith("0098")) phone = `0${phone.slice(4)}`;
  else if (/^9\d{9}$/.test(phone)) phone = `0${phone}`;
  return /^09\d{9}$/.test(phone) ? phone : null;
}

export function isValidIranianPostalCode(value: unknown): boolean {
  if (typeof value !== "string") return false;
  return /^\d{10}$/.test(normalizeIranianDigits(value.normalize("NFKC").trim()));
}

/** Check the Iranian national-code checksum without storing the identifier. */
export function isValidIranianNationalCode(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const code = normalizeIranianDigits(value.normalize("NFKC").trim());
  if (!/^\d{10}$/.test(code) || /^([0-9])\1{9}$/.test(code)) return false;

  const digits = [...code].map(Number);
  const remainder = digits
    .slice(0, 9)
    .reduce((sum, digit, index) => sum + digit * (10 - index), 0) % 11;
  const checkDigit = remainder < 2 ? remainder : 11 - remainder;
  return digits[9] === checkDigit;
}
