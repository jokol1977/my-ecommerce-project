BEGIN;

CREATE TYPE "SmsNotificationType" AS ENUM (
    'ORDER_PAID',
    'VENDOR_ORDER_SHIPPED'
);

CREATE TYPE "SmsNotificationStatus" AS ENUM (
    'PENDING',
    'PROCESSING',
    'SENT',
    'FAILED'
);

CREATE TABLE "SmsNotification" (
    "id" TEXT NOT NULL,
    "eventKey" VARCHAR(120) NOT NULL,
    "eventType" "SmsNotificationType" NOT NULL,
    "orderId" TEXT NOT NULL,
    "vendorOrderId" TEXT,
    "status" "SmsNotificationStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedAt" TIMESTAMP(3),
    "lastAttemptAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SmsNotification_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "SmsNotification_attempts_range" CHECK ("attempts" BETWEEN 0 AND 3),
    CONSTRAINT "SmsNotification_processing_lock" CHECK (("status" = 'PROCESSING') = ("lockedAt" IS NOT NULL)),
    CONSTRAINT "SmsNotification_shipment_reference" CHECK (("eventType" = 'VENDOR_ORDER_SHIPPED') = ("vendorOrderId" IS NOT NULL))
);

CREATE UNIQUE INDEX "SmsNotification_eventKey_key" ON "SmsNotification"("eventKey");
CREATE INDEX "SmsNotification_status_nextAttemptAt_createdAt_idx" ON "SmsNotification"("status", "nextAttemptAt", "createdAt");
CREATE INDEX "SmsNotification_status_lockedAt_idx" ON "SmsNotification"("status", "lockedAt");
CREATE INDEX "SmsNotification_orderId_createdAt_id_idx" ON "SmsNotification"("orderId", "createdAt", "id");

ALTER TABLE "SmsNotification"
ADD CONSTRAINT "SmsNotification_orderId_fkey"
FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SmsNotification"
ADD CONSTRAINT "SmsNotification_vendorOrderId_fkey"
FOREIGN KEY ("vendorOrderId") REFERENCES "VendorOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

COMMIT;
