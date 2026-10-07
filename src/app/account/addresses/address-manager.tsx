"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { SavedAddress } from "@/types/address";

const emptyAddress: Omit<SavedAddress, "id"> = { title: "", recipient: "", phone: "", province: "", city: "", addressLine: "", postalCode: "" };

export default function AddressManager({ addresses }: { addresses: SavedAddress[] }) {
  const [editing, setEditing] = useState<SavedAddress | null>(null);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const router = useRouter();

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const formElement = event.currentTarget;
    const fields = new FormData(formElement);
    const payload = Object.fromEntries(["title", "recipient", "phone", "province", "city", "addressLine", "postalCode"].map((key) => [key, fields.get(key)]));
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch(editing ? `/api/account/addresses/${encodeURIComponent(editing.id)}` : "/api/account/addresses", {
        method: editing ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload), cache: "no-store",
      });
      const result: unknown = await response.json();
      if (!response.ok) {
        const text = typeof result === "object" && result !== null && "error" in result && typeof result.error === "string" ? result.error : "ذخیرهٔ نشانی انجام نشد.";
        throw new Error(text);
      }
      setEditing(null); setCreating(false); setMessage(editing ? "نشانی به‌روز شد." : "نشانی ذخیره شد.");
      router.refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "ذخیرهٔ نشانی انجام نشد."); }
    finally { setBusy(false); }
  }

  async function remove(address: SavedAddress) {
    if (busy || !window.confirm(`نشانی «${address.title}» حذف شود؟`)) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch(`/api/account/addresses/${encodeURIComponent(address.id)}`, { method: "DELETE", cache: "no-store" });
      const result: unknown = await response.json();
      if (!response.ok) {
        const text = typeof result === "object" && result !== null && "error" in result && typeof result.error === "string" ? result.error : "حذف نشانی انجام نشد.";
        throw new Error(text);
      }
      if (editing?.id === address.id) setEditing(null);
      setMessage("نشانی حذف شد.");
      router.refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "حذف نشانی انجام نشد."); }
    finally { setBusy(false); }
  }

  const inputClass = "mt-2 min-h-11 w-full rounded-xl border border-slate-300 px-3 font-normal outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100";
  const formAddress = editing ?? emptyAddress;
  const form = (title: string) => <form key={editing?.id ?? "new-address"} onSubmit={save} className="mt-5 grid gap-4 rounded-2xl border border-slate-100 bg-white p-5 shadow-sm sm:grid-cols-2">
    <h2 className="text-lg font-black sm:col-span-2">{title}</h2>
    <label className="text-sm font-bold">عنوان نشانی<input name="title" required minLength={2} maxLength={50} defaultValue={formAddress.title} className={inputClass} /></label>
    <label className="text-sm font-bold">نام تحویل‌گیرنده<input name="recipient" required minLength={2} maxLength={120} defaultValue={formAddress.recipient} autoComplete="name" className={inputClass} /></label>
    <label className="text-sm font-bold">شمارهٔ موبایل<input name="phone" required type="tel" maxLength={24} defaultValue={formAddress.phone} autoComplete="tel" dir="ltr" className={`${inputClass} text-left`} /></label>
    <label className="text-sm font-bold">استان<input name="province" required minLength={2} maxLength={100} defaultValue={formAddress.province} autoComplete="address-level1" className={inputClass} /></label>
    <label className="text-sm font-bold">شهر<input name="city" required minLength={2} maxLength={100} defaultValue={formAddress.city} autoComplete="address-level2" className={inputClass} /></label>
    <label className="text-sm font-bold sm:col-span-2">نشانی کامل<textarea name="addressLine" required minLength={8} maxLength={1000} defaultValue={formAddress.addressLine} autoComplete="street-address" rows={3} className={`${inputClass} py-3`} /></label>
    <label className="text-sm font-bold">کد پستی ۱۰ رقمی<input name="postalCode" required inputMode="numeric" minLength={10} maxLength={10} defaultValue={formAddress.postalCode} autoComplete="postal-code" className={inputClass} /></label>
    <div className="flex items-end gap-3"><button type="submit" disabled={busy} className="min-h-11 rounded-xl bg-blue-700 px-5 font-bold text-white hover:bg-blue-800 disabled:opacity-50">{busy ? "در حال ذخیره…" : editing ? "ذخیرهٔ تغییرات" : "ذخیرهٔ نشانی"}</button>{editing && <button type="button" disabled={busy} onClick={() => setEditing(null)} className="min-h-11 rounded-xl bg-slate-100 px-5 font-bold text-slate-700">انصراف</button>}</div>
  </form>;

  return <>
    {message && <p role="status" className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm font-bold text-emerald-800">{message}</p>}{error && <p role="alert" className="mt-4 rounded-xl bg-rose-50 p-3 text-sm font-bold text-rose-800">{error}</p>}
    {addresses.length < 20 && !creating && !editing && <button type="button" onClick={() => { setCreating(true); setMessage(""); }} className="mt-6 rounded-xl bg-blue-700 px-5 py-3 font-bold text-white hover:bg-blue-800">افزودن نشانی</button>}
    {(creating || editing) && form(editing ? "ویرایش نشانی" : "نشانی تازه")}
    {addresses.length === 0 && !creating ? <p className="mt-6 rounded-2xl bg-white p-7 text-slate-600">هنوز نشانی ذخیره نکرده‌اید.</p> : <div className="mt-6 space-y-3">{addresses.map((address) => <article key={address.id} className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-black text-slate-900">{address.title}</h2><p className="mt-2 text-sm font-bold text-slate-700">{address.recipient} · <span dir="ltr">{address.phone}</span></p><p className="mt-1 text-sm leading-7 text-slate-600">{address.province}، {address.city}، {address.addressLine}</p><p className="mt-1 text-xs text-slate-500">کد پستی: {address.postalCode}</p></div><div className="flex gap-2"><button type="button" disabled={busy} onClick={() => { setEditing(address); setCreating(false); setError(""); }} className="rounded-lg bg-blue-50 px-3 py-2 text-sm font-bold text-blue-800">ویرایش</button><button type="button" disabled={busy} onClick={() => void remove(address)} className="rounded-lg bg-rose-50 px-3 py-2 text-sm font-bold text-rose-800">حذف</button></div></div>
    </article>)}</div>}
  </>;
}
