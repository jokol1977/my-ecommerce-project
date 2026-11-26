BEGIN;

DO $local_demo$
DECLARE
  fashion_category_id text;
  digital_category_id text;
  seed_time timestamp(3) := CURRENT_TIMESTAMP;
BEGIN
  SELECT "id" INTO fashion_category_id FROM "Category" WHERE "slug" = 'fashion' AND "isActive" = true;
  SELECT "id" INTO digital_category_id FROM "Category" WHERE "slug" = 'digital' AND "isActive" = true;

  IF fashion_category_id IS NULL OR digital_category_id IS NULL THEN
    RAISE EXCEPTION 'Required active demo categories are missing; apply the project category migrations first.';
  END IF;

  IF EXISTS (SELECT 1 FROM "User" WHERE "email" = 'local-demo-vendor@janankadeh.invalid' AND "id" <> 'local-demo-vendor-user') THEN
    RAISE EXCEPTION 'The reserved local demo email is already used by another account.';
  END IF;
  IF EXISTS (SELECT 1 FROM "VendorProfile" WHERE "slug" = 'local-demo-store' AND "id" <> 'local-demo-vendor') THEN
    RAISE EXCEPTION 'The reserved local demo store slug is already used by another vendor.';
  END IF;

  INSERT INTO "User" ("id", "name", "email", "role", "status", "createdAt", "updatedAt")
  VALUES ('local-demo-vendor-user', 'فروشندهٔ نمونهٔ محلی', 'local-demo-vendor@janankadeh.invalid', 'VENDOR', 'ACTIVE', seed_time, seed_time)
  ON CONFLICT ("id") DO UPDATE SET
    "name" = EXCLUDED."name",
    "email" = EXCLUDED."email",
    "role" = EXCLUDED."role",
    "status" = EXCLUDED."status",
    "updatedAt" = EXCLUDED."updatedAt";

  INSERT INTO "VendorProfile" ("id", "userId", "storeName", "slug", "description", "status", "createdAt", "updatedAt")
  VALUES ('local-demo-vendor', 'local-demo-vendor-user', 'فروشگاه آزمایشی جانان‌کده', 'local-demo-store', 'حساب و کالاهای نمونه فقط برای بررسی محلی کاتالوگ و سبد خرید هستند و برای فروش واقعی نیستند.', 'ACTIVE', seed_time, seed_time)
  ON CONFLICT ("id") DO UPDATE SET
    "storeName" = EXCLUDED."storeName",
    "slug" = EXCLUDED."slug",
    "description" = EXCLUDED."description",
    "status" = EXCLUDED."status",
    "updatedAt" = EXCLUDED."updatedAt";

  INSERT INTO "Product" ("id", "vendorId", "categoryId", "slug", "name", "description", "priceToman", "stockQuantity", "status", "createdAt", "updatedAt")
  VALUES
    ('local-demo-product-bag', 'local-demo-vendor', fashion_category_id, 'sample-daily-bag', 'نمونهٔ آزمایشی: کیف روزمره', 'کالای نمایشی برای بررسی کارت محصول، افزودن به سبد و محاسبهٔ قیمت در محیط محلی؛ برای فروش واقعی نیست.', 295000, 8, 'ACTIVE', seed_time, seed_time),
    ('local-demo-product-lamp', 'local-demo-vendor', digital_category_id, 'sample-study-lamp', 'نمونهٔ آزمایشی: چراغ مطالعه', 'کالای نمایشی برای بررسی کارت محصول، افزودن به سبد و محاسبهٔ قیمت در محیط محلی؛ برای فروش واقعی نیست.', 185000, 12, 'ACTIVE', seed_time, seed_time)
  ON CONFLICT ("id") DO UPDATE SET
    "vendorId" = EXCLUDED."vendorId",
    "categoryId" = EXCLUDED."categoryId",
    "slug" = EXCLUDED."slug",
    "name" = EXCLUDED."name",
    "description" = EXCLUDED."description",
    "priceToman" = EXCLUDED."priceToman",
    "stockQuantity" = EXCLUDED."stockQuantity",
    "status" = EXCLUDED."status",
    "updatedAt" = EXCLUDED."updatedAt";

  INSERT INTO "ProductImage" ("id", "productId", "url", "altText", "position", "createdAt")
  VALUES
    ('local-demo-image-bag', 'local-demo-product-bag', '/images/placeholder.png', 'تصویر نمونهٔ کیف آزمایشی', 0, seed_time),
    ('local-demo-image-lamp', 'local-demo-product-lamp', '/images/placeholder.png', 'تصویر نمونهٔ چراغ آزمایشی', 0, seed_time)
  ON CONFLICT ("id") DO UPDATE SET
    "productId" = EXCLUDED."productId",
    "url" = EXCLUDED."url",
    "altText" = EXCLUDED."altText",
    "position" = EXCLUDED."position";
END
$local_demo$;

COMMIT;
