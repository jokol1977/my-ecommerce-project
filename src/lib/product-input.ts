export type ProductInput = {
  name: string;
  description: string;
  brandName: string | null;
  productType: string | null;
  modelCode: string | null;
  sellerSku: string | null;
  publicProductId: string | null;
  originCountry: string | null;
  packageLengthMm: number | null;
  packageWidthMm: number | null;
  packageHeightMm: number | null;
  packageWeightGrams: number | null;
  warrantyDescription: string | null;
  specificationsText: string | null;
  sourceReference: string | null;
  sellerContentAttested: true;
  categoryId: string;
  priceToman: number;
  stockQuantity: number;
};

export const MAX_PRODUCT_STOCK = 1_000_000;

export function isSellerSkuConflict(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("code" in error) || error.code !== "P2002" || !("meta" in error)) return false;
  const meta = error.meta;
  if (typeof meta !== "object" || meta === null || !("target" in meta)) return false;
  const target = meta.target;
  return Array.isArray(target)
    ? target.includes("sellerSku")
    : typeof target === "string" && target.includes("sellerSku");
}

function optionalText(value: unknown, maxLength: number): string | null | undefined {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") return undefined;
  const text = value.normalize("NFKC").trim();
  if (text.length > maxLength || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text)) return undefined;
  return text || null;
}

function optionalPositiveInteger(value: unknown, maximum: number): number | null | undefined {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1 || value > maximum) return undefined;
  return value;
}

export function parseProductInput(value: unknown): ProductInput | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const data = value as Record<string, unknown>;
  const name = typeof data.name === "string" ? data.name.normalize("NFKC").trim() : "";
  const description = typeof data.description === "string" ? data.description.normalize("NFKC").trim() : "";
  const brandName = optionalText(data.brandName, 120);
  const productType = optionalText(data.productType, 120);
  const modelCode = optionalText(data.modelCode, 120);
  const sellerSku = optionalText(data.sellerSku, 80);
  const publicProductId = optionalText(data.publicProductId, 80);
  const originCountry = optionalText(data.originCountry, 100);
  const packageLengthMm = optionalPositiveInteger(data.packageLengthMm, 100_000);
  const packageWidthMm = optionalPositiveInteger(data.packageWidthMm, 100_000);
  const packageHeightMm = optionalPositiveInteger(data.packageHeightMm, 100_000);
  const packageWeightGrams = optionalPositiveInteger(data.packageWeightGrams, 1_000_000);
  const warrantyDescription = optionalText(data.warrantyDescription, 500);
  const specificationsText = optionalText(data.specificationsText, 1_000);
  const sourceReferenceValue = typeof data.sourceReference === "string" ? data.sourceReference.normalize("NFKC").trim() : "";
  const sellerContentAttested = data.sellerContentAttested === true;
  const categoryId = typeof data.categoryId === "string" ? data.categoryId : "";
  const priceToman = data.priceToman;
  const stockQuantity = data.stockQuantity;
  if (name.length < 3 || name.length > 120 || /[\u0000-\u001f\u007f]/.test(name) ||
      description.length > 5000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(description) ||
      [brandName, productType, modelCode, sellerSku, publicProductId, originCountry, warrantyDescription, specificationsText].includes(undefined) ||
      [packageLengthMm, packageWidthMm, packageHeightMm, packageWeightGrams].includes(undefined) ||
      ((packageLengthMm !== null || packageWidthMm !== null || packageHeightMm !== null) &&
        (packageLengthMm === null || packageWidthMm === null || packageHeightMm === null)) ||
      !/^[a-zA-Z0-9_-]{1,40}$/.test(categoryId) || !sellerContentAttested || sourceReferenceValue.length > 2048 ||
      !Number.isSafeInteger(priceToman) || (priceToman as number) < 1 || (priceToman as number) > 2_147_483_647 ||
      !Number.isSafeInteger(stockQuantity) || (stockQuantity as number) < 0 || (stockQuantity as number) > MAX_PRODUCT_STOCK) return null;
  let sourceReference: string | null = null;
  if (sourceReferenceValue) {
    try {
      const url = new URL(sourceReferenceValue);
      if (url.protocol !== "https:" || !url.hostname || url.username || url.password) return null;
      sourceReference = url.toString();
    } catch { return null; }
  }
  return {
    name,
    description,
    brandName: brandName as string | null,
    productType: productType as string | null,
    modelCode: modelCode as string | null,
    sellerSku: sellerSku as string | null,
    publicProductId: publicProductId as string | null,
    originCountry: originCountry as string | null,
    packageLengthMm: packageLengthMm as number | null,
    packageWidthMm: packageWidthMm as number | null,
    packageHeightMm: packageHeightMm as number | null,
    packageWeightGrams: packageWeightGrams as number | null,
    warrantyDescription: warrantyDescription as string | null,
    specificationsText: specificationsText as string | null,
    sourceReference,
    sellerContentAttested: true,
    categoryId,
    priceToman: priceToman as number,
    stockQuantity: stockQuantity as number,
  };
}
