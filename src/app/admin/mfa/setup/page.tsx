import { auth } from "@/auth";
import { isAdminMfaSetupActive } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import AdminMfaSetupForm from "./setup-form";

export const dynamic = "force-dynamic";

export default async function AdminMfaSetupPage() {
  const session = await auth();
  if (!session?.user?.id || session.user.status !== "ACTIVE" || session.user.role !== "ADMIN") {
    redirect("/login");
  }
  if (session.user.mfaVerified) redirect("/admin");
  if (
    session.user.adminMfaSetup !== true ||
    !isAdminMfaSetupActive(session.user.adminMfaSetupExpiresAt)
  ) redirect("/login");

  return (
    <main dir="rtl" className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10">
      <section className="w-full max-w-xl rounded-3xl border border-slate-100 bg-white p-8 shadow-sm sm:p-10">
        <h1 className="text-2xl font-black text-slate-900">راه‌اندازی عامل دوم مدیر</h1>
        <p className="mt-4 leading-8 text-slate-600">
          پنل مدیریت تا زمان فعال‌سازی کد برنامه و نگهداری کدهای بازیابی در دسترس نیست.
        </p>
        <AdminMfaSetupForm />
      </section>
    </main>
  );
}
