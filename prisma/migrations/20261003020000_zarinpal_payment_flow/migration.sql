ALTER TYPE "OrderStatus" ADD VALUE 'PAYMENT_REVIEW';

ALTER TABLE "Payment"
ADD COLUMN "providerTransactionId" TEXT,
ADD COLUMN "verificationStartedAt" TIMESTAMP(3),
ADD COLUMN "verifiedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "Payment_providerTransactionId_key"
ON "Payment"("providerTransactionId");

CREATE UNIQUE INDEX "Payment_one_pending_attempt_per_order_key"
ON "Payment"("orderId")
WHERE "status" = 'PENDING';
