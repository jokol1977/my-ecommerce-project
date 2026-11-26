INSERT INTO "Category" ("id", "name", "slug", "parentId", "isActive", "createdAt", "updatedAt")
VALUES
  ('cat-fashion-women-001', 'پوشاک بانوان', 'fashion-women', 'cat-fashion-000001', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('cat-fashion-men-0001', 'پوشاک مردانه', 'fashion-men', 'cat-fashion-000001', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("slug") DO NOTHING;
