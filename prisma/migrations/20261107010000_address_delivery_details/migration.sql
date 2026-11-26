ALTER TABLE "Address"
ADD COLUMN "buildingNumber" TEXT,
ADD COLUMN "unit" TEXT;

ALTER TABLE "Order"
ADD COLUMN "buildingNumber" TEXT,
ADD COLUMN "unit" TEXT;
