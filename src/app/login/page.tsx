import type { Metadata } from "next";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { signIn } from "@/auth";
import { hasUsableAuthSecret, hasUsableEmailConfig } from "@/lib/auth-config";
import { checkEmailSignInRateLimit } from "@/lib/rate-limit";

export const metadata: Metadata = { title: "ورود | جانان‌کده" };

const authConfigured = Boolean(
  process.env.DATABASE_URL &&
  hasUsableAuthSecret() &&
  hasUsableEmailConfig(),
);

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await connection();
  const { error } = await searchParams;

  if (!authConfigured) {
    return (
      <main dir="rtl" className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <section className="max-w-lg rounded-3xl bg-white p-8 shadow-sm">
          <h1 className="text-2xl font-black">ورود به جانان‌کده</h1>
          <p className="mt-4 leading-8 text-slate-600">
            ورود ایمیلی هنوز پیکربندی نشده است. برای فعال‌سازی، تنظیمات پایگاه‌داده، کلید محرمانهٔ نشست و سرویس ایمیل را در فایل محلی .env وارد کنید.
          </p>
        </section>
      </main>
    );
  }

  async function requestSignIn(formData: FormData) {
    "use server";
    const email = String(formData.get("email") ?? "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return;
    const rateLimit = await checkEmailSignInRateLimit(email);
    if (!rateLimit.allowed) redirect("/login?error=rate-limited");
    await signIn("nodemailer", { email, redirectTo: "/" });
  }

  return (
    <main dir="rtl" className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <section className="w-full max-w-md rounded-3xl border border-slate-100 bg-white p-7 shadow-sm sm:p-9">
        <h1 className="text-2xl font-black text-slate-900">ورود به جانان‌کده</h1>
        <p className="mt-3 text-sm leading-7 text-slate-600">نشانی ایمیل را وارد کنید تا پیوند یک‌بارمصرف ورود برایتان ارسال شود.</p>
        {error === "rate-limited" && <p role="alert" className="mt-4 rounded-xl bg-amber-50 p-3 text-sm leading-7 text-amber-900">درخواست‌های ورود برای این نشانی زیاد بوده است. لطفاً ۱۵ دقیقه دیگر دوباره تلاش کنید.</p>}
        <form action={requestSignIn} className="mt-7 space-y-4">
          <label htmlFor="email" className="block text-sm font-bold text-slate-700">ایمیل</label>
          <input id="email" name="email" type="email" autoComplete="email" required maxLength={254} className="min-h-12 w-full rounded-xl border border-slate-300 px-4 text-left outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100" dir="ltr" />
          <button type="submit" className="min-h-12 w-full rounded-xl bg-blue-700 px-4 font-black text-white transition hover:bg-blue-800">ارسال پیوند ورود</button>
        </form>
      </section>
    </main>
  );
}
