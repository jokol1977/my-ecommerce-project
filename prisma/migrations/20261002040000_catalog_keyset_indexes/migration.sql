CREATE INDEX "Product_status_createdAt_id_idx"
ON "Product" ("status", "createdAt", "id");

CREATE INDEX "Product_status_priceToman_id_idx"
ON "Product" ("status", "priceToman", "id");
