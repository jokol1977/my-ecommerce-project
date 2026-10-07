"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function ReviewForm({ productId }: { productId: string }) {
  const router = useRouter();
  const [rating, setRating] = useState("5");
  const [body, setBody] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/product-reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, rating: Number(rating), body }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error === "RATE_LIMITED" ? "تعداد ثبت دیدگاه بیش از حد مجاز است. لطفاً بعداً دوباره تلاش کنید." : typeof result.error === "string" ? result.error : "ثبت دیدگاه انجام نشد.");
      setBody("");
      setError("دیدگاه شما برای بررسی مدیر ثبت شد.");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "ارتباط با سرور برقرار نشد.");
    } finally {
      setBusy(false);
    }
  }

  return <form onSubmit={submit} className="mt-5 space-y-4 rounded-2xl bg-slate-50 p-5">
    <label className="block text-sm font-bold text-slate-700" htmlFor="review-rating">امتیاز شما</label>
    <select id="review-rating" value={rating} onChange={(event) => setRating(event.target.value)} className="min-h-11 rounded-xl border border-slate-300 bg-white px-3">
      {[5, 4, 3, 2, 1].map((value) => <option key={value} value={value}>{value} از ۵</option>)}
    </select>
    <label className="block text-sm font-bold text-slate-700" htmlFor="review-body">دیدگاه (۱۰ تا ۲۰۰۰ نویسه)</label>
    <textarea id="review-body" required minLength={10} maxLength={2000} value={body} onChange={(event) => setBody(event.target.value)} rows={4} className="w-full rounded-xl border border-slate-300 bg-white p-3 leading-7 outline-none focus:border-blue-600" />
    <button type="submit" disabled={busy} className="min-h-11 rounded-xl bg-blue-700 px-5 font-bold text-white hover:bg-blue-800 disabled:opacity-50">{busy ? "در حال ثبت…" : "ثبت دیدگاه برای بررسی"}</button>
    {error && <p role="status" className="text-sm font-bold text-slate-700">{error}</p>}
  </form>;
}
