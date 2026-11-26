"use client";

import Image from "next/image";
import { useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { MAX_PRODUCT_IMAGE_UPLOAD_BYTES } from "@/lib/product-image-policy";

type ImageItem = { id: string; url: string; altText: string; sizeBytes: number; storageReady: boolean; storageDeleting: boolean };

export default function ProductImagesManager({ productId, images }: { productId: string; images: ImageItem[] }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();
  const ownedImages = images.filter((image) => image.url.startsWith("/api/product-images/"));

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const files = Array.from(input.files ?? []);
    if (!files.length || busy) return;
    setError("");
    setMessage("");
    if (files.some((file) => file.size > MAX_PRODUCT_IMAGE_UPLOAD_BYTES)) {
      setError("حجم هر تصویر باید حداکثر ۲ مگابایت باشد.");
      input.value = "";
      return;
    }
    setBusy(true);
    let uploaded = 0;
    try {
      for (const file of files) {
        const alt = file.name.replace(/\.[^.]+$/, "").slice(0, 200);
        const response = await fetch(`/api/vendor/products/${encodeURIComponent(productId)}/images?${new URLSearchParams({ alt })}`, {
          method: "POST",
          headers: { "Content-Type": file.type },
          body: file,
          cache: "no-store",
        });
        const result: unknown = await response.json();
        if (!response.ok) {
          const text = typeof result === "object" && result !== null && "error" in result && typeof result.error === "string" ? result.error : "بارگذاری تصویر انجام نشد.";
          throw new Error(text);
        }
        uploaded += 1;
      }
      setMessage(`${uploaded.toLocaleString("fa-IR")} تصویر بارگذاری شد و برای بررسی مدیر در صف کالا قرار گرفت.`);
      input.value = "";
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? `${uploaded ? `${uploaded.toLocaleString("fa-IR")} تصویر ثبت شد؛ ` : ""}${reason.message}` : "بارگذاری تصویر انجام نشد.");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function remove(imageId: string) {
    if (busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch(`/api/vendor/products/${encodeURIComponent(productId)}/images?${new URLSearchParams({ imageId })}`, {
        method: "DELETE",
        cache: "no-store",
      });
      if (!response.ok) {
        const result: unknown = await response.json();
        const text = typeof result === "object" && result !== null && "error" in result && typeof result.error === "string" ? result.error : "حذف تصویر انجام نشد.";
        throw new Error(text);
      }
      setMessage("تصویر و سهمیهٔ آن حذف شد.");
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "حذف تصویر انجام نشد.");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return <section className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
    <h4 className="font-bold text-slate-800">تصویرهای کالا</h4>
    <p className="mt-1 text-xs leading-6 text-slate-600">حداکثر ۶ تصویر برای هر کالا، هر فایل ورودی تا ۲ مگابایت؛ سهمیهٔ فروشگاه ۱۰۰ مگابایت. فایل‌ها پس از بازکدگذاری ذخیره و پس از انتشار کالا عمومی می‌شوند.</p>
    <div className="mt-3 flex flex-wrap gap-3">
      {ownedImages.map((image, index) => <div key={image.id} className="w-28 rounded-lg border border-slate-200 bg-white p-2">
        {image.storageReady && !image.storageDeleting ? <Image src={image.url} alt={image.altText} width={96} height={80} unoptimized className="h-20 w-24 rounded object-cover" /> : <div className="flex h-20 items-center justify-center rounded bg-amber-50 p-2 text-center text-xs text-amber-900">{image.storageDeleting ? "حذف ناتمام؛ برای تلاش دوباره دکمه را بزنید" : "بارگذاری ناقص؛ حذف کنید تا سهمیه آزاد شود"}</div>}
        <p className="mt-1 text-xs text-slate-500">{image.storageDeleting ? "سهمیه تا پایان حذف رزرو می‌ماند" : image.storageReady ? `${(image.sizeBytes / (1024 * 1024)).toFixed(2)} مگابایت` : "رزرو ناقص"}</p>
        <button type="button" aria-label={`${image.storageDeleting ? "تلاش دوباره برای حذف" : "حذف تصویر"} ${image.altText.trim().slice(0, 80) || (index + 1).toLocaleString("fa-IR")}`} disabled={busy} onClick={() => remove(image.id)} className="mt-1 text-xs font-bold text-rose-700 underline disabled:opacity-50">{image.storageDeleting ? "تلاش دوباره برای حذف" : "حذف تصویر"}</button>
      </div>)}
    </div>
    <label className="mt-4 block text-sm font-bold text-slate-700">افزودن تصویر
      <input type="file" accept="image/jpeg,image/png,image/webp,image/avif" multiple disabled={busy} onChange={upload} className="mt-2 block w-full text-sm file:ml-3 file:rounded-lg file:border-0 file:bg-blue-700 file:px-4 file:py-2 file:font-bold file:text-white disabled:opacity-50" />
    </label>
    {message && <p role="status" className="mt-3 text-sm font-bold text-emerald-800">{message}</p>}
    {error && <p role="alert" className="mt-3 text-sm font-bold text-rose-700">{error}</p>}
  </section>;
}
