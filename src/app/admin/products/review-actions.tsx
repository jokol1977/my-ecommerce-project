"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function ProductReviewActions({ productId, approvalDisabledReason }: { productId: string; approvalDisabledReason?: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [reviewNote, setReviewNote] = useState("");
  const router = useRouter();
  async function review(action: "approve" | "reject") {
    if (busy) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/admin/products/${encodeURIComponent(productId)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...(action === "reject" ? { reviewNote } : {}) }), cache: "no-store" });
      const result: unknown = await response.json();
      if (!response.ok) {
        const message = typeof result === "object" && result !== null && "error" in result && typeof result.error === "string" ? result.error : "بررسی کالا انجام نشد.";
        throw new Error(message);
      }
      router.refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "بررسی کالا انجام نشد."); }
    finally { setBusy(false); }
  }
  return <div className="mt-4"><label className="block text-sm font-bold text-slate-700">دلیل رد (برای راهنمایی فروشنده)<textarea value={reviewNote} onChange={(event) => setReviewNote(event.target.value)} maxLength={500} rows={2} className="mt-2 w-full rounded-xl border border-slate-200 p-3 font-normal" /></label>{approvalDisabledReason && <p role="status" className="mt-3 text-sm font-bold text-amber-800">{approvalDisabledReason}</p>}<div className="mt-3 flex flex-wrap gap-3"><button type="button" disabled={busy || Boolean(approvalDisabledReason)} onClick={() => review("approve")} className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">تأیید و انتشار</button><button type="button" disabled={busy || reviewNote.trim().length < 5} onClick={() => review("reject")} className="rounded-lg bg-rose-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">رد با ذکر دلیل</button></div>{error && <p role="alert" className="mt-3 text-sm font-bold text-rose-700">{error}</p>}</div>;
}
