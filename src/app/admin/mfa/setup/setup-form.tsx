"use client";

import { signOut } from "next-auth/react";
import { useState, type FormEvent } from "react";

type SetupResponse = {
  ok?: boolean;
  message?: string;
  secret?: string;
  provisioningUri?: string;
  recoveryCodes?: string[];
};

export default function AdminMfaSetupForm() {
  const [secret, setSecret] = useState("");
  const [provisioningUri, setProvisioningUri] = useState("");
  const [code, setCode] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function post(body: { action: "start" } | { action: "confirm"; code: string }) {
    const response = await fetch("/api/auth/admin-mfa", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = await response.json() as SetupResponse;
    if (!response.ok || !payload.ok) throw new Error(payload.message ?? "درخواست انجام نشد.");
    return payload;
  }

  async function beginSetup() {
    setBusy(true);
    setMessage("");
    try {
      const result = await post({ action: "start" });
      setSecret(result.secret ?? "");
      setProvisioningUri(result.provisioningUri ?? "");
      setMessage("این کلید را در برنامهٔ احراز هویت اضافه کنید. مهلت تأیید ۱۰ دقیقه است.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "راه‌اندازی شروع نشد.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmSetup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const result = await post({ action: "confirm", code });
      setRecoveryCodes(result.recoveryCodes ?? []);
      setMessage("عامل دوم فعال شد. کدهای بازیابی فقط همین بار نمایش داده می‌شوند.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "کد تأیید نشد.");
    } finally {
      setBusy(false);
    }
  }

  async function copyRecoveryCodes() {
    try {
      await navigator.clipboard.writeText(recoveryCodes.join("\n"));
      setMessage("کدهای بازیابی کپی شدند؛ آن‌ها را در محل امن و آفلاین نگه دارید.");
    } catch {
      setMessage("کپی خودکار ممکن نیست؛ کدها را دستی در محل امن و آفلاین نگه دارید.");
    }
  }

  return (
    <div className="mt-7 space-y-5">
      {!secret && recoveryCodes.length === 0 && (
        <button
          type="button"
          disabled={busy}
          onClick={beginSetup}
          className="min-h-12 w-full rounded-xl bg-blue-700 px-5 font-bold text-white disabled:opacity-60"
        >
          {busy ? "در حال آماده‌سازی…" : "ساخت کلید عامل دوم"}
        </button>
      )}

      {secret && recoveryCodes.length === 0 && (
        <>
          <div className="space-y-3 rounded-xl bg-slate-50 p-4 text-sm leading-7">
            <p>در برنامهٔ احراز هویت، کلید زیر را دستی وارد کنید:</p>
            <code dir="ltr" className="block break-all rounded-lg bg-white p-3 text-left font-mono">{secret}</code>
            <details>
              <summary className="cursor-pointer font-bold">نمایش نشانی سازگاری برنامهٔ احراز هویت</summary>
              <code dir="ltr" className="mt-2 block break-all rounded-lg bg-white p-3 text-left font-mono">{provisioningUri}</code>
            </details>
          </div>
          <form onSubmit={confirmSetup} className="space-y-3">
            <label htmlFor="admin-totp-confirm" className="block text-sm font-bold">کد شش‌رقمی برنامه</label>
            <input
              id="admin-totp-confirm"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              dir="ltr"
              pattern="[0-9]{6}"
              maxLength={6}
              required
              value={code}
              onChange={(event) => setCode(event.target.value)}
              className="min-h-12 w-full rounded-xl border border-slate-300 px-4 text-left tracking-[0.35em]"
            />
            <button
              type="submit"
              disabled={busy}
              className="min-h-12 w-full rounded-xl bg-slate-900 px-5 font-bold text-white disabled:opacity-60"
            >
              {busy ? "در حال تأیید…" : "تأیید و فعال‌سازی"}
            </button>
          </form>
        </>
      )}

      {recoveryCodes.length > 0 && (
        <div className="space-y-4 rounded-xl border border-amber-300 bg-amber-50 p-4">
          <p className="text-sm font-bold leading-7 text-amber-950">
            هر کد فقط یک‌بار استفاده می‌شود. کدها را همین حالا آفلاین ذخیره کنید؛ بعد از بستن این صفحه دوباره نمایش داده نمی‌شوند.
          </p>
          <pre dir="ltr" className="grid grid-cols-2 gap-2 whitespace-pre-wrap rounded-lg bg-white p-3 text-center font-mono text-sm">
            {recoveryCodes.join("\n")}
          </pre>
          <button type="button" onClick={copyRecoveryCodes} className="min-h-11 w-full rounded-xl border border-amber-400 px-4 font-bold">
            کپی کدهای بازیابی
          </button>
          <p className="text-sm leading-7">
            پس از ذخیرهٔ کدها، رمز راه‌اندازی اولیه را از تنظیمات محیطی سرور حذف کنید و سپس از حساب خارج شوید.
          </p>
          <button
            type="button"
            onClick={() => void signOut({ redirectTo: "/login" })}
            className="min-h-12 w-full rounded-xl bg-slate-900 px-5 font-bold text-white"
          >
            ذخیره شد؛ خروج و ورود دوباره
          </button>
        </div>
      )}

      {message && <p role="status" aria-live="polite" className="rounded-xl bg-slate-100 p-3 text-sm leading-6">{message}</p>}
    </div>
  );
}
