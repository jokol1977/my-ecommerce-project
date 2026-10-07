import type { Metadata } from "next";
import { getPrisma } from "@/lib/prisma";
import { requireActiveAdmin } from "@/lib/require-active-admin";
import AdminNavigation from "@/app/admin/admin-navigation";
import CategoryManager from "./category-manager";

export const metadata: Metadata = { title: "مدیریت دسته‌بندی‌ها | جانان‌کده" };

export default async function AdminCategoriesPage() {
  await requireActiveAdmin();

  const categories = await getPrisma().category.findMany({
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
    select: { id: true, name: true, slug: true, parentId: true, isActive: true, _count: { select: { products: true } } },
  });

  return <main dir="rtl" className="min-h-screen bg-slate-50 px-4 py-10"><div className="mx-auto max-w-4xl">
    <AdminNavigation />
    <h1 className="mt-5 text-2xl font-black text-slate-900">مدیریت دسته‌بندی‌ها</h1>
    <p className="mt-2 text-sm leading-7 text-slate-600">ساختار دسته‌ها با مسیر والد و فرزند نمایش داده می‌شود. برای جلوگیری از باقی‌ماندن زیرشاخه‌های یتیم، پیش از غیرفعال‌کردن یک والد باید زیرشاخه‌های فعالش را غیرفعال کنید؛ برای فعال‌سازی نیز ابتدا والدها را فعال کنید.</p>
    <CategoryManager categories={categories} />
  </div></main>;
}
