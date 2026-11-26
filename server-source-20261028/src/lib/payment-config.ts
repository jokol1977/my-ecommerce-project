import "server-only";
import { isZarinpalConfigured } from "@/lib/zarinpal";
import { isLiveCheckoutGateEnabled } from "@/lib/marketplace-config";

/** Production order creation stays closed until marketplace operations and the live gateway are ready. */
export function isProductionCheckoutConfigured() {
  return isLiveCheckoutGateEnabled() && (process.env.NODE_ENV !== "production" || isZarinpalConfigured());
}

/** The gateway is usable only when production checkout is explicitly enabled. */
export function isPaymentAvailable() {
  return isProductionCheckoutConfigured() && isZarinpalConfigured();
}
