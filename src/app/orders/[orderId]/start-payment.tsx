"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type PaymentResponse = { status?: unknown; redirectUrl?: unknown; error?: unknown };

function allowedRedirect(value: unknown) {
  if (typeof value !== "string") return null;
  try {
    const target = new URL(value);
    if (target.protocol !== "https:") return null;
    if ((target.hostname === "www.zarinpal.com" || target.hostname === "sandbox.zarinpal.com") && target.pathname.startsWith("/pg/StartPay/")) {
      return target;
    }
    if (
      target.origin === window.location.origin &&
      target.pathname === "/api/payments/zarinpal/callback" &&
      /^[A-Za-z0-9]{16,80}$/.test(target.searchParams.get("Authority") ?? "")
    ) {
      return target;
    }
  } catch {
    return null;
  }
  return null;
}

export default function StartPayment({ orderId, hasPendingPayment }: { orderId: string; hasPendingPayment: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function beginPayment() {
    if (busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch(`/api/orders/${encodeURIComponent(orderId)}/payment`, {
        method: "POST",
        headers: { Accept: "application/json" },
        cache: "no-store",
      });
      const result: PaymentResponse = await response.json();
      if (response.status === 202 || result.status === "processing") {
        setMessage("درخواست پرداخت در حال بررسی است؛ چند لحظه دیگر وضعیت سفارش را تازه کنید.");
        return;
      }
      if (!response.ok) {
        throw new Error(typeof result.error === "string" ? result.error : "آماده‌سازی پرداخت انجام نشد.");
      }
      const target = allowedRedirect(result.redirectUrl);
      if (!target || (result.status !== "redirect" && result.status !== "verify")) {
        throw new Error("نشانی امن پرداخت از سرور دریافت نشد.");
      }
      window.location.assign(target.toString());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "ارتباط با درگاه برقرار نشد.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-5 rounded-2xl border border-blue-100 bg-blue-50 p-4">
      <p className="text-sm leading-7 text-blue-950">پرداخت این سفارش از طریق زرین‌پال انجام می‌شود. وضعیت نهایی فقط پس از تأیید سروری زرین‌پال ثبت خواهد شد.</p>
      {message && <p role="status" className="mt-3 text-sm font-bold text-amber-800">{message}</p>}
      {error && <p role="alert" className="mt-3 text-sm font-bold text-rose-700">{error}</p>}
      <button type="button" disabled={busy} onClick={() => void beginPayment()} className="mt-4 min-h-12 w-full rounded-xl bg-blue-700 px-5 py-3 font-black text-white transition hover:bg-blue-800 disabled:cursor-wait disabled:opacity-60">
        {busy ? "در حال اتصال امن به زرین‌پال…" : hasPendingPayment ? "ادامهٔ پرداخت با زرین‌پال" : "پرداخت با زرین‌پال"}
      </button>
      <button type="button" disabled={busy} onClick={() => router.refresh()} className="mt-3 w-full text-sm font-bold text-blue-800 hover:underline disabled:opacity-50">تازه‌کردن وضعیت سفارش</button>
    </div>
  );
}
