"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function DeliveryConfirmation({ orderId, vendorOrderId }: { orderId: string; vendorOrderId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function confirmDelivery() {
    if (busy || !window.confirm("تأیید می‌کنید که کالاهای این فروشگاه را تحویل گرفته‌اید؟")) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/orders/${encodeURIComponent(orderId)}/vendor-orders/${encodeURIComponent(vendorOrderId)}/delivery`, {
        method: "POST",
        cache: "no-store",
      });
      const result: unknown = await response.json();
      if (!response.ok) {
        const message = typeof result === "object" && result !== null && "error" in result && typeof result.error === "string"
          ? result.error
          : "تأیید دریافت سفارش انجام نشد.";
        throw new Error(message);
      }
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "ارتباط با سرور برقرار نشد.");
    } finally {
      setBusy(false);
    }
  }

  return <div className="mt-4">
    <button type="button" disabled={busy} onClick={() => void confirmDelivery()} className="min-h-11 rounded-xl bg-emerald-700 px-5 font-bold text-white hover:bg-emerald-800 disabled:opacity-50">
      {busy ? "در حال ثبت…" : "کالا را تحویل گرفتم"}
    </button>
    {error && <p role="alert" className="mt-3 text-sm font-bold text-rose-700">{error}</p>}
    <p className="mt-2 text-xs leading-6 text-slate-500">با تأیید دریافت، امکان ثبت دیدگاه برای کالاهای این بخش از سفارش فعال می‌شود.</p>
  </div>;
}
