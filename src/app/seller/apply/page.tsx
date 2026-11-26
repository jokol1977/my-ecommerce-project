import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getPrisma } from "@/lib/prisma";
import { isVendorApprovalEnabled } from "@/lib/marketplace-config";
import { getCurrentVendorAgreement } from "@/lib/vendor-agreement";
import VendorApplicationForm from "./form";

export const metadata: Metadata = { title: "درخواست فروشندگی | جانان‌کده" };

const vendorStatusText: Record<string, string> = {
  PENDING: "درخواست فروشگاه در انتظار بررسی مدیر است.",
  ACTIVE: "فروشگاه شما تأیید شده است و می‌توانید کالا ثبت کنید.",
  SUSPENDED: "فعالیت فروشگاه موقتاً متوقف شده است. برای پیگیری با مدیریت تماس بگیرید.",
  REJECTED: "درخواست فروشگاه تأیید نشد. برای پیگیری با مدیریت تماس بگیرید.",
};

export default async function VendorApplicationPage() {
  const approvalEnabled = isVendorApprovalEnabled();
  const agreement = approvalEnabled ? await getCurrentVendorAgreement() : null;
  if (!approvalEnabled || !agreement) {
    return (
      <main dir="rtl" className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10">
        <section className="w-full max-w-xl rounded-3xl border border-slate-100 bg-white p-7 text-center shadow-sm sm:p-10">
          <p className="text-sm font-bold text-emerald-800">جانان‌کده</p>
          <h1 className="mt-3 text-2xl font-black text-slate-900">پذیرش فروشنده فعلاً فعال نیست</h1>
          <p role="status" className="mt-4 leading-8 text-slate-600">
            {!approvalEnabled
              ? "این نسخه برای مشاهدهٔ کاتالوگ عمومی است. پس از آماده‌شدن قرارداد و روند بررسی فروشندگان، ثبت درخواست از همین سایت در دسترس خواهد بود."
              : "نسخهٔ نهایی و تأییدشدهٔ قرارداد فروشنده در دسترس نیست؛ ثبت درخواست تا انتشار و تطبیق نسخهٔ قرارداد بسته می‌ماند."}
          </p>
          <Link href="/" className="mt-7 inline-flex min-h-12 items-center justify-center rounded-xl bg-emerald-800 px-6 font-bold text-white transition hover:bg-emerald-900">
            بازگشت به کاتالوگ
          </Link>
        </section>
      </main>
    );
  }

  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const vendor = await getPrisma().vendorProfile.findUnique({
    where: { userId: session.user.id },
    select: { storeName: true, slug: true, status: true },
  });

  return (
    <main dir="rtl" className="min-h-screen bg-slate-50 px-4 py-10">
      <div className="mx-auto max-w-2xl rounded-3xl border border-slate-100 bg-white p-6 shadow-sm sm:p-9">
        <Link href="/account" className="text-sm font-bold text-blue-700 hover:underline">بازگشت به حساب کاربری</Link>
        <h1 className="mt-5 text-2xl font-black text-slate-900">درخواست فروشندگی</h1>
        {session.user.status !== "ACTIVE" ? (
          <p className="mt-5 rounded-xl bg-rose-50 p-4 font-bold text-rose-800">این حساب فعال نیست و نمی‌تواند درخواست فروشندگی ثبت کند.</p>
        ) : vendor ? (
          <section className="mt-6 rounded-2xl bg-blue-50 p-5">
            <p className="font-black text-blue-950">{vendor.storeName}</p>
            <p dir="ltr" className="mt-1 text-left text-sm text-blue-800">/{vendor.slug}</p>
            <p className="mt-4 leading-8 text-blue-950">{vendorStatusText[vendor.status] ?? "وضعیت فروشگاه مشخص نیست."}</p>
            {vendor.status === "ACTIVE" && <Link href="/seller" className="mt-4 inline-block rounded-xl bg-blue-700 px-5 py-3 font-bold text-white hover:bg-blue-800">ورود به پنل فروشنده</Link>}
          </section>
        ) : session.user.role !== "CUSTOMER" ? (
          <p className="mt-5 rounded-xl bg-amber-50 p-4 leading-7 text-amber-900">این حساب برای ثبت درخواست فروشندگی واجد شرایط نیست.</p>
        ) : (
          <>
            <p className="mt-3 text-sm leading-7 text-slate-600">درخواست‌ها پیش از فعال‌شدن فروشگاه توسط مدیر بررسی می‌شوند. تا آن زمان فروشگاه یا کالایی در فهرست عمومی نمایش داده نمی‌شود.</p>
            <VendorApplicationForm agreement={agreement} />
          </>
        )}
      </div>
    </main>
  );
}
