CREATE TABLE "VendorAgreementAcceptance" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "vendorProfileId" TEXT NOT NULL,
    "contractVersion" VARCHAR(80) NOT NULL,
    "documentSha256" CHAR(64) NOT NULL,
    "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VendorAgreementAcceptance_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "VendorAgreementAcceptance_userId_acceptedAt_idx"
ON "VendorAgreementAcceptance"("userId", "acceptedAt");

CREATE INDEX "VendorAgreementAcceptance_vendorProfileId_acceptedAt_idx"
ON "VendorAgreementAcceptance"("vendorProfileId", "acceptedAt");

CREATE INDEX "VendorAgreementAcceptance_current_idx"
ON "VendorAgreementAcceptance"("vendorProfileId", "contractVersion", "documentSha256");

ALTER TABLE "VendorAgreementAcceptance"
ADD CONSTRAINT "VendorAgreementAcceptance_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "VendorAgreementAcceptance"
ADD CONSTRAINT "VendorAgreementAcceptance_vendorProfileId_fkey"
FOREIGN KEY ("vendorProfileId") REFERENCES "VendorProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION "reject_vendor_agreement_acceptance_mutation"() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Vendor agreement acceptance records are immutable';
END;
$$;

CREATE TRIGGER "VendorAgreementAcceptance_immutable"
BEFORE UPDATE OR DELETE ON "VendorAgreementAcceptance"
FOR EACH ROW EXECUTE FUNCTION "reject_vendor_agreement_acceptance_mutation"();
