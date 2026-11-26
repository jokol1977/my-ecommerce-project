"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

type CategoryOption = { id: string; name: string; label: string };
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

function optionalIntegerField(form: FormData, name: string) {
  const value = form.get(name);
  return typeof value === "string" && value.trim() ? Number(value) : null;
}

export default function ProductForm({ categories, product, onSaved }: { categories: CategoryOption[]; product?: EditableProduct; onSaved?: () => void }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const formElement = event.currentTarget;
    setBusy(true);
    setError("");
    setMessage("");
    const form = new FormData(formElement);
    const payload = {
      name: form.get("name"),
      description: form.get("description"),
      brandName: form.get("brandName"),
      productType: form.get("productType"),
      modelCode: form.get("modelCode"),
      sellerSku: form.get("sellerSku"),
      publicProductId: form.get("publicProductId"),
      originCountry: form.get("originCountry"),
      packageLengthMm: optionalIntegerField(form, "packageLengthMm"),
      packageWidthMm: optionalIntegerField(form, "packageWidthMm"),
      packageHeightMm: optionalIntegerField(form, "packageHeightMm"),
      packageWeightGrams: optionalIntegerField(form, "packageWeightGrams"),
      warrantyDescription: form.get("warrantyDescription"),
      specificationsText: form.get("specificationsText"),
      sourceReference: form.get("sourceReference"),
      sellerContentAttested: form.get("sellerContentAttested") === "on",
      categoryId: form.get("categoryId"),
      priceToman: Number(form.get("priceToman")),
      stockQuantity: Number(form.get("stockQuantity")),
    };
    try {
      const response = await fetch(product ? `/api/vendor/products/${encodeURIComponent(product.id)}` : "/api/vendor/products", {
        method: product ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        cache: "no-store",
      });
      const result: unknown = await response.json();
      if (!response.ok) {
        const text = typeof result === "object" && result !== null && "error" in result && typeof result.error === "string" ? result.error : "ثبت کالا انجام نشد.";
        throw new Error(text);
      }
      if (!product) formElement.reset();
      setMessage(product ? "اصلاحات ثبت شد و کالا دوباره برای بررسی فرستاده شد." : "کالا ثبت شد و پس از بررسی مدیر منتشر می‌شود.");
      router.refresh();
      onSaved?.();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "ثبت کالا انجام نشد.");
    } finally {
      setBusy(false);
    }
  }

  const fieldClass = "mt-2 min-h-12 w-full rounded-xl border border-slate-200 px-4 text-slate-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100";
  return (
    <form key={product?.id ?? "new-product"} onSubmit={submit} className="mt-5 grid gap-5 sm:grid-cols-2">
      <label className="text-sm font-bold text-slate-700">نام کالا<input name="name" required minLength={3} maxLength={120} defaultValue={product?.name ?? ""} className={fieldClass} /></label>
      <label className="text-sm font-bold text-slate-700">دسته‌بندی<select name="categoryId" required defaultValue={product?.categoryId ?? ""} className={fieldClass}><option value="" disabled>انتخاب کنید</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.label}</option>)}</select></label>
      <fieldset className="sm:col-span-2 rounded-2xl border border-slate-200 p-4 sm:p-5">
        <legend className="px-2 text-sm font-black text-slate-800">شناسنامه و مشخصات کالا</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-bold text-slate-700">برند یا سازنده<input name="brandName" maxLength={120} defaultValue={product?.brandName ?? ""} className={fieldClass} /></label>
          <label className="text-sm font-bold text-slate-700">نوع کالا<input name="productType" maxLength={120} defaultValue={product?.productType ?? ""} className={fieldClass} /></label>
          <label className="text-sm font-bold text-slate-700">مدل یا کد سازنده<input name="modelCode" maxLength={120} defaultValue={product?.modelCode ?? ""} className={fieldClass} /></label>
          <label className="text-sm font-bold text-slate-700">کد داخلی فروشنده (اختیاری)<input name="sellerSku" maxLength={80} dir="auto" defaultValue={product?.sellerSku ?? ""} className={fieldClass} /></label>
          <label className="text-sm font-bold text-slate-700">شناسهٔ عمومی کالا، در صورت داشتن<input name="publicProductId" maxLength={80} defaultValue={product?.publicProductId ?? ""} className={fieldClass} /><span className="mt-1 block font-normal text-slate-500">الزام این شناسه باید برای دستهٔ کالا جداگانه بررسی شود.</span></label>
          <label className="text-sm font-bold text-slate-700">کشور سازنده<input name="originCountry" maxLength={100} placeholder="برای نمونه: ایران" defaultValue={product?.originCountry ?? ""} className={fieldClass} /></label>
          <div className="sm:col-span-2">
            <p className="text-sm font-bold text-slate-700">ابعاد بسته‌بندی و وزن (اختیاری)</p>
            <div className="mt-2 grid gap-4 sm:grid-cols-4">
              <label className="text-xs font-bold text-slate-600">طول (میلی‌متر)<input name="packageLengthMm" type="number" min={1} max={100000} step={1} defaultValue={product?.packageLengthMm ?? ""} className={fieldClass} /></label>
              <label className="text-xs font-bold text-slate-600">عرض (میلی‌متر)<input name="packageWidthMm" type="number" min={1} max={100000} step={1} defaultValue={product?.packageWidthMm ?? ""} className={fieldClass} /></label>
              <label className="text-xs font-bold text-slate-600">ارتفاع (میلی‌متر)<input name="packageHeightMm" type="number" min={1} max={100000} step={1} defaultValue={product?.packageHeightMm ?? ""} className={fieldClass} /></label>
              <label className="text-xs font-bold text-slate-600">وزن (گرم)<input name="packageWeightGrams" type="number" min={1} max={1000000} step={1} defaultValue={product?.packageWeightGrams ?? ""} className={fieldClass} /></label>
            </div>
            <p className="mt-2 text-xs font-normal leading-6 text-slate-500">اگر ابعاد را وارد می‌کنید، هر سه بُعد را وارد کنید. این اطلاعات برای بررسی ارسال است و اکنون در صفحهٔ عمومی نمایش داده نمی‌شود.</p>
          </div>
          <label className="text-sm font-bold text-slate-700 sm:col-span-2">شرایط گارانتی، در صورت وجود<input name="warrantyDescription" maxLength={500} defaultValue={product?.warrantyDescription ?? ""} className={fieldClass} /></label>
          <label className="text-sm font-bold text-slate-700 sm:col-span-2">ویژگی‌های کالا، هر ویژگی در یک خط<textarea name="specificationsText" maxLength={1000} rows={4} placeholder="رنگ: ...&#10;جنس: ..." defaultValue={product?.specificationsText ?? ""} className={`${fieldClass} py-3`} /></label>
        </div>
      </fieldset>
      <label className="text-sm font-bold text-slate-700">قیمت (تومان)<input name="priceToman" type="number" required min={1} max={2147483647} step={1} defaultValue={product?.priceToman} className={fieldClass} /></label>
      <label className="text-sm font-bold text-slate-700">موجودی<input name="stockQuantity" type="number" required min={0} max={1000000} step={1} defaultValue={product?.stockQuantity ?? 0} className={fieldClass} /></label>
      <label className="text-sm font-bold text-slate-700 sm:col-span-2">توضیحات<textarea name="description" maxLength={5000} rows={4} defaultValue={product?.description ?? ""} className={`${fieldClass} py-3`} /></label>
      <label className="text-sm font-bold text-slate-700 sm:col-span-2">مرجع عمومی کالا (اختیاری، فقط نشانی HTTPS)<input name="sourceReference" type="url" maxLength={2048} placeholder="https://…" defaultValue={product?.sourceReference ?? ""} className={fieldClass} /><span className="mt-1 block font-normal text-slate-500">پیوند برای بررسی مدیر نگهداری می‌شود؛ سامانه آن را دریافت یا راستی‌آزمایی نمی‌کند.</span></label>
      <label className="flex items-start gap-3 text-sm leading-6 text-slate-700 sm:col-span-2"><input name="sellerContentAttested" type="checkbox" required className="mt-1 size-4 accent-blue-700" /><span>تأیید می‌کنم اطلاعات و محتوایی که برای این کالا فرستاده‌ام را مجاز به ارائه هستم. این اظهار فروشنده است و بررسی مستقل مدیر محسوب نمی‌شود.</span></label>
      <div className="sm:col-span-2"><button type="submit" disabled={busy} className="min-h-12 rounded-xl bg-blue-700 px-6 font-bold text-white transition hover:bg-blue-800 disabled:opacity-50">{busy ? "در حال ثبت…" : product ? "ارسال اصلاحات برای بررسی" : "ثبت برای بررسی"}</button>{message && <p role="status" className="mt-3 text-sm font-bold text-emerald-800">{message}</p>}{error && <p role="alert" className="mt-3 text-sm font-bold text-rose-700">{error}</p>}</div>
    </form>
  );
}
