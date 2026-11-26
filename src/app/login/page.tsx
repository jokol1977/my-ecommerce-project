import type { Metadata } from "next";
import Link from "next/link";
import { isEmailLoginEnabled } from "@/lib/auth-config";
import LoginForm from "./login-form";

export const metadata: Metadata = { title: "ورود | جانان‌کده" };
export const dynamic = "force-dynamic";

export default function LoginPage() {
  const loginEnabled = isEmailLoginEnabled();

  return (
    <main dir="rtl" className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10">
      <section className="w-full max-w-lg rounded-3xl border border-slate-100 bg-white p-8 shadow-sm sm:p-10">
        <h1 className="text-center text-2xl font-black text-slate-900">ورود به جانان‌کده</h1>
        <p className="mt-4 text-center leading-8 text-slate-600">
          برای ورود، کد یک‌بارمصرف را از ایمیل دریافت کنید.
        </p>
        {loginEnabled ? (
          <LoginForm />
        ) : (
          <p className="mt-7 rounded-xl bg-amber-50 p-4 text-center leading-7 text-amber-900">
            ورود در این محیط هنوز پیکربندی نشده است.
          </p>
        )}
        <Link
          href="/"
          className="mt-7 inline-flex min-h-12 w-full items-center justify-center rounded-xl border border-slate-200 px-6 font-bold text-slate-700 transition hover:bg-slate-50"
        >
          بازگشت به فروشگاه
        </Link>
      </section>
    </main>
  );
}
