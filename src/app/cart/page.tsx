import { auth } from "@/auth";
import { getPrisma } from "@/lib/prisma";
import { isLiveCheckoutGateEnabled } from "@/lib/marketplace-config";
import { isPaymentAvailable, isProductionCheckoutConfigured } from "@/lib/payment-config";
import type { SavedAddress } from "@/types/address";
import CartReview from "./cart-review";

export const metadata = { title: "بازبینی سبد خرید | جانان‌کده" };

export default async function CartPage() {
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
