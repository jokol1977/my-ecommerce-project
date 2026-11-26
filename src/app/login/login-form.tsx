"use client";

import { signIn } from "next-auth/react";
import { FormEvent, useState } from "react";

export default function LoginForm() {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [totp, setTotp] = useState("");
  const [recoveryCode, setRecoveryCode] = useState("");
  const [bootstrapSecret, setBootstrapSecret] = useState("");
  const [codeRequested, setCodeRequested] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function requestCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/auth/request-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const result = await response.json() as { message?: string };
      setMessage(result.message ?? "پاسخی از سرویس ورود دریافت نشد.");
      setCodeRequested(response.status === 202 || response.status === 429);
    } catch {
      setMessage("ارسال درخواست ممکن نشد. دوباره تلاش کنید.");
    } finally {
      setBusy(false);
    }
  }

  async function verifyCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const result = await signIn("email-otp", {
        email,
        code,
        totp,
        recoveryCode,
        bootstrapSecret,
        redirect: false,
        redirectTo: "/auth/continue",
      });
      if (result?.error || !result?.url) {
        setMessage("کد یا عامل دوم معتبر نیست، یا مهلت آن تمام شده است.");
        return;
      }
      window.location.assign(result.url);
    } catch {
      setMessage("ورود موقتاً ممکن نیست. کمی بعد دوباره تلاش کنید.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-7 space-y-5 text-right">
      <form onSubmit={requestCode} className="space-y-3">
        <label className="block text-sm font-bold text-slate-700" htmlFor="login-email">ایمیل</label>
        <input
          id="login-email"
          type="email"
          autoComplete="email"
          dir="ltr"
          required
          maxLength={320}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="min-h-12 w-full rounded-xl border border-slate-300 px-4 text-left outline-none focus:border-blue-600"
        />
        <button
          type="submit"
          disabled={busy}
          className="min-h-12 w-full rounded-xl bg-blue-700 px-5 font-bold text-white disabled:opacity-60"
        >
          {busy ? "در حال ارسال…" : "ارسال کد ورود"}
        </button>
      </form>

      {codeRequested && (
        <form onSubmit={verifyCode} className="space-y-3 border-t border-slate-100 pt-5">
          <label className="block text-sm font-bold text-slate-700" htmlFor="login-code">کد شش‌رقمی ایمیل</label>
          <input
            id="login-code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            dir="ltr"
            required
            pattern="[0-9]{6}"
            maxLength={6}
            value={code}
            onChange={(event) => setCode(event.target.value)}
            className="min-h-12 w-full rounded-xl border border-slate-300 px-4 text-left tracking-[0.35em] outline-none focus:border-blue-600"
          />
          <label className="block text-sm font-bold text-slate-700" htmlFor="login-totp">کد برنامهٔ احراز هویت مدیر</label>
          <input
            id="login-totp"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            dir="ltr"
            pattern="[0-9]{6}"
            maxLength={6}
            value={totp}
            onChange={(event) => setTotp(event.target.value)}
            className="min-h-12 w-full rounded-xl border border-slate-300 px-4 text-left tracking-[0.35em] outline-none focus:border-blue-600"
          />
          <label className="block text-sm font-bold text-slate-700" htmlFor="login-recovery">یا کد بازیابی یک‌بارمصرف مدیر</label>
          <input
            id="login-recovery"
            type="text"
            autoComplete="off"
            dir="ltr"
            maxLength={24}
            value={recoveryCode}
            onChange={(event) => setRecoveryCode(event.target.value)}
            className="min-h-12 w-full rounded-xl border border-slate-300 px-4 text-left tracking-wider outline-none focus:border-blue-600"
          />
          <label className="block text-sm font-bold text-slate-700" htmlFor="admin-enrollment-secret">رمز راه‌اندازی اولیهٔ عامل دوم مدیر</label>
          <input
            id="admin-enrollment-secret"
            type="password"
            autoComplete="off"
            dir="ltr"
            value={bootstrapSecret}
            onChange={(event) => setBootstrapSecret(event.target.value)}
            className="min-h-12 w-full rounded-xl border border-slate-300 px-4 text-left outline-none focus:border-blue-600"
          />
          <p className="text-xs leading-6 text-slate-500">
            در ورود مدیر، یکی از کد برنامه، کد بازیابی یا رمز راه‌اندازی لازم است. مشتریان این بخش‌ها را خالی بگذارند.
          </p>
          <button
            type="submit"
            disabled={busy}
            className="min-h-12 w-full rounded-xl bg-slate-900 px-5 font-bold text-white disabled:opacity-60"
          >
            {busy ? "در حال بررسی…" : "ورود"}
          </button>
        </form>
      )}

      {message && <p role="status" aria-live="polite" className="rounded-xl bg-slate-50 p-3 text-sm leading-6 text-slate-700">{message}</p>}
    </div>
  );
}
