"use client";

import { useState, type FormEvent } from "react";

type VendorAgreement = {
  version: string;
  documentSha256: string;
  href: string;
};

export default function VendorApplicationForm({ agreement }: { agreement: VendorAgreement }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const values = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);

    try {
      const response = await fetch("/api/vendor/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storeName: values.get("storeName"),
          slug: values.get("slug"),
          description: values.get("description"),
          agreementAccepted: values.get("agreementAccepted") === "on",
          agreementVersion: agreement.version,
          agreementSha256: agreement.documentSha256,
        }),
        cache: "no-store",
      });
      const result: unknown = await response.json();
      if (!response.ok) {
        const message = typeof result === "object" && result !== null && "error" in result && result.error === "RATE_LIMITED"
          ? "تعداد درخواست‌ها بیش از حد مجاز است. لطفاً بعداً دوباره تلاش کنید."
          : typeof result === "object" && result !== null && "error" in result && typeof result.error === "string"
            ? result.error
            : "ثبت درخواست انجام نشد.";
        throw new Error(message);
      }
      setSubmitted(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "ثبت درخواست انجام نشد.");
    } finally {
      setBusy(false);
    }
  }

  if (submitted) {
    return <p role="status" className="rounded-2xl bg-emerald-50 p-5 font-bold leading-8 text-emerald-900">درخواست فروشندگی ثبت شد و در انتظار بررسی مدیر است. تا تأیید فروشگاه، امکان انتشار کالا فعال نمی‌شود.</p>;
  }

  return (
    <form onSubmit={submit} className="mt-7 space-y-5">
      <label className="block text-sm font-bold text-slate-700">
        نام فروشگاه
        <input name="storeName" required minLength={2} maxLength={80} autoComplete="organization" className="mt-2 min-h-12 w-full rounded-xl border border-slate-300 px-4 font-normal outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100" />
      </label>
      <label className="block text-sm font-bold text-slate-700">
        نشانی کوتاه فروشگاه (اختیاری)
        <input name="slug" minLength={3} maxLength={50} pattern="[a-zA-Z0-9]+(-[a-zA-Z0-9]+)*" dir="ltr" placeholder="مثال: my-store" className="mt-2 min-h-12 w-full rounded-xl border border-slate-300 px-4 text-left font-normal outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100" />
        <span className="mt-1 block text-xs font-normal text-slate-500">فقط حروف انگلیسی، عدد و خط تیره؛ اگر خالی بماند، نشانی یکتا ساخته می‌شود.</span>
      </label>
      <label className="block text-sm font-bold text-slate-700">
        معرفی فروشگاه و کالاهایی که عرضه می‌کنید
        <textarea name="description" required minLength={20} maxLength={1000} rows={5} className="mt-2 w-full rounded-xl border border-slate-300 p-4 font-normal leading-7 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100" />
      </label>
      <label className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm leading-7 text-slate-700">
        <input name="agreementAccepted" type="checkbox" required className="mt-1 size-4 shrink-0 accent-blue-700" />
        <span>
          متن <a href={agreement.href} target="_blank" rel="noopener noreferrer" className="font-black text-blue-700 underline">قرارداد همکاری فروشندگان، نسخهٔ {agreement.version}</a> را مطالعه کرده‌ام و با ثبت درخواست، پذیرش همین نسخه را اعلام می‌کنم.
        </span>
      </label>
      {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm font-bold text-rose-800">{error}</p>}
      <button type="submit" disabled={busy} className="min-h-12 w-full rounded-xl bg-blue-700 px-5 py-3 font-black text-white transition hover:bg-blue-800 disabled:cursor-wait disabled:opacity-60">
        {busy ? "در حال ثبت درخواست…" : "ارسال برای بررسی"}
      </button>
      <p className="text-xs leading-6 text-slate-500">در این فرم اطلاعات بانکی درخواست نمی‌شود. وضعیت فروشگاه پس از بررسی مدیر تغییر می‌کند.</p>
    </form>
  );
}
