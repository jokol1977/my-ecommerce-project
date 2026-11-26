import Link from "next/link";

const adminGroups = [
  {
    label: "نمای کلی",
    links: [{ href: "/admin", label: "مرکز مدیریت", icon: "⌂" }],
  },
  {
    label: "بازارگاه",
    links: [
      { href: "/admin/vendors", label: "فروشندگان", icon: "♙" },
      { href: "/admin/products", label: "کالاها", icon: "▣" },
      { href: "/admin/categories", label: "دسته‌بندی‌ها", icon: "▦" },
      { href: "/admin/reviews", label: "دیدگاه‌ها", icon: "◉" },
    ],
  },
  {
    label: "سفارش و پشتیبانی",
    links: [
      { href: "/admin/orders", label: "سفارش‌ها", icon: "↗" },
      { href: "/admin/finance", label: "دفتر پرداخت‌ها", icon: "◫" },
      { href: "/admin/support", label: "پشتیبانی", icon: "؟" },
    ],
  },
  {
    label: "گزارش و تنظیم",
    links: [
      { href: "/admin/audit", label: "گزارش فعالیت", icon: "◷" },
      { href: "/admin/readiness", label: "آمادگی انتشار", icon: "⚙" },
    ],
  },
];

export default function AdminNavigation({ dashboard = false }: { dashboard?: boolean }) {
  if (dashboard) {
    return (
      <nav dir="rtl" aria-label="دسترسی‌های مدیریت" className="admin-dashboard-rail">
        <Link href="/admin" className="admin-dashboard-rail-brand">
          <span aria-hidden="true" className="admin-dashboard-rail-mark">ج</span>
          <span>
            <strong>جانان‌کده</strong>
            <small>مرکز مدیریت</small>
          </span>
        </Link>

        <div className="admin-dashboard-rail-groups">
          {adminGroups.map((group) => (
            <section key={group.label} aria-label={group.label} className="admin-dashboard-rail-group">
              <h2>{group.label}</h2>
              <ul>
                {group.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      aria-current={link.href === "/admin" ? "page" : undefined}
                      className={link.href === "/admin" ? "admin-dashboard-rail-link is-current" : "admin-dashboard-rail-link"}
                    >
                      <span aria-hidden="true" className="admin-dashboard-rail-icon">{link.icon}</span>
                      <span>{link.label}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        <Link href="/" className="admin-dashboard-rail-store">
          <span aria-hidden="true">↙</span>
          بازدید از فروشگاه
        </Link>
      </nav>
    );
  }

  return (
    <nav
      aria-label="دسترسی‌های مدیریت"
      className="mb-6 overflow-hidden rounded-[1.65rem] border border-[#e7dfd0] bg-[#fffefa] shadow-[0_14px_38px_rgba(52,64,48,0.06)]"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#eee8dc] px-4 py-3 sm:px-5">
        <Link href="/admin" className="flex items-center gap-3 rounded-xl focus-visible:outline-[#cc6745]">
          <span
            aria-hidden="true"
            className="grid h-10 w-10 place-items-center rounded-[0.9rem] bg-[#233c31] text-lg font-black text-[#fff8eb] shadow-sm"
          >
            ج
          </span>
          <span className="leading-tight">
            <span className="block text-sm font-black text-[#26372d]">جانان‌کده</span>
            <span className="mt-1 block text-[11px] font-bold text-[#948876]">فضای مدیریت</span>
          </span>
        </Link>

        <Link
          href="/"
          className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-[#d8e2d9] bg-[#f3f7f1] px-3.5 text-xs font-black text-[#315343] transition hover:border-[#a9c0ac] hover:bg-[#e9f1e7] sm:text-sm"
        >
          بازدید از فروشگاه <span aria-hidden="true">←</span>
        </Link>
      </div>

      <div className="grid gap-x-4 gap-y-3 px-4 py-4 sm:grid-cols-2 sm:px-5 lg:grid-cols-4">
        {adminGroups.map((group, index) => (
          <section
            key={group.label}
            aria-label={group.label}
            className={index > 0 ? "min-w-0 border-t border-[#eee8dc] pt-3 sm:border-t-0 sm:pt-0 lg:border-e lg:pe-4" : "min-w-0"}
          >
            <h2 className="mb-2 text-[10px] font-black tracking-wide text-[#9a8c78]">
              {group.label}
            </h2>
            <ul className="flex flex-wrap gap-1">
              {group.links.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className={
                      link.href === "/admin"
                        ? "inline-flex min-h-9 items-center rounded-lg bg-[#edf2eb] px-2.5 text-xs font-black text-[#294635] transition hover:bg-[#e3ecdf]"
                        : "inline-flex min-h-9 items-center rounded-lg px-2.5 text-xs font-bold text-[#526054] transition hover:bg-[#f4f0e7] hover:text-[#233c31]"
                    }
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </nav>
  );
}
