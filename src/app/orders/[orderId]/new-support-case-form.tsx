"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { SUPPORT_CASE_CATEGORIES, type SupportCaseCategoryValue } from "@/lib/support-cases";
import { SUPPORT_CASE_CATEGORY_LABELS } from "@/lib/support-case-labels";

export default function NewSupportCaseForm({ vendorOrderId }: { vendorOrderId: string }) {
  const [category, setCategory] = useState<SupportCaseCategoryValue>("DELIVERY");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/support/cases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vendorOrderId, category, message }),
        cache: "no-store",
      });
      const result: unknown = await response.json();
      if (!response.ok) {
        const detail = typeof result === "object" && result !== null && "error" in result && typeof result.error === "string"
          ? result.error
          : "ثبت درخواست انجام نشد.";
        throw new Error(detail);
      }
      if (typeof result !== "object" || result === null || !("id" in result) || typeof result.id !== "string") throw new Error("پاسخ سامانه معتبر نیست.");
      router.push(`/support/cases/${encodeURIComponent(result.id)}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "ثبت درخواست انجام نشد.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(event) => void submit(event)} className="mt-5 rounded-2xl border border-blue-100 bg-blue-50/50 p-4 sm:p-5">
      <h3 className="font-black text-slate-900">ثبت درخواست پشتیبانی برای این فروشگاه</h3>
      <p className="mt-1 text-sm leading-6 text-slate-600">موضوع را انتخاب کنید و شرح کوتاهی بنویسید. ثبت درخواست به‌تنهایی پرداخت یا بازپرداخت انجام نمی‌دهد. اطلاعات بانکی یا رمزها را در پیام وارد نکنید.</p>
      <label className="mt-4 block text-sm font-bold text-slate-700">موضوع
        <select value={category} onChange={(event) => setCategory(event.target.value as SupportCaseCategoryValue)} className="mt-2 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3">
          {SUPPORT_CASE_CATEGORIES.map((value) => <option key={value} value={value}>{SUPPORT_CASE_CATEGORY_LABELS[value]}</option>)}
        </select>
      </label>
      <label className="mt-3 block text-sm font-bold text-slate-700">شرح درخواست
        <textarea required minLength={10} maxLength={2000} rows={4} value={message} onChange={(event) => setMessage(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 bg-white p-3 font-normal leading-7" placeholder="مشکل سفارش را بدون اطلاعات حساس توضیح دهید." />
      </label>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <span className="text-xs text-slate-500">{message.length.toLocaleString("fa-IR")} / ۲۰۰۰ نویسه</span>
        <button type="submit" disabled={busy || message.trim().length < 10} className="min-h-11 rounded-xl bg-blue-700 px-5 font-bold text-white hover:bg-blue-800 disabled:opacity-50">{busy ? "در حال ثبت…" : "ثبت و پیگیری درخواست"}</button>
      </div>
      {error && <p role="alert" className="mt-3 text-sm font-bold text-rose-700">{error}</p>}
    </form>
  );
}
