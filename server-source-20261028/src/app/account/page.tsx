import { redirect } from "next/navigation";
import Link from "next/link";
import { auth, signOut } from "@/auth";

export const metadata = { title: "حساب کاربری | جانان‌کده" };

export default async function AccountPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  async function endSession() {
    "use server";
    await signOut({ redirectTo: "/" });
  }

  if (session.user.status !== "ACTIVE") {
    return (
      <main dir="rtl" className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <section className="rounded-3xl bg-white p-8 shadow-sm">
          <h1 className="text-xl font-black">دسترسی این حساب غیرفعال است</h1>
          <form action={endSession}><button className="mt-5 rounded-xl bg-slate-900 px-5 py-3 font-bold text-white">خروج از حساب</button></form>
        </section>
      </main>
    );
  }

  return (
    <main dir="rtl" className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <section className="w-full max-w-lg rounded-3xl border border-slate-100 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-black text-slate-900">حساب کاربری</h1>
        <p className="mt-5 text-sm text-slate-500">نشانی ایمیل تأییدشده</p>
        <p dir="ltr" className="mt-1 text-left font-bold text-slate-800">{session.user.email}</p>
        <p className="mt-4 text-sm text-slate-500">نوع حساب</p>
        <p className="mt-1 font-bold text-slate-800">
          {session.user.role === "ADMIN" ? "مدیر" : session.user.role === "VENDOR" ? "فروشنده" : "مشتری"}
        </p>
        <Link href="/account/orders" className="mt-6 inline-block rounded-xl bg-blue-50 px-4 py-3 font-bold text-blue-800 hover:bg-blue-100">مشاهدهٔ سفارش‌های من</Link>
        {session.user.role === "CUSTOMER" && <Link href="/account/support" className="mr-3 mt-6 inline-block rounded-xl bg-indigo-50 px-4 py-3 font-bold text-indigo-800 hover:bg-indigo-100">درخواست‌های پشتیبانی من</Link>}
        <Link href="/account/addresses" className="mr-3 mt-6 inline-block rounded-xl bg-slate-100 px-4 py-3 font-bold text-slate-800 hover:bg-slate-200">دفترچهٔ نشانی‌ها</Link>
        <div className="mt-3 flex flex-wrap gap-3">
          {session.user.role === "CUSTOMER" && <Link href="/seller/apply" className="rounded-xl bg-amber-50 px-4 py-3 font-bold text-amber-900 hover:bg-amber-100">درخواست فروشندگی</Link>}
          {session.user.role === "VENDOR" && <><Link href="/seller" className="rounded-xl bg-amber-50 px-4 py-3 font-bold text-amber-900 hover:bg-amber-100">پنل فروشنده</Link><Link href="/seller/orders" className="rounded-xl bg-emerald-50 px-4 py-3 font-bold text-emerald-900 hover:bg-emerald-100">سفارش‌های فروشگاه</Link></>}
          {session.user.role === "ADMIN" && <Link href="/admin" className="rounded-xl bg-indigo-50 px-4 py-3 font-bold text-indigo-900 hover:bg-indigo-100">مرکز مدیریت</Link>}
          {session.user.role === "ADMIN" && <><Link href="/admin/orders" className="rounded-xl bg-emerald-50 px-4 py-3 font-bold text-emerald-900 hover:bg-emerald-100">مدیریت سفارش‌ها</Link><Link href="/admin/vendors" className="rounded-xl bg-rose-50 px-4 py-3 font-bold text-rose-900 hover:bg-rose-100">بررسی درخواست‌های فروشندگی</Link><Link href="/admin/products" className="rounded-xl bg-blue-50 px-4 py-3 font-bold text-blue-900 hover:bg-blue-100">بررسی کالاها</Link><Link href="/admin/reviews" className="rounded-xl bg-amber-50 px-4 py-3 font-bold text-amber-900 hover:bg-amber-100">بررسی دیدگاه‌ها</Link><Link href="/admin/categories" className="rounded-xl bg-violet-50 px-4 py-3 font-bold text-violet-900 hover:bg-violet-100">مدیریت دسته‌بندی‌ها</Link></>}
          {session.user.role === "ADMIN" && <Link href="/admin/audit" className="rounded-xl bg-slate-100 px-4 py-3 font-bold text-slate-800 hover:bg-slate-200">گزارش فعالیت مدیران</Link>}
        </div>
        <form action={endSession}>
          <button type="submit" className="mt-8 min-h-11 rounded-xl bg-slate-900 px-5 py-2.5 font-bold text-white transition hover:bg-slate-700">خروج از حساب</button>
        </form>
      </section>
    </main>
  );
}
