"use client";

import { useState } from "react";
import ProductForm from "./product-form";

type CategoryOption = { id: string; name: string; parentId: string | null; label: string };
type EditableProduct = {
  id: string;
  name: string;
  description: string;
  categoryId: string;
  priceToman: number;
  stockQuantity: number;
  brandName?: string | null;
  productType?: string | null;
  modelCode?: string | null;
  sellerSku?: string | null;
  publicProductId?: string | null;
  originCountry?: string | null;
  packageLengthMm?: number | null;
  packageWidthMm?: number | null;
  packageHeightMm?: number | null;
  packageWeightGrams?: number | null;
  warrantyDescription?: string | null;
  specificationsText?: string | null;
  sourceReference?: string | null;
};

export default function ResubmitProduct({ product, categories }: { product: EditableProduct; categories: CategoryOption[] }) {
  const [editing, setEditing] = useState(false);
  return <div className="mt-4">
    {!editing ? <button type="button" onClick={() => setEditing(true)} className="rounded-lg bg-blue-50 px-4 py-2 text-sm font-bold text-blue-800 hover:bg-blue-100">اصلاح و ارسال دوباره</button> : <><button type="button" onClick={() => setEditing(false)} className="text-sm font-bold text-slate-600 underline">بستن فرم اصلاح</button><ProductForm categories={categories} product={product} onSaved={() => setEditing(false)} /></>}
  </div>;
}
