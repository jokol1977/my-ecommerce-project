ALTER TABLE "Order"
  ADD COLUMN "idempotencyKey" TEXT,
  ADD COLUMN "requestFingerprint" VARCHAR(64);

CREATE UNIQUE INDEX "Order_idempotencyKey_key"
  ON "Order"("idempotencyKey");

ALTER TABLE "Order"
  ADD CONSTRAINT "Order_requestFingerprint_format_check"
  CHECK ("requestFingerprint" IS NULL OR "requestFingerprint" ~ '^[a-f0-9]{64}$');
