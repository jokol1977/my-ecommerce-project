"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function CancelOrder({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function cancelOrder() {
    if (busy || !window.confirm("سفارش لغو و موجودی کالاها آزاد شود؟ این کار قابل بازگشت نیست.")) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/orders/${encodeURIComponent(orderId)}/cancel`, {
        method: "POST",
        cache: "no-store",
      });
      const result: unknown = await response.json();
      if (!response.ok) {
        const message = typeof result === "object" && result !== null && "error" in result && typeof result.error === "string"
          ? result.error
          : "لغو سفارش انجام نشد.";
        throw new Error(message);
      }
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "ارتباط با سرور برقرار نشد.");
    } finally {
      setBusy(false);
    }
  }

  return <div className="mt-5">
    <button type="button" disabled={busy} onClick={() => void cancelOrder()} className="min-h-11 rounded-xl border border-rose-200 bg-white px-5 font-bold text-rose-700 hover:bg-rose-50 disabled:opacity-50">
      {busy ? "در حال لغو…" : "لغو سفارش پرداخت‌نشده"}
    </button>
    {error && <p role="alert" className="mt-3 text-sm font-bold text-rose-700">{error}</p>}
  </div>;
}
