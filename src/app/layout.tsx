import type { Metadata } from "next";
import { Vazirmatn } from "next/font/google";
import { connection } from "next/server";
import "./globals.css";

const vazir = Vazirmatn({
  subsets: ["arabic"],
  weight: ["100", "300", "400", "500", "700", "900"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "جانان‌کده | بازارگاه آنلاین",
  description:
    "محصولات متنوع را از فروشندگان جانان‌کده پیدا و با خیال آسوده خریداری کنید.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  await connection();

  return (
    <html lang="fa" dir="rtl">
      <body className={vazir.className}>
        {children}
      </body>
    </html>
  );
}
