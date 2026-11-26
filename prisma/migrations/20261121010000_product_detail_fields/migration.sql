ALTER TABLE "Product"
  ADD COLUMN "brandName" VARCHAR(120),
  ADD COLUMN "productType" VARCHAR(120),
  ADD COLUMN "modelCode" VARCHAR(120),
  ADD COLUMN "sellerSku" VARCHAR(80),
  ADD COLUMN "publicProductId" VARCHAR(80),
  ADD COLUMN "originCountry" VARCHAR(100),
  ADD COLUMN "packageLengthMm" INTEGER,
  ADD COLUMN "packageWidthMm" INTEGER,
  ADD COLUMN "packageHeightMm" INTEGER,
  ADD COLUMN "packageWeightGrams" INTEGER,
  ADD COLUMN "warrantyDescription" VARCHAR(500),
  ADD COLUMN "specificationsText" TEXT;

CREATE UNIQUE INDEX "Product_vendorId_sellerSku_key"
ON "Product"("vendorId", "sellerSku");
