"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { getCategoryPaths } from "@/lib/category-tree";

type CategoryItem = { id: string; name: string; slug: string; parentId: string | null; isActive: boolean; _count: { products: number } };

export default function CategoryManager({ categories }: { categories: CategoryItem[] }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();
  const categoryPaths = getCategoryPaths(categories);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    const fields = new FormData(form);
    setBusy(true); setMessage(""); setError("");
    try {
      const response = await fetch("/api/admin/categories", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: fields.get("name"), slug: fields.get("slug"), parentId: fields.get("parentId") || null }), cache: "no-store",
      });
      const result: unknown = await response.json();
      if (!response.ok) {
        const text = typeof result === "object" && result !== null && "error" in result && typeof result.error === "string" ? result.error : "ثبت دسته‌بندی انجام نشد.";
        throw new Error(text);
      }
      form.reset();
      setMessage("دسته‌بندی اضافه شد.");
      router.refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "ثبت دسته‌بندی انجام نشد."); }
    finally { setBusy(false); }
  }

  async function toggle(category: CategoryItem) {
    if (busy) return;
    if (category.isActive && !window.confirm(`با غیرفعال‌کردن «${category.name}»، کالاهای این دسته از فروشگاه پنهان می‌شوند. اگر زیرشاخهٔ فعالی داشته باشد، ابتدا باید آن‌ها را غیرفعال کنید. ادامه می‌دهید؟`)) return;
    setBusy(true); setMessage(""); setError("");
    try {
      const response = await fetch(`/api/admin/categories/${encodeURIComponent(category.id)}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: category.isActive ? "deactivate" : "activate" }), cache: "no-store",
      });
      const result: unknown = await response.json();
      if (!response.ok) {
        const text = typeof result === "object" && result !== null && "error" in result && typeof result.error === "string" ? result.error : "تغییر وضعیت انجام نشد.";
        throw new Error(text);
      }
      router.refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "تغییر وضعیت انجام نشد."); }
    finally { setBusy(false); }
  }

  const inputClass = "mt-2 h-12 w-full rounded-xl border border-slate-200 px-4 text-slate-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100";
  return <>
    <form onSubmit={submit} className="mt-6 grid gap-4 rounded-2xl border border-slate-100 bg-white p-5 shadow-sm sm:grid-cols-2 sm:items-end">
      <label className="text-sm font-bold text-slate-700">نام فارسی<input name="name" required minLength={2} maxLength={60} className={inputClass} /></label>
      <label className="text-sm font-bold text-slate-700">شناسهٔ لاتین (slug)<input name="slug" required minLength={2} maxLength={60} pattern="[a-z][a-z0-9]*(?:-[a-z0-9]+)*" placeholder="مثلاً home-decor" className={inputClass} /></label>
      <label className="text-sm font-bold text-slate-700">دسته‌بندی والد (اختیاری)<select name="parentId" defaultValue="" className={inputClass}><option value="">بدون والد؛ دستهٔ اصلی</option>{categories.filter((category) => category.isActive).map((category) => <option key={category.id} value={category.id}>{categoryPaths.get(category.id) ?? category.name}</option>)}</select></label>
      <button type="submit" disabled={busy} className="h-12 rounded-xl bg-blue-700 px-5 font-bold text-white hover:bg-blue-800 disabled:opacity-50">{busy ? "در حال ثبت…" : "افزودن دسته"}</button>
    </form>
    {message && <p role="status" className="mt-3 text-sm font-bold text-emerald-800">{message}</p>}{error && <p role="alert" className="mt-3 text-sm font-bold text-rose-700">{error}</p>}
    {categories.length === 0 ? <p className="mt-6 rounded-2xl bg-white p-7 text-slate-600">دسته‌بندی‌ای ثبت نشده است.</p> : <div className="mt-6 space-y-3">{categories.map((category) => <article key={category.id} className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
      <div><h2 className="font-black text-slate-900">{categoryPaths.get(category.id) ?? category.name}</h2><p dir="ltr" className="mt-1 text-right text-sm text-slate-500">{category.slug} · {category._count.products.toLocaleString("fa-IR")} کالا</p></div>
      <div className="flex items-center gap-3"><span className={`rounded-full px-3 py-1.5 text-xs font-bold ${category.isActive ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-600"}`}>{category.isActive ? "فعال" : "غیرفعال"}</span><button type="button" disabled={busy} onClick={() => toggle(category)} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50">{category.isActive ? "غیرفعال‌کردن" : "فعال‌کردن"}</button></div>
    </article>)}</div>}
  </>;
}
