"use client";

import Image from "next/image";
import { useState } from "react";
import { useRouter } from "next/navigation";

type ReviewImage = { id: string; url: string; altText: string; storageReady: boolean; storageDeleting: boolean };

export default function AdminProductImages({ productId, images }: { productId: string; images: ReviewImage[] }) {
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();

  async function remove(imageId: string) {
    if (busyId) return;
    setBusyId(imageId);
    setError("");
    try {
      const response = await fetch(`/api/admin/products/${encodeURIComponent(productId)}/images?${new URLSearchParams({ imageId })}`, { method: "DELETE", cache: "no-store" });
      if (!response.ok) {
        const result: unknown = await response.json();
        const message = typeof result === "object" && result !== null && "error" in result && typeof result.error === "string" ? result.error : "حذف تصویر انجام نشد.";
        throw new Error(message);
      }
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "حذف تصویر انجام نشد.");
      router.refresh();
    } finally {
      setBusyId("");
    }
  }

  return <section className="mt-4 flex flex-wrap gap-3" aria-label="گالری تصویرهای کالا برای بررسی">
    {images.map((image, index) => <div key={image.id} className="w-36 rounded-xl border border-slate-200 p-2">
      {image.storageReady && !image.storageDeleting ? <Image src={image.url} alt={image.altText} width={128} height={96} unoptimized className="h-24 w-32 rounded-lg object-cover" /> : <div className="flex h-24 items-center justify-center rounded-lg bg-amber-50 p-2 text-center text-xs text-amber-900">{image.storageDeleting ? "حذف ناتمام؛ برای تلاش دوباره دکمه را بزنید" : "رزرو تصویر ناتمام"}</div>}
      <button type="button" aria-label={`${image.storageDeleting ? "تلاش دوباره برای حذف" : "حذف تصویر"} ${image.altText.trim().slice(0, 80) || (index + 1).toLocaleString("fa-IR")}`} disabled={Boolean(busyId)} onClick={() => remove(image.id)} className="mt-2 text-xs font-bold text-rose-700 underline disabled:opacity-50">{busyId === image.id ? "در حال حذف…" : image.storageDeleting ? "تلاش دوباره برای حذف" : "حذف تصویر"}</button>
    </div>)}
    {error && <p role="alert" className="w-full text-sm text-rose-700">{error}</p>}
  </section>;
}
