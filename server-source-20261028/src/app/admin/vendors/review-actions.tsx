"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function ReviewActions({ vendorId, canApprove }: { vendorId: string; canApprove: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function review(action: "approve" | "reject") {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/vendors/${encodeURIComponent(vendorId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
        cache: "no-store",
      });
      const result: unknown = await response.json();
      if (!response.ok) {
        const message = typeof result === "object" && result !== null && "error" in result && typeof result.error === "string"
          ? result.error
          : "بررسی درخواست انجام نشد.";
        throw new Error(message);
      }
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "بررسی درخواست انجام نشد.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4">
      <div className="flex flex-wrap gap-3">
        <button type="button" disabled={busy || !canApprove} onClick={() => review("approve")} className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">تأیید فروشگاه</button>
        <button type="button" disabled={busy} onClick={() => review("reject")} className="rounded-lg bg-rose-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">رد درخواست</button>
      </div>
      {error && <p role="alert" className="mt-3 text-sm font-bold text-rose-700">{error}</p>}
    </div>
  );
}
