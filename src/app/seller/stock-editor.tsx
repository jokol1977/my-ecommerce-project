"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

export default function StockEditor({ productId, initialStock }: { productId: string; initialStock: number }) {
  const [stock, setStock] = useState(String(initialStock));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setMessage("");
    setError("");
    try {
      const response = await fetch(`/api/vendor/products/${encodeURIComponent(productId)}/stock`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stockQuantity: Number(stock) }),
        cache: "no-store",
      });
      const result: unknown = await response.json();
      if (!response.ok) {
        const text = typeof result === "object" && result !== null && "error" in result && typeof result.error === "string" ? result.error : "به‌روزرسانی موجودی انجام نشد.";
        throw new Error(text);
      }
      setMessage("موجودی به‌روز شد.");
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "به‌روزرسانی موجودی انجام نشد.");
    } finally {
      setBusy(false);
    }
  }

  return <form onSubmit={submit} className="flex flex-wrap items-end gap-2" aria-label="به‌روزرسانی موجودی کالا">
    <label className="text-xs font-bold text-slate-600">تغییر موجودی
      <input aria-label="موجودی جدید" type="number" min={0} max={1_000_000} step={1} required value={stock} onChange={(event) => setStock(event.target.value)} className="mt-1 block h-10 w-28 rounded-lg border border-slate-200 px-3 text-sm text-slate-900" />
    </label>
    <button type="submit" disabled={busy || !/^(0|[1-9]\d{0,6})$/.test(stock) || Number(stock) > 1_000_000} className="h-10 rounded-lg bg-slate-900 px-3 text-sm font-bold text-white disabled:opacity-50">{busy ? "در حال ثبت…" : "ذخیره"}</button>
    {message && <span role="status" className="text-xs font-bold text-emerald-800">{message}</span>}
    {error && <span role="alert" className="text-xs font-bold text-rose-700">{error}</span>}
  </form>;
}
