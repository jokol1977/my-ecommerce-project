import Link from "next/link";

const adminLinks = [
  { href: "/admin", label: "نمای کلی" },
  { href: "/admin/orders", label: "سفارش‌ها" },
  { href: "/admin/finance", label: "دفتر پرداخت‌ها" },
  { href: "/admin/support", label: "درخواست‌های پشتیبانی" },
  { href: "/admin/vendors", label: "فروشندگان" },
  { href: "/admin/products", label: "بررسی کالاها" },
  { href: "/admin/reviews", label: "دیدگاه‌ها" },
  { href: "/admin/categories", label: "دسته‌بندی‌ها" },
  { href: "/admin/audit", label: "گزارش فعالیت" },
  { href: "/admin/readiness", label: "آمادگی انتشار" },
];

export default function AdminNavigation() {
  return (
    <nav aria-label="دسترسی‌های مدیریت" className="mb-7 flex flex-wrap gap-2">
      {adminLinks.map(({ href, label }) => (
        <Link
          key={href}
          href={href}
          className="rounded-full border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-800"
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
