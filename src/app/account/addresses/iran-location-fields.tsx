"use client";

import { useId, useState } from "react";
import { findIranProvince, getIranCities, IRAN_PROVINCES, normalizeIranLocationName } from "@/lib/iran-locations";

type IranLocationFieldsProps = {
  province: string;
  city: string;
  onProvinceChange: (value: string) => void;
  onCityChange: (value: string) => void;
};

function SearchableLocationField({
  label,
  name,
  value,
  options,
  disabled = false,
  onChange,
  onSelect,
}: {
  label: string;
  name: "province" | "city";
  value: string;
  options: string[];
  disabled?: boolean;
  onChange: (value: string) => void;
  onSelect: (value: string) => void;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const normalizedValue = normalizeIranLocationName(value);
  const matches = (normalizedValue
    ? options.filter((option) => normalizeIranLocationName(option).includes(normalizedValue))
    : options
  ).slice(0, 10);
  const selected = options.some((option) => normalizeIranLocationName(option) === normalizedValue);
  const listId = id + "-options";

  return (
    <div className="relative">
      <label htmlFor={id} className="text-sm font-bold">{label}</label>
      <input
        id={id}
        name={name}
        required
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open && matches.length > 0}
        aria-controls={listId}
        aria-invalid={!selected}
        autoComplete="off"
        value={value}
        disabled={disabled}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 100)}
        onChange={(event) => {
          onChange(event.target.value);
          setOpen(true);
        }}
        className={"mt-2 min-h-11 w-full rounded-xl border px-3 font-normal outline-none focus:ring-2 " + (selected ? "border-emerald-500 focus:border-emerald-600 focus:ring-emerald-100" : "border-rose-400 focus:border-rose-500 focus:ring-rose-100") + (disabled ? " cursor-not-allowed bg-slate-100 text-slate-500" : "")}
      />
      <p className={"mt-1 text-xs " + (selected ? "text-emerald-700" : "text-slate-500")}>
        {disabled ? "ابتدا استان را انتخاب کنید." : selected ? "مقدار معتبر است." : name === "province" ? "استان را تایپ و از فهرست انتخاب کنید." : "شهر را از فهرست همین استان انتخاب کنید."}
      </p>
      {open && !disabled && matches.length > 0 && (
        <ul id={listId} role="listbox" aria-label={"گزینه‌های " + label} className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-xl border border-slate-200 bg-white p-1 shadow-xl">
          {matches.map((option) => (
            <li key={option} role="option" aria-selected={normalizeIranLocationName(option) === normalizedValue}>
              <button
                type="button"
                onPointerDown={(event) => event.preventDefault()}
                onClick={() => {
                  onSelect(option);
                  setOpen(false);
                }}
                className="min-h-10 w-full rounded-lg px-3 text-right text-sm hover:bg-blue-50 focus:bg-blue-50 focus:outline-none"
              >
                {option}
              </button>
            </li>
          ))}
          {options.length > matches.length && !normalizedValue && <li className="px-3 py-2 text-xs text-slate-500">برای جست‌وجو تایپ کنید؛ {options.length.toLocaleString("fa-IR")} گزینه موجود است.</li>}
        </ul>
      )}
    </div>
  );
}

export default function IranLocationFields({ province, city, onProvinceChange, onCityChange }: IranLocationFieldsProps) {
  const cities = getIranCities(province);
  return (
    <>
      <SearchableLocationField
        label="استان"
        name="province"
        value={province}
        options={IRAN_PROVINCES}
        onChange={(value) => {
          onProvinceChange(value);
          onCityChange("");
        }}
        onSelect={(value) => {
          onProvinceChange(value);
          onCityChange("");
        }}
      />
      <SearchableLocationField
        label="شهر"
        name="city"
        value={city}
        options={cities}
        disabled={!findIranProvince(province)}
        onChange={onCityChange}
        onSelect={onCityChange}
      />
    </>
  );
}
