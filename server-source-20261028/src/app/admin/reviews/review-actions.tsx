"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function ReviewActions({ reviewId }: { reviewId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function decide(action: "approve" | "reject") {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/product-reviews/${encodeURIComponent(reviewId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(typeof result.error === "string" ? result.error : "ثبت تصمیم انجام نشد.");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "ارتباط با سرور برقرار نشد.");
    } finally {
      setBusy(false);
    }
  }

  return <div className="mt-4 flex flex-wrap gap-3">
    <button type="button" disabled={busy} onClick={() => void decide("approve")} className="min-h-10 rounded-xl bg-emerald-700 px-4 text-sm font-bold text-white disabled:opacity-50">تأیید و انتشار</button>
    <button type="button" disabled={busy} onClick={() => void decide("reject")} className="min-h-10 rounded-xl bg-rose-700 px-4 text-sm font-bold text-white disabled:opacity-50">رد دیدگاه</button>
    {error && <p role="alert" className="w-full text-sm font-bold text-rose-700">{error}</p>}
  </div>;
}
