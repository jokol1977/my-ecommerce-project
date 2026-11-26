import "server-only";

/** Local development stays usable; production gates require an explicit release decision. */
export function isLiveCheckoutGateEnabled() {
  return process.env.NODE_ENV !== "production" || process.env.MARKETPLACE_LIVE_CHECKOUT_ENABLED === "true";
}

/** Seller applications and approvals stay closed in production until onboarding is explicitly enabled. */
export function isVendorApprovalEnabled() {
  return process.env.NODE_ENV !== "production" || process.env.VENDOR_APPROVAL_ENABLED === "true";
}
