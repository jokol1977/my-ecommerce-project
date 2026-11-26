import type { Metadata } from "next";
import { requireActiveAdmin } from "@/lib/require-active-admin";
import AdminNavigation from "@/app/admin/admin-navigation";
import { hasUsableCronSecret } from "@/lib/cron-config";
import { getZarinpalConfiguration } from "@/lib/zarinpal";
import { isPaymentAvailable } from "@/lib/payment-config";
import { getRuntimeReadiness } from "@/lib/runtime-health";
import { isIranianSmsConfigured } from "@/lib/sms";

export const metadata: Metadata = {
  title: "آمادگی انتشار | مدیریت جانان‌کده",
  robots: { index: false, follow: false },
};

type Tone = "good" | "blocked" | "warning" | "neutral";

const toneClasses: Record<Tone, string> = {
  good: "border-emerald-200 bg-emerald-50 text-emerald-950",
  blocked: "border-rose-200 bg-rose-50 text-rose-950",
  warning: "border-amber-200 bg-amber-50 text-amber-950",
  neutral: "border-slate-200 bg-white text-slate-900",
};

function CheckCard({ title, status, detail, tone }: { title: string; status: string; detail: string; tone: Tone }) {
  return (
    <article className={`rounded-2xl border p-5 shadow-sm ${toneClasses[tone]}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h2 className="font-black">{title}</h2>
        <span className="rounded-full bg-white/70 px-3 py-1 text-xs font-black">{status}</span>
      </div>
      <p className="mt-3 text-sm leading-7 opacity-85">{detail}</p>
    </article>
  );
}

const processGaps = [
  {
    title: "قرارداد و پذیرش فروشنده",
    detail: "متن نهاییِ تأییدشده و ثبت نسخه، زمان و مدرک پذیرش الکترونیکی هنوز در سامانه وجود ندارد.",
  },
  {
    title: "احراز هویت فروشنده",
    detail: "گردش امن برای دریافت، بررسی، نگهداری و حذف مدارک هویتی طراحی نشده است؛ مدارک هویتی در سایت بارگذاری نشوند.",
  },
  {
    title: "بازپرداخت و اختلاف پرداخت",
    detail: "بازپرداخت خودکار و گردش رسیدگی مالی داخل سایت پیاده‌سازی نشده؛ رسیدگی فعلی از پنل درگاه و به‌صورت دستی انجام می‌شود.",
  },
  {
    title: "تطبیق تسویهٔ درگاه",
    detail: "گزارش استثناهای داخلی موجود است، اما ورود/تطبیق روزانهٔ گزارش تسویهٔ زرین‌پال هنوز عملیاتی نشده است.",
  },
  {
    title: "مالیات و شرایط تجاری",
    detail: "نقش حقوقی طرف‌ها، صورتحساب، مالیات، مرجوعی، کارمزد و شرایط نهایی تسویه به بررسی تخصصی نیاز دارند.",
  },
];

export default async function AdminReadinessPage() {
  await requireActiveAdmin();
  const runtimeReadiness = await getRuntimeReadiness();

  const production = process.env.NODE_ENV === "production";
  const smsReady = isIranianSmsConfigured();
  const authReady = false;
  const cronReady = hasUsableCronSecret();
  const checkoutFlagOpen = process.env.MARKETPLACE_LIVE_CHECKOUT_ENABLED === "true";
  const sellerFlagOpen = process.env.VENDOR_APPROVAL_ENABLED === "true";
  const zarinpal = getZarinpalConfiguration();
  const checkoutAvailable = isPaymentAvailable();
  const zarinpalStatus = !zarinpal
    ? "تنظیم نشده یا نامعتبر"
    : zarinpal.mode === "sandbox"
      ? "حالت آزمایشی"
      : "حالت تولید";
  const rateLimitStatus = !runtimeReadiness.rateLimitStore
    ? "در دسترس نیست"
    : !runtimeReadiness.rateLimitConfiguration
      ? "پیکربندی ناقص"
      : process.env.REDIS_URL
        ? "Redis متصل است"
        : "حافظهٔ محلی (توسعه)";
  const rateLimitTone: Tone = !runtimeReadiness.rateLimitStore || !runtimeReadiness.rateLimitConfiguration
    ? "blocked"
    : process.env.REDIS_URL
      ? "good"
      : "warning";
  const checkoutStatus = production
    ? checkoutAvailable ? "فعال در تولید" : "قفل بسته"
    : checkoutAvailable ? "قابل استفاده در توسعه" : "غیرفعال در توسعه";
  const sellerStatus = production
    ? sellerFlagOpen ? "قفل باز در تولید" : "قفل بسته"
    : "در توسعه باز";

  return (
    <main dir="rtl" className="min-h-screen bg-slate-50 px-4 py-10">
      <div className="mx-auto max-w-6xl">
        <AdminNavigation />
        <header className="mt-5 rounded-3xl bg-slate-950 p-6 text-white shadow-lg sm:p-8">
          <p className="text-sm font-bold text-blue-200">چک‌لیست داخلی مدیریت</p>
          <h1 className="mt-2 text-2xl font-black sm:text-3xl">آمادگی انتشار و قفل‌های عملیاتی</h1>
          <p className="mt-3 max-w-4xl text-sm leading-7 text-slate-200">
            این گزارش وضعیت تنظیمات و اتصال‌های ضروری همین محیط را نشان می‌دهد؛ تأیید حقوقی، امنیتی یا آمادگی کامل میزبانی نیست.
            هیچ مقدار محرمانه‌ای نمایش داده نمی‌شود.
          </p>
        </header>

        <section aria-label="وضعیت محیط و اتصال سرویس‌ها" className="mt-6 grid gap-3 md:grid-cols-2">
          <CheckCard
            title="محیط اجرا"
            status={production ? "تولید" : "توسعه / محلی"}
            detail={production ? "تنظیمات زیر روی محیط تولید اعمال شده‌اند." : "وضعیت محلی جایگزین بررسی تنظیمات میزبانی تولید نیست."}
            tone={production ? "warning" : "neutral"}
          />
          <CheckCard
            title="ورود و احراز هویت پایه"
            status={authReady ? "تنظیم شده" : "غیرفعال موقت"}
            detail="این انتشار فقط کاتالوگ عمومی را ارائه می‌کند؛ ورود کاربران و پنل‌های وابسته غیرفعال هستند."
            tone={authReady ? "good" : production ? "blocked" : "warning"}
          />
          <CheckCard
            title="اتصال پایگاه داده"
            status={runtimeReadiness.database ? "در دسترس" : "در دسترس نیست"}
            detail="یک پرس‌وجوی سادهٔ اتصال اجرا می‌شود؛ رمز و اطلاعات پایگاه داده نمایش داده نمی‌شود."
            tone={runtimeReadiness.database ? "good" : "blocked"}
          />
          <CheckCard
            title="Redis و محدودسازی درخواست‌ها"
            status={rateLimitStatus}
            detail={production ? "در تولید، Redis برای شمارش مشترک درخواست‌ها لازم است؛ اگر در دسترس نباشد، درخواست‌های حساس متوقف می‌شوند." : "اگر Redis محلی تنظیم نشده باشد، شمارندهٔ موقت حافظه برای توسعه استفاده می‌شود؛ این حالت برای تولید مناسب نیست."}
            tone={rateLimitTone}
          />
          <CheckCard
            title="پیامک رویدادهای سفارش"
            status={smsReady ? "کاوه‌نگار تنظیم شده" : "غیرفعال"}
            detail="اعلان پرداخت تأییدشده و ارسال فروشنده از زمان‌بند دقیقه‌ای صف ارسال می‌شوند. کلید و شمارهٔ فرستنده نمایش داده نمی‌شوند."
            tone={smsReady ? "good" : production ? "warning" : "neutral"}
          />
          <CheckCard
            title="زرین‌پال"
            status={zarinpalStatus}
            detail="شناسهٔ پذیرنده، کلیدها و نشانی‌ها نمایش داده نمی‌شوند. تنظیم معتبر به‌تنهایی به معنی مجازبودن فروش واقعی نیست."
            tone={zarinpal?.mode === "production" ? "warning" : zarinpal ? "neutral" : "blocked"}
          />
          <CheckCard
            title="پرداخت و تسویهٔ سفارش"
            status={checkoutStatus}
            detail={`قفل تولید: ${checkoutFlagOpen ? "باز" : "بسته"}. حتی با قفل باز، چک‌لیست حقوقی، بازپرداخت و تسویه باید جداگانه تکمیل شود.`}
            tone={production && checkoutAvailable ? "blocked" : production ? "good" : "neutral"}
          />
          <CheckCard
            title="ثبت‌نام و تأیید فروشنده"
            status={sellerStatus}
            detail={`قفل تولید: ${sellerFlagOpen ? "باز" : "بسته"}. تا آماده‌شدن قرارداد و روند امن احراز هویت، این قفل بسته بماند.`}
            tone={production && sellerFlagOpen ? "blocked" : production ? "good" : "neutral"}
          />
          <CheckCard
            title="وظیفهٔ زمان‌بندی‌شدهٔ پاک‌سازی سفارش‌ها"
            status={cronReady ? "رمز محرمانهٔ قابل قبول تنظیم شده" : "رمز تنظیم نشده یا نامعتبر"}
            detail="فقط طول رمز و نمونه‌نبودن آن بررسی می‌شود. اجرای زمان‌بند میزبانی و موفقیت فراخوانی دوره‌ای باید جداگانه کنترل شود."
            tone={cronReady ? "good" : production ? "blocked" : "warning"}
          />
        </section>

        <section aria-labelledby="process-gaps-heading" className="mt-9">
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-rose-950">
            <h2 id="process-gaps-heading" className="font-black">مواردی که هنوز مانع فروش واقعی‌اند</h2>
            <p className="mt-2 text-sm leading-7">تنظیم‌کردن متغیرهای محیطی این موارد را تکمیل نمی‌کند. فروش واقعی و پذیرش فروشنده تا انجام و بررسی آن‌ها غیرفعال بماند.</p>
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {processGaps.map((gap) => (
              <CheckCard key={gap.title} title={gap.title} status="تکمیل نشده" detail={gap.detail} tone="blocked" />
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
