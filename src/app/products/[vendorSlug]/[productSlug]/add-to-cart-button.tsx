"use client";

import { useState } from "react";
import Link from "next/link";
import type { StorefrontProduct } from "@/types/catalog";

type CartItem = { product: StorefrontProduct; quantity: number };
const CART_STORAGE_KEY = "janankadeh-cart";

export default function AddToCartButton({ product }: { product: StorefrontProduct }) {
  const [added, setAdded] = useState(false);

  function addToCart() {
    try {
      const raw = window.localStorage.getItem(CART_STORAGE_KEY);
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      const items: CartItem[] = Array.isArray(parsed)
        ? parsed.filter((item): item is CartItem =>
            typeof item === "object" && item !== null &&
            "product" in item && typeof item.product === "object" && item.product !== null &&
            "id" in item.product && typeof item.product.id === "string" &&
            typeof item.quantity === "number" && Number.isSafeInteger(item.quantity) && item.quantity > 0,
          )
        : [];

      const existing = items.find((item) => item.product.id === product.id);
      if (existing) {
        existing.quantity = Math.min(existing.quantity + 1, 99);
      } else {
        items.push({ product, quantity: 1 });
      }

      window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items));
      window.dispatchEvent(new Event("janankadeh:cart-changed"));
      setAdded(true);
    } catch {
      setAdded(false);
    }
  }

  return (
    <div className="mt-5">
      <button
        type="button"
        onClick={addToCart}
        disabled={!product.inStock}
        className="min-h-12 w-full rounded-xl bg-blue-700 px-5 py-3 font-black text-white transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-slate-300"
      >
        {!product.inStock ? "ناموجود" : added ? "به سبد خرید اضافه شد" : "افزودن به سبد خرید"}
      </button>
      {added && (
        <Link href="/cart" className="mt-3 block text-center text-sm font-bold text-blue-700 hover:underline">
          مشاهده سبد و بررسی قیمت روز
        </Link>
      )}
      <p className="mt-3 text-center text-xs leading-6 text-slate-500">
        قیمت و موجودی ذخیره‌شده در مرورگر اعتبار سفارش ندارد و هنگام ثبت سفارش باید از سرور دوباره بررسی شود.
      </p>
    </div>
  );
}
