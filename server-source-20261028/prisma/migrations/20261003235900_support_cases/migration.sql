BEGIN;

CREATE TYPE "SupportCaseStatus" AS ENUM (
    'WAITING_FOR_VENDOR',
    'WAITING_FOR_CUSTOMER',
    'UNDER_REVIEW',
    'RESOLVED'
);

CREATE TYPE "SupportCaseCategory" AS ENUM (
    'DELIVERY',
    'ITEM_QUALITY',
    'MISSING_ITEM',
    'OTHER'
);

CREATE TYPE "SupportCaseAuthorRole" AS ENUM (
    'CUSTOMER',
    'VENDOR',
    'ADMIN'
);

CREATE TABLE "SupportCase" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "vendorOrderId" TEXT NOT NULL,
    "category" "SupportCaseCategory" NOT NULL,
    "status" "SupportCaseStatus" NOT NULL DEFAULT 'WAITING_FOR_VENDOR',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupportCase_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SupportCaseMessage" (
    "id" TEXT NOT NULL,
    "supportCaseId" TEXT NOT NULL,
    "authorUserId" TEXT NOT NULL,
    "authorRole" "SupportCaseAuthorRole" NOT NULL,
    "body" VARCHAR(4000) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupportCaseMessage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SupportCase_customerId_updatedAt_id_idx" ON "SupportCase"("customerId", "updatedAt", "id");
CREATE INDEX "SupportCase_vendorOrderId_status_updatedAt_id_idx" ON "SupportCase"("vendorOrderId", "status", "updatedAt", "id");
CREATE INDEX "SupportCase_status_updatedAt_id_idx" ON "SupportCase"("status", "updatedAt", "id");
CREATE INDEX "SupportCaseMessage_supportCaseId_createdAt_id_idx" ON "SupportCaseMessage"("supportCaseId", "createdAt", "id");
CREATE INDEX "SupportCaseMessage_authorUserId_createdAt_idx" ON "SupportCaseMessage"("authorUserId", "createdAt");

ALTER TABLE "SupportCase"
ADD CONSTRAINT "SupportCase_customerId_fkey"
FOREIGN KEY ("customerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SupportCase"
ADD CONSTRAINT "SupportCase_vendorOrderId_fkey"
FOREIGN KEY ("vendorOrderId") REFERENCES "VendorOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SupportCaseMessage"
ADD CONSTRAINT "SupportCaseMessage_supportCaseId_fkey"
FOREIGN KEY ("supportCaseId") REFERENCES "SupportCase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SupportCaseMessage"
ADD CONSTRAINT "SupportCaseMessage_authorUserId_fkey"
FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION "reject_support_case_message_mutation"() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'SupportCaseMessage records are append-only.' USING ERRCODE = '55000';
END;
$$;

REVOKE ALL ON FUNCTION "reject_support_case_message_mutation"() FROM PUBLIC;

CREATE TRIGGER "SupportCaseMessage_append_only"
BEFORE UPDATE OR DELETE ON "SupportCaseMessage"
FOR EACH ROW EXECUTE FUNCTION "reject_support_case_message_mutation"();

COMMIT;
