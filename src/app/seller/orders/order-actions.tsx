"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

export default function VendorOrderActions({ vendorOrderId, status }: { vendorOrderId: string; status: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [shippingProvider, setShippingProvider] = useState("");
  const [trackingCode, setTrackingCode] = useState("");
  const router = useRouter();

  async function update(action: "process" | "ship", event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (busy) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/vendor/orders/${encodeURIComponent(vendorOrderId)}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, shippingProvider, trackingCode }), cache: "no-store",
      });
      const result: unknown = await response.json();
      if (!response.ok) {
        const message = typeof result === "object" && result !== null && "error" in result && typeof result.error === "string" ? result.error : "به‌روزرسانی سفارش انجام نشد.";
        throw new Error(message);
      }
      router.refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "به‌روزرسانی سفارش انجام نشد."); }
    finally { setBusy(false); }
  }

  if (status === "PAID") return <div className="mt-5"><button type="button" disabled={busy} onClick={() => void update("process")} className="min-h-11 rounded-xl bg-blue-700 px-5 font-bold text-white hover:bg-blue-800 disabled:opacity-50">{busy ? "در حال ثبت…" : "شروع آماده‌سازی"}</button>{error && <p role="alert" className="mt-3 text-sm font-bold text-rose-700">{error}</p>}</div>;
  if (status !== "PROCESSING") return null;
  return <form onSubmit={(event) => void update("ship", event)} className="mt-5 grid gap-3 rounded-xl border border-slate-100 p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
    <label className="text-xs font-bold text-slate-600">شرکت ارسال (اختیاری)<input maxLength={80} value={shippingProvider} onChange={(event) => setShippingProvider(event.target.value)} className="mt-2 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm text-slate-900" /></label>
    <label className="text-xs font-bold text-slate-600">کد رهگیری (اختیاری)<input maxLength={80} value={trackingCode} onChange={(event) => setTrackingCode(event.target.value)} className="mt-2 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm text-slate-900" /></label>
    <button type="submit" disabled={busy || Boolean(shippingProvider.trim()) !== Boolean(trackingCode.trim())} className="h-10 rounded-lg bg-emerald-700 px-4 text-sm font-bold text-white hover:bg-emerald-800 disabled:opacity-50">{busy ? "در حال ثبت…" : "ثبت ارسال"}</button>
    {error && <p role="alert" className="text-sm font-bold text-rose-700 sm:col-span-3">{error}</p>}
  </form>;
}
