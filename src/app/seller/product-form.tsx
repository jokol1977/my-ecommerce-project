"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

type CategoryOption = { id: string; name: string; label: string };
type EditableProduct = { id: string; name: string; description: string; categoryId: string; priceToman: number; stockQuantity: number };

export default function ProductForm({ categories, product, onSaved }: { categories: CategoryOption[]; product?: EditableProduct; onSaved?: () => void }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const formElement = event.currentTarget;
    setBusy(true);
    setError("");
    setMessage("");
    const form = new FormData(formElement);
    const payload = {
      name: form.get("name"),
      description: form.get("description"),
      categoryId: form.get("categoryId"),
      priceToman: Number(form.get("priceToman")),
      stockQuantity: Number(form.get("stockQuantity")),
    };
    try {
      const response = await fetch(product ? `/api/vendor/products/${encodeURIComponent(product.id)}` : "/api/vendor/products", {
        method: product ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        cache: "no-store",
      });
      const result: unknown = await response.json();
      if (!response.ok) {
        const text = typeof result === "object" && result !== null && "error" in result && typeof result.error === "string" ? result.error : "ثبت کالا انجام نشد.";
        throw new Error(text);
      }
      if (!product) formElement.reset();
      setMessage(product ? "اصلاحات ثبت شد و کالا دوباره برای بررسی فرستاده شد." : "کالا ثبت شد و پس از بررسی مدیر منتشر می‌شود.");
      router.refresh();
      onSaved?.();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "ثبت کالا انجام نشد.");
    } finally {
      setBusy(false);
    }
  }

  const fieldClass = "mt-2 min-h-12 w-full rounded-xl border border-slate-200 px-4 text-slate-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100";
  return (
    <form key={product?.id ?? "new-product"} onSubmit={submit} className="mt-5 grid gap-5 sm:grid-cols-2">
      <label className="text-sm font-bold text-slate-700">نام کالا<input name="name" required minLength={3} maxLength={120} defaultValue={product?.name ?? ""} className={fieldClass} /></label>
      <label className="text-sm font-bold text-slate-700">دسته‌بندی<select name="categoryId" required defaultValue={product?.categoryId ?? ""} className={fieldClass}><option value="" disabled>انتخاب کنید</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.label}</option>)}</select></label>
      <label className="text-sm font-bold text-slate-700">قیمت (تومان)<input name="priceToman" type="number" required min={1} max={2147483647} step={1} defaultValue={product?.priceToman} className={fieldClass} /></label>
      <label className="text-sm font-bold text-slate-700">موجودی<input name="stockQuantity" type="number" required min={0} max={1000000} step={1} defaultValue={product?.stockQuantity ?? 0} className={fieldClass} /></label>
      <label className="text-sm font-bold text-slate-700 sm:col-span-2">توضیحات<textarea name="description" maxLength={5000} rows={4} defaultValue={product?.description ?? ""} className={`${fieldClass} py-3`} /></label>
      <div className="sm:col-span-2"><button type="submit" disabled={busy} className="min-h-12 rounded-xl bg-blue-700 px-6 font-bold text-white transition hover:bg-blue-800 disabled:opacity-50">{busy ? "در حال ثبت…" : product ? "ارسال اصلاحات برای بررسی" : "ثبت برای بررسی"}</button>{message && <p role="status" className="mt-3 text-sm font-bold text-emerald-800">{message}</p>}{error && <p role="alert" className="mt-3 text-sm font-bold text-rose-700">{error}</p>}</div>
    </form>
  );
}
