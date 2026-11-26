export type ProductInput = {
  name: string;
  description: string;
  categoryId: string;
  priceToman: number;
  stockQuantity: number;
};

export const MAX_PRODUCT_STOCK = 1_000_000;

export function parseProductInput(value: unknown): ProductInput | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const data = value as Record<string, unknown>;
  const name = typeof data.name === "string" ? data.name.normalize("NFKC").trim() : "";
  const description = typeof data.description === "string" ? data.description.normalize("NFKC").trim() : "";
  const categoryId = typeof data.categoryId === "string" ? data.categoryId : "";
  const priceToman = data.priceToman;
  const stockQuantity = data.stockQuantity;
  if (name.length < 3 || name.length > 120 || /[\u0000-\u001f\u007f]/.test(name) ||
      description.length > 5000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(description) ||
      !/^[a-zA-Z0-9_-]{1,40}$/.test(categoryId) ||
      !Number.isSafeInteger(priceToman) || (priceToman as number) < 1 || (priceToman as number) > 2_147_483_647 ||
      !Number.isSafeInteger(stockQuantity) || (stockQuantity as number) < 0 || (stockQuantity as number) > MAX_PRODUCT_STOCK) return null;
  return { name, description, categoryId, priceToman: priceToman as number, stockQuantity: stockQuantity as number };
}
