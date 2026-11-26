"use client";

import Link from "next/link";

export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <html lang="fa" dir="rtl">
      <head>
        <title>خطا | جانان‌کده</title>
      </head>
      <body style={{ margin: 0, background: "#f7f5ef", color: "#203329", fontFamily: "sans-serif" }}>
        <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: "24px" }}>
          <section style={{ boxSizing: "border-box", width: "100%", maxWidth: "480px", padding: "36px", border: "1px solid #e6e2d8", borderRadius: "24px", background: "#fff", textAlign: "center" }}>
            <h1 style={{ fontSize: "24px" }}>سایت موقتاً با مشکل روبه‌رو شد</h1>
            <p style={{ color: "#66736a", lineHeight: 2 }}>جزئیات فنی برای حفظ امنیت نمایش داده نمی‌شود. دوباره تلاش کنید یا صفحه را تازه کنید.</p>
            {error.digest ? <p style={{ color: "#66736a", fontSize: "12px" }}>شناسهٔ پیگیری: {error.digest}</p> : null}
            <button onClick={retry} style={{ minHeight: "48px", margin: "12px", padding: "0 24px", border: 0, borderRadius: "12px", background: "#233c31", color: "#fff", font: "inherit", fontWeight: 700, cursor: "pointer" }}>
              تلاش دوباره
            </button>
            <Link href="/" style={{ color: "#355747", fontWeight: 700 }}>صفحهٔ اصلی</Link>
          </section>
        </main>
      </body>
    </html>
  );
}
