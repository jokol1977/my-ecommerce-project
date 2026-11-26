import { auth } from "@/auth";
import Link from "next/link";
import { getPrisma } from "@/lib/prisma";
import { isLiveCheckoutGateEnabled } from "@/lib/marketplace-config";
import { isPaymentAvailable, isProductionCheckoutConfigured } from "@/lib/payment-config";
import type { SavedAddress } from "@/types/address";
import CartReview from "./cart-review";

export const metadata = { title: "بازبینی سبد خرید | جانان‌کده" };

export default async function CartPage() {
  if (!isLiveCheckoutGateEnabled()) {
    return (
      <main dir="rtl" className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10">
        <section className="w-full max-w-xl rounded-3xl border border-slate-100 bg-white p-7 text-center shadow-sm sm:p-10">
          <p className="text-sm font-bold text-emerald-800">جانان‌کده</p>
          <h1 className="mt-3 text-2xl font-black text-slate-900">ثبت سفارش هنوز فعال نیست</h1>
          <p className="mt-4 leading-8 text-slate-600">
            در این مرحله فقط می‌توانید کاتالوگ عمومی را ببینید. پس از آماده‌شدن فرایند خرید، ثبت سفارش از همین سایت فعال می‌شود.
          </p>
          <Link href="/" className="mt-7 inline-flex min-h-12 items-center justify-center rounded-xl bg-emerald-800 px-6 font-bold text-white transition hover:bg-emerald-900">
            بازگشت به کاتالوگ
          </Link>
        </section>
      </main>
    );
  }

  const session = await auth();
  const isAuthenticated = Boolean(session?.user?.id && session.user.status === "ACTIVE");
  let savedAddresses: SavedAddress[] = [];
  if (isAuthenticated && session?.user?.id) {
    savedAddresses = await getPrisma().address.findMany({
      where: { userId: session.user.id }, orderBy: { createdAt: "desc" }, take: 20,
      select: { id: true, title: true, recipient: true, phone: true, province: true, city: true, addressLine: true, postalCode: true },
    });
  }
  return (
    <CartReview
      isAuthenticated={isAuthenticated}
      savedAddresses={savedAddresses}
      checkoutEnabled={isProductionCheckoutConfigured()}
      liveCheckoutGateEnabled={isLiveCheckoutGateEnabled()}
      paymentConfigured={isPaymentAvailable()}
    />
  );
}
