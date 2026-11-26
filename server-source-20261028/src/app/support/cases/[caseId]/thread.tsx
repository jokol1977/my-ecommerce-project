"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { SupportCaseStatusValue } from "@/lib/support-cases";
import { SUPPORT_CASE_STATUSES } from "@/lib/support-cases";
import { SUPPORT_CASE_STATUS_LABELS } from "@/lib/support-case-labels";

type ViewerRole = "CUSTOMER" | "VENDOR" | "ADMIN";
type ThreadMessage = { id: string; authorRole: ViewerRole; body: string; createdAtLabel: string };

export default function SupportCaseThread({
  caseId,
  viewerRole,
  status,
  messages,
  hasOlderMessages,
}: {
  caseId: string;
  viewerRole: ViewerRole;
  status: SupportCaseStatusValue;
  messages: ThreadMessage[];
  hasOlderMessages: boolean;
}) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();
  const canReply = viewerRole !== "VENDOR" || status !== "RESOLVED";
  const authorLabels: Record<ViewerRole, string> = { CUSTOMER: "خریدار", VENDOR: "فروشگاه", ADMIN: "مدیریت پلتفرم" };

  async function submitMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/support/cases/${encodeURIComponent(caseId)}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
        cache: "no-store",
      });
      const result: unknown = await response.json();
      if (!response.ok) {
        const detail = typeof result === "object" && result !== null && "error" in result && typeof result.error === "string" ? result.error : "ارسال پیام انجام نشد.";
        throw new Error(detail);
      }
      setMessage("");
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "ارسال پیام انجام نشد.");
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(nextStatus: SupportCaseStatusValue) {
    if (busy || nextStatus === status) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/support/cases/${encodeURIComponent(caseId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
        cache: "no-store",
      });
      const result: unknown = await response.json();
      if (!response.ok) {
        const detail = typeof result === "object" && result !== null && "error" in result && typeof result.error === "string" ? result.error : "به‌روزرسانی وضعیت انجام نشد.";
        throw new Error(detail);
      }
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "به‌روزرسانی وضعیت انجام نشد.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <section aria-labelledby="case-messages-heading" className="mt-6 rounded-2xl border border-slate-100 bg-white p-5 shadow-sm sm:p-7">
        <h2 id="case-messages-heading" className="text-lg font-black text-slate-900">گفتگوی پرونده</h2>
        {hasOlderMessages && <p className="mt-2 text-xs leading-6 text-slate-500">برای سبک‌ماندن صفحه، فقط ۱۰۰ پیام آخر نمایش داده می‌شود.</p>}
        <ol className="mt-5 space-y-3">
          {messages.map((entry) => (
            <li key={entry.id} className={`rounded-2xl p-4 ${entry.authorRole === viewerRole ? "bg-blue-50" : "bg-slate-50"}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-black text-slate-800">{authorLabels[entry.authorRole]}</p>
                <time className="text-xs text-slate-500">{entry.createdAtLabel}</time>
              </div>
              <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-7 text-slate-700">{entry.body}</p>
            </li>
          ))}
        </ol>
      </section>

      {viewerRole === "ADMIN" && <section aria-labelledby="case-status-heading" className="mt-5 rounded-2xl border border-indigo-100 bg-indigo-50/60 p-5">
        <h2 id="case-status-heading" className="font-black text-slate-900">اقدام مدیریتی</h2>
        <p className="mt-1 text-sm leading-6 text-slate-600">تغییر وضعیت همراه با حساب مدیر در گزارش فعالیت ثبت می‌شود.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {SUPPORT_CASE_STATUSES.map((value) => <button key={value} type="button" disabled={busy || value === status} onClick={() => void setStatus(value)} className="min-h-10 rounded-lg border border-indigo-200 bg-white px-3 text-sm font-bold text-indigo-900 hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-50">{SUPPORT_CASE_STATUS_LABELS[value]}</button>)}
        </div>
      </section>}

      {canReply ? <form onSubmit={(event) => void submitMessage(event)} className="mt-5 rounded-2xl border border-slate-100 bg-white p-5 shadow-sm sm:p-7">
        <label htmlFor="support-case-message" className="font-black text-slate-900">پاسخ شما</label>
        <p className="mt-1 text-sm leading-6 text-slate-600">پیام‌ها در پرونده ثبت می‌شوند و پس از ارسال قابل ویرایش یا حذف نیستند. اطلاعات بانکی و رمزها را ننویسید.</p>
        <textarea id="support-case-message" required minLength={10} maxLength={2000} rows={5} value={message} onChange={(event) => setMessage(event.target.value)} className="mt-3 w-full rounded-xl border border-slate-300 p-3 leading-7" placeholder="پاسخ خود را بنویسید…" />
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <span className="text-xs text-slate-500">{message.length.toLocaleString("fa-IR")} / ۲۰۰۰ نویسه</span>
          <button type="submit" disabled={busy || message.trim().length < 10} className="min-h-11 rounded-xl bg-blue-700 px-5 font-bold text-white hover:bg-blue-800 disabled:opacity-50">{busy ? "در حال ثبت…" : "ارسال پاسخ"}</button>
        </div>
        {error && <p role="alert" className="mt-3 text-sm font-bold text-rose-700">{error}</p>}
      </form> : <p className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm leading-7 text-emerald-900">این پرونده حل‌شده است. اگر مشکل ادامه دارد، مشتری با ارسال پاسخ تازه می‌تواند آن را دوباره باز کند.</p>}
    </>
  );
}
