-- Keep the product stock ceiling enforced even when data is written outside the application API.
ALTER TABLE "Product"
ADD CONSTRAINT "Product_stockQuantity_maximum"
CHECK ("stockQuantity" <= 1000000);
