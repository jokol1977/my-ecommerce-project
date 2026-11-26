import "server-only";

/** Local development stays usable; live production checkout stays closed until financial release gates are met. */
export function isLiveCheckoutGateEnabled() {
  if (process.env.NODE_ENV !== "production") return true;

  // The environment flag alone cannot establish marketplace approval, refund, settlement, or pilot readiness.
  return false;
}

/** Production approvals stay closed until the final agreement and secure identity-review process are ready. */
export function isVendorApprovalEnabled() {
  if (process.env.NODE_ENV !== "production") return true;

  // A production flag cannot substitute for an approved agreement or secure identity review.
  // Per-vendor, versioned contract acceptance is implemented, but KYC is not.
  return false;
}
