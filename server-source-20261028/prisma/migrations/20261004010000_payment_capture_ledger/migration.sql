BEGIN;

CREATE TYPE "LedgerAccountCode" AS ENUM (
    'GATEWAY_CLEARING',
    'UNALLOCATED_ORDER_FUNDS'
);

CREATE TYPE "LedgerEventType" AS ENUM (
    'PAYMENT_CAPTURE_VERIFIED'
);

CREATE TABLE "LedgerTransfer" (
    "id" TEXT NOT NULL,
    "eventKey" VARCHAR(120) NOT NULL,
    "eventType" "LedgerEventType" NOT NULL,
    "debitAccount" "LedgerAccountCode" NOT NULL,
    "creditAccount" "LedgerAccountCode" NOT NULL,
    "amountToman" INTEGER NOT NULL,
    "orderId" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LedgerTransfer_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "LedgerTransfer_amountToman_positive" CHECK ("amountToman" > 0),
    CONSTRAINT "LedgerTransfer_distinct_accounts" CHECK ("debitAccount" <> "creditAccount")
);

CREATE UNIQUE INDEX "LedgerTransfer_eventKey_key" ON "LedgerTransfer"("eventKey");
CREATE INDEX "LedgerTransfer_orderId_createdAt_id_idx" ON "LedgerTransfer"("orderId", "createdAt", "id");
CREATE INDEX "LedgerTransfer_paymentId_createdAt_idx" ON "LedgerTransfer"("paymentId", "createdAt");
CREATE INDEX "LedgerTransfer_eventType_createdAt_id_idx" ON "LedgerTransfer"("eventType", "createdAt", "id");
CREATE INDEX "LedgerTransfer_debitAccount_createdAt_idx" ON "LedgerTransfer"("debitAccount", "createdAt");
CREATE INDEX "LedgerTransfer_creditAccount_createdAt_idx" ON "LedgerTransfer"("creditAccount", "createdAt");

ALTER TABLE "LedgerTransfer"
ADD CONSTRAINT "LedgerTransfer_orderId_fkey"
FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "LedgerTransfer"
ADD CONSTRAINT "LedgerTransfer_paymentId_fkey"
FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION "reject_ledger_transfer_mutation"() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'LedgerTransfer records are append-only.' USING ERRCODE = '55000';
END;
$$;

REVOKE ALL ON FUNCTION "reject_ledger_transfer_mutation"() FROM PUBLIC;

CREATE TRIGGER "LedgerTransfer_append_only"
BEFORE UPDATE OR DELETE ON "LedgerTransfer"
FOR EACH ROW EXECUTE FUNCTION "reject_ledger_transfer_mutation"();

COMMIT;
