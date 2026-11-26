"use client";

import { useId } from "react";
import { normalizeIranianDigits } from "@/lib/iranian-input";

type IranianDigitFieldProps = {
  label: string;
  name: "phone" | "postalCode";
  value: string;
  onChange: (value: string) => void;
  autoComplete?: string;
};

export default function IranianDigitField({ label, name, value, onChange, autoComplete }: IranianDigitFieldProps) {
  const id = useId();
  const isPhone = name === "phone";
  const requiredLength = isPhone ? 11 : 10;
  const valid = isPhone ? /^09\d{9}$/.test(value) : /^\d{10}$/.test(value);
  const inputClass = valid
    ? "border-emerald-500 bg-emerald-50/50 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
    : "border-rose-400 bg-rose-50/40 focus:border-rose-500 focus:ring-2 focus:ring-rose-100";

  return (
    <label htmlFor={id} className="block text-sm font-bold">
      {label}
      <input
        id={id}
        name={name}
        type={isPhone ? "tel" : "text"}
        required
        inputMode="numeric"
        autoComplete={autoComplete}
        dir="ltr"
        value={value}
        placeholder={isPhone ? "09123456789" : "1234567890"}
        maxLength={requiredLength}
        pattern={isPhone ? "09[0-9]{9}" : "[0-9]{10}"}
        aria-invalid={!valid}
        aria-describedby={id + "-count"}
        onChange={(event) => onChange(normalizeIranianDigits(event.target.value.normalize("NFKC")).replace(/\D/g, "").slice(0, requiredLength))}
        className={"mt-2 min-h-11 w-full rounded-xl border px-3 text-left font-normal outline-none transition-colors " + inputClass}
      />
      <span id={id + "-count"} aria-live="polite" className={"mt-1 block text-xs font-bold " + (valid ? "text-emerald-700" : "text-rose-700")}>
        {value.length.toLocaleString("fa-IR")} از {requiredLength.toLocaleString("fa-IR")} رقم
        {valid ? " · کامل است" : ""}
      </span>
    </label>
  );
}
