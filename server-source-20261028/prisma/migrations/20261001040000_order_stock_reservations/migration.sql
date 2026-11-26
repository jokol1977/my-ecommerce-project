ALTER TABLE "Order" ADD COLUMN "paymentExpiresAt" TIMESTAMP(3);

CREATE INDEX "Order_status_paymentExpiresAt_idx"
  ON "Order"("status", "paymentExpiresAt");
