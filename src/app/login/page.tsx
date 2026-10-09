import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "ورود | جانان‌کده" };

export default function LoginPage() {
  return (
    <main dir="rtl" className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <section className="w-full max-w-lg rounded-3xl border border-slate-100 bg-white p-8 text-center shadow-sm sm:p-10">
        <h1 className="text-2xl font-black text-slate-900">ورود به جانان‌کده</h1>
        <p className="mt-4 leading-8 text-slate-600">
          در این انتشار، فقط کاتالوگ عمومی محصولات فعال است. ورود کاربران و پنل‌های وابسته موقتاً غیرفعال هستند.
        </p>
        <Link
          href="/"
          className="mt-7 inline-flex min-h-12 items-center justify-center rounded-xl bg-blue-700 px-6 font-bold text-white transition hover:bg-blue-800"
        >
          بازگشت به فروشگاه
        </Link>
      </section>
    </main>
  );
}
