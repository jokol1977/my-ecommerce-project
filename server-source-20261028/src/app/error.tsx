"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function ErrorPage({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error("A page failed to render.", { digest: error.digest });
  }, [error.digest]);

  return (
    <main dir="rtl" className="flex min-h-screen items-center justify-center bg-[#f7f5ef] px-4 py-12 text-[#203329]">
      <section className="w-full max-w-lg rounded-3xl border border-[#e6e2d8] bg-white p-7 text-center shadow-xl shadow-[#203329]/5 sm:p-10">
        <p className="mx-auto grid size-14 place-items-center rounded-2xl bg-[#f8e9e2] text-2xl font-black text-[#a84e32]" aria-hidden="true">!</p>
        <h1 className="mt-5 text-2xl font-black">بارگذاری این صفحه با مشکل روبه‌رو شد</h1>
        <p className="mt-3 leading-8 text-[#66736a]">
          اطلاعات فنی خطا نمایش داده نمی‌شود. می‌توانید دوباره تلاش کنید یا به صفحهٔ اصلی برگردید.
        </p>
        <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
          <button onClick={retry} className="min-h-12 rounded-xl bg-[#233c31] px-6 font-bold text-white transition hover:bg-[#355747] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#cc6745]">
            تلاش دوباره
          </button>
          <Link href="/" className="grid min-h-12 place-items-center rounded-xl border border-[#d9dfd8] px-6 font-bold text-[#355747] transition hover:bg-[#f3f5f1] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#cc6745]">
            بازگشت به صفحهٔ اصلی
          </Link>
        </div>
      </section>
    </main>
  );
}
