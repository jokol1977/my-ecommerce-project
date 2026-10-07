import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getPrisma } from "@/lib/prisma";
import { getCategoryPaths } from "@/lib/category-tree";
import type { ProductStatus as ProductStatusType } from "@/generated/prisma/enums";
import ProductForm from "./product-form";
import StockEditor from "./stock-editor";
import ResubmitProduct from "./resubmit-product";

export const metadata: Metadata = { title: "پنل فروشنده | جانان‌کده" };

const statusLabels = {
  DRAFT: "پیش‌نویس",
  PENDING_REVIEW: "در انتظار بررسی",
  ACTIVE: "منتشرشده",
  REJECTED: "نیازمند اصلاح",
  ARCHIVED: "بایگانی‌شده",
} as const;
const PRODUCT_STATUSES = ["DRAFT", "PENDING_REVIEW", "ACTIVE", "REJECTED", "ARCHIVED"] as const satisfies readonly ProductStatusType[];
const PAGE_SIZE = 25;

type SellerDashboardProps = {
  searchParams: Promise<{ page?: string | string[]; query?: string | string[]; status?: string | string[] }>;
};

export default async function SellerDashboardPage({ searchParams }: SellerDashboardProps) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (session.user.status !== "ACTIVE" || session.user.role !== "VENDOR") redirect("/account");

  const prisma = getPrisma();
  const vendor = await prisma.vendorProfile.findFirst({
    where: { userId: session.user.id, status: "ACTIVE" },
    select: { id: true, storeName: true },
  });
  if (!vendor) redirect("/seller/apply");

  const { page: rawPage, query: rawQuery, status: rawStatus } = await searchParams;
  const page = typeof rawPage === "string" && /^[1-9]\d*$/.test(rawPage) ? Number(rawPage) : 1;
  const query = typeof rawQuery === "string" ? rawQuery.trim() : "";
  const selectedStatus: ProductStatusType | undefined = typeof rawStatus === "string" && PRODUCT_STATUSES.some((value) => value === rawStatus)
    ? rawStatus as ProductStatusType
    : undefined;
  const status = selectedStatus ?? "";
  if (
    !Number.isSafeInteger(page) || page > 1000 ||
    Array.isArray(rawPage) || Array.isArray(rawQuery) || Array.isArray(rawStatus) ||
    (rawPage !== undefined && String(page) !== rawPage) ||
    (rawQuery !== undefined && (query.length > 100 || query !== rawQuery)) ||
    (rawStatus !== undefined && !selectedStatus)
  ) {
    redirect("/seller");
  }

  const filterQuery = new URLSearchParams();
  if (query) filterQuery.set("query", query);
  if (status) filterQuery.set("status", status);
  const filters = filterQuery.toString();

  const [categories, products] = await Promise.all([
    prisma.category.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true, parentId: true } }),
    prisma.product.findMany({
      where: {
        vendorId: vendor.id,
        ...(query ? { name: { contains: query, mode: "insensitive" as const } } : {}),
        ...(selectedStatus ? { status: selectedStatus } : {}),
      },
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE + 1,
      select: { id: true, name: true, description: true, categoryId: true, priceToman: true, stockQuantity: true, reviewNote: true, status: true, updatedAt: true, category: { select: { name: true } } },
    }),
  ]);
  const hasNextPage = products.length > PAGE_SIZE;
  const visibleProducts = products.slice(0, PAGE_SIZE);
  const categoryPaths = getCategoryPaths(categories);
  const categoryOptions = categories.map((category) => ({ ...category, label: categoryPaths.get(category.id) ?? category.name }));
  const pageHref = (value: number) => {
    const params = new URLSearchParams(filters);
    if (value > 1) params.set("page", String(value));
    const queryString = params.toString();
    return queryString ? `/seller?${queryString}` : "/seller";
  };

  return (
    <main dir="rtl" className="min-h-screen bg-slate-50 px-4 py-10">
      <div className="mx-auto max-w-5xl">
        <nav className="flex flex-wrap gap-5 text-sm font-bold text-blue-700"><Link href="/account" className="hover:underline">حساب کاربری</Link><Link href="/seller/orders" className="hover:underline">سفارش‌های فروشگاه</Link><Link href="/seller/support" className="hover:underline">درخواست‌های پشتیبانی</Link></nav>
        <h1 className="mt-4 text-3xl font-black text-slate-900">پنل فروشنده</h1>
        <p className="mt-2 text-slate-600">فروشگاه {vendor.storeName}؛ کالاهای تازه پس از بررسی مدیر در سایت منتشر می‌شوند.</p>
        <section className="mt-7 rounded-3xl border border-slate-100 bg-white p-6 shadow-sm sm:p-8">
          <h2 className="text-xl font-black">ثبت کالای تازه</h2>
          {categories.length ? <ProductForm categories={categoryOptions} /> : <p className="mt-4 rounded-xl bg-amber-50 p-4 leading-7 text-amber-900">هنوز دسته‌بندی فعالی برای ثبت کالا وجود ندارد. مدیر سایت باید ابتدا دسته‌بندی‌ها را در پایگاه داده آماده کند.</p>}
        </section>
        <section className="mt-8">
          <h2 className="text-xl font-black text-slate-900">کالاهای فروشگاه</h2>
          <form action="/seller" method="get" className="mt-4 grid gap-3 rounded-2xl border border-slate-100 bg-white p-4 sm:grid-cols-[1fr_15rem_auto_auto] sm:items-end">
            <label className="text-sm font-bold text-slate-700">جست‌وجو در نام کالا
              <input name="query" defaultValue={query} maxLength={100} className="mt-2 min-h-11 w-full rounded-xl border border-slate-300 px-3 font-normal" />
            </label>
            <label className="text-sm font-bold text-slate-700">وضعیت کالا
              <select name="status" defaultValue={status} className="mt-2 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 font-normal">
                <option value="">همهٔ وضعیت‌ها</option>
                {PRODUCT_STATUSES.map((value) => <option key={value} value={value}>{statusLabels[value]}</option>)}
              </select>
            </label>
            <button type="submit" className="min-h-11 rounded-xl bg-blue-700 px-5 font-bold text-white hover:bg-blue-800">اعمال فیلتر</button>
            <Link href="/seller" className="py-3 text-center text-sm font-bold text-slate-600 hover:text-blue-700">پاک‌کردن</Link>
          </form>
          {visibleProducts.length === 0 ? <p className="mt-4 rounded-2xl bg-white p-7 text-slate-600">{query || status ? "کالایی با این فیلترها پیدا نشد." : "هنوز کالایی ثبت نکرده‌اید."}</p> : (
            <div className="mt-4 space-y-3">
              {visibleProducts.map((product) => (
                <article key={product.id} className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
                  <div><h3 className="font-bold text-slate-900">{product.name}</h3><p className="mt-1 text-sm text-slate-500">{product.category.name} · {product.priceToman.toLocaleString("fa-IR")} تومان · موجودی {product.stockQuantity.toLocaleString("fa-IR")}</p>
                    {product.status === "REJECTED" && <p className="mt-2 max-w-2xl rounded-lg bg-rose-50 p-3 text-sm leading-6 text-rose-900">دلیل رد: {product.reviewNote ?? "مدیر برای این کالا توضیحی ثبت نکرده است."}</p>}
                    {(product.status === "REJECTED" || product.status === "DRAFT") && <ResubmitProduct product={{ id: product.id, name: product.name, description: product.description, categoryId: product.categoryId, priceToman: product.priceToman, stockQuantity: product.stockQuantity }} categories={categoryOptions} />}
                  </div>
                  <div className="flex flex-wrap items-center gap-4"><span className={`rounded-full px-3 py-1.5 text-sm font-bold ${product.status === "ACTIVE" ? "bg-emerald-50 text-emerald-800" : product.status === "REJECTED" ? "bg-rose-50 text-rose-800" : "bg-amber-50 text-amber-900"}`}>{statusLabels[product.status]}</span>
                    {product.status === "ACTIVE" && <StockEditor productId={product.id} initialStock={product.stockQuantity} />}
                  </div>
                </article>
              ))}
            </div>
          )}
          {(page > 1 || hasNextPage) && <nav aria-label="صفحه‌بندی کالاهای فروشگاه" className="mt-6 flex justify-between">
            {page > 1 ? <Link href={pageHref(page - 1)} className="rounded-lg bg-white px-4 py-2 text-sm font-bold text-blue-700 shadow-sm">کالاهای قبلی</Link> : <span />}
            {hasNextPage && <Link href={pageHref(page + 1)} className="rounded-lg bg-white px-4 py-2 text-sm font-bold text-blue-700 shadow-sm">کالاهای بعدی</Link>}
          </nav>}
        </section>
      </div>
    </main>
  );
}
