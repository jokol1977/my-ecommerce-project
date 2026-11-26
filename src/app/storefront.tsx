"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  toStorefrontProduct,
  type PublicCatalogPage,
  type PublicCatalogProduct,
  type StorefrontProduct,
} from "@/types/catalog";

type Product = StorefrontProduct;

type HomeProps = {
  initialProducts: Product[];
  categoryOptions?: Array<{ value: string; label: string }>;
  initialHasMore?: boolean;
  initialCursor?: string | null;
  demoMode: boolean;
  initialCatalogError?: string | null;
  checkoutEnabled: boolean;
  vendorApplicationsEnabled: boolean;
  accountAccessEnabled: boolean;
  publicCatalogOnly: boolean;
};

type CartItem = {
  product: Product;
  quantity: number;
};

type Category = {
  title: string;
  icon: string;
  color: string;
  items: string[];
};

const CART_STORAGE_KEY = "janankadeh-cart";
const FUTURE_STORAGE_KEY = "janankadeh-future";

const PLACEHOLDER_IMAGE = "/images/placeholder.png";

const CATEGORIES: Category[] = [
  {
    title: "موبایل و دیجیتال",
    icon: "📱",
    color: "bg-blue-50 text-blue-700",
    items: ["موبایل", "لوازم جانبی", "هدفون و هندزفری", "ساعت هوشمند"],
  },
  {
    title: "مد و پوشاک",
    icon: "👕",
    color: "bg-pink-50 text-pink-700",
    items: ["لباس مردانه", "لباس زنانه", "کفش", "کیف و اکسسوری"],
  },
  {
    title: "خانه و آشپزخانه",
    icon: "🏠",
    color: "bg-amber-50 text-amber-700",
    items: ["لوازم آشپزخانه", "دکوراسیون", "ابزار", "خواب و حمام"],
  },
  {
    title: "زیبایی و سلامت",
    icon: "💄",
    color: "bg-purple-50 text-purple-700",
    items: ["مراقبت پوست", "عطر و ادکلن", "لوازم آرایشی", "سلامت"],
  },
  {
    title: "سوپرمارکت",
    icon: "🛒",
    color: "bg-green-50 text-green-700",
    items: ["خوراکی", "نوشیدنی", "شوینده", "محصولات روزمره"],
  },
];

const CATEGORY_SHOWCASE = [
  {
    title: "پوشاک بانوان",
    image: "/images/category-womenswear.webp",
    alt: "مانتو، کیف و روسری در چیدمانی روشن",
    filterTerms: ["پوشاک بانوان", "لباس زنانه", "زنانه"],
    demoCategory: "پوشاک",
  },
  {
    title: "پوشاک مردانه",
    image: "/images/category-menswear-v2.webp",
    alt: "پالتوی مردانه و اکسسوری‌های پوشاک",
    filterTerms: ["پوشاک مردانه", "لباس مردانه", "مردانه"],
    demoCategory: "پوشاک",
  },
  {
    title: "زیبایی و سلامت",
    image: "/images/category-beauty.webp",
    alt: "عطر، کرم و ابزار آرایشی در چیدمانی کرم و طلایی",
    filterTerms: ["زیبایی", "سلامت"],
    demoCategory: "زیبایی و سلامت",
  },
  {
    title: "موبایل و دیجیتال",
    image: "/images/category-electronics-v2.webp",
    alt: "گوشی، ساعت هوشمند و هدفون",
    filterTerms: ["دیجیتال", "موبایل", "الکترونیک"],
    demoCategory: "الکترونیک",
  },
];

const CATEGORY_FILTERS = [
  "همه",
  "الکترونیک",
  "پوشیدنی هوشمند",
  "پوشاک",
  "اکسسوری",
  "زیبایی و سلامت",
];

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isValidProduct(value: unknown): value is Product {
  if (!isObject(value)) return false;

  const validId =
    (typeof value.id === "number" && Number.isFinite(value.id)) ||
    typeof value.id === "string";

  return (
    validId &&
    typeof value.name === "string" &&
    typeof value.price === "string" &&
    typeof value.image === "string" &&
    typeof value.vendorName === "string" &&
    typeof value.category === "string" &&
    typeof value.badge === "string" &&
    (value.inStock === undefined || typeof value.inStock === "boolean") &&
    (value.averageRating === undefined || value.averageRating === null || (typeof value.averageRating === "number" && Number.isFinite(value.averageRating))) &&
    (value.reviewCount === undefined || (typeof value.reviewCount === "number" && Number.isSafeInteger(value.reviewCount) && value.reviewCount >= 0))
  );
}

function isCatalogProduct(value: unknown): value is PublicCatalogProduct {
  if (!isObject(value) || !isObject(value.category) || !isObject(value.vendor)) {
    return false;
  }

  const validImage =
    value.image === null ||
    (isObject(value.image) &&
      typeof value.image.url === "string" &&
      typeof value.image.altText === "string");

  return (
    typeof value.id === "string" &&
    typeof value.slug === "string" &&
    typeof value.name === "string" &&
    typeof value.priceToman === "number" &&
    Number.isSafeInteger(value.priceToman) &&
    value.priceToman >= 0 &&
    typeof value.inStock === "boolean" &&
    (value.averageRating === undefined || value.averageRating === null || (typeof value.averageRating === "number" && Number.isFinite(value.averageRating) && value.averageRating >= 1 && value.averageRating <= 5)) &&
    (value.reviewCount === undefined || (typeof value.reviewCount === "number" && Number.isSafeInteger(value.reviewCount) && value.reviewCount >= 0)) &&
    typeof value.category.name === "string" &&
    typeof value.category.slug === "string" &&
    typeof value.category.path === "string" &&
    typeof value.vendor.storeName === "string" &&
    typeof value.vendor.slug === "string" &&
    validImage
  );
}

function parseCatalogPage(value: unknown): PublicCatalogPage | null {
  if (!isObject(value) || !Array.isArray(value.products)) return null;
  if (!value.products.every(isCatalogProduct)) return null;

  if (
    typeof value.page !== "number" ||
    typeof value.pageSize !== "number" ||
    typeof value.hasMore !== "boolean" ||
    !(value.nextCursor === null || (typeof value.nextCursor === "string" && /^[A-Za-z0-9_-]{1,256}$/.test(value.nextCursor))) ||
    (value.hasMore && typeof value.nextCursor !== "string")
  ) {
    return null;
  }

  return {
    products: value.products,
    page: value.page,
    pageSize: value.pageSize,
    hasMore: value.hasMore,
    nextCursor: value.nextCursor,
  };
}

async function fetchCatalogPage(
  query: string,
  category: string,
  cursor: string | null,
  sort: string,
  minPrice: number | undefined,
  maxPrice: number | undefined,
  inStockOnly: boolean,
  signal: AbortSignal,
): Promise<PublicCatalogPage> {
  const params = new URLSearchParams({ sort });
  if (cursor) params.set("cursor", cursor);
  else params.set("page", "1");
  if (query) params.set("q", query);
  if (category !== "همه") params.set("categoryId", category);
  if (minPrice !== undefined) params.set("minPrice", String(minPrice));
  if (maxPrice !== undefined) params.set("maxPrice", String(maxPrice));
  if (inStockOnly) params.set("inStock", "1");

  const response = await fetch(`/api/products?${params}`, { signal });
  if (!response.ok) throw new Error("Catalog request failed.");

  const payload = parseCatalogPage(await response.json());
  if (!payload) throw new Error("Catalog response was invalid.");
  return payload;
}

function normalizePriceDigits(value: string) {
  const digits = [...value].map((character) => {
    const code = character.codePointAt(0) ?? 0;
    if (code >= 0x06f0 && code <= 0x06f9) return String(code - 0x06f0);
    if (code >= 0x0660 && code <= 0x0669) return String(code - 0x0660);
    return character;
  }).join("").replace(/\D/g, "").slice(0, 10);
  const price = Number(digits);
  return price > 2_147_483_647 ? "2147483647" : digits;
}

function parsePriceFilter(value: string): number | undefined {
  if (!value) return undefined;
  const price = Number(value);
  return Number.isSafeInteger(price) && price <= 2_147_483_647 ? price : undefined;
}

function parseDisplayedPrice(value: string) {
  const normalized = [...value].map((character) => {
    const code = character.codePointAt(0) ?? 0;
    if (code >= 0x06f0 && code <= 0x06f9) return String(code - 0x06f0);
    if (code >= 0x0660 && code <= 0x0669) return String(code - 0x0660);
    return character;
  }).join("");
  return Number(normalized.replace(/\D/g, "")) || 0;
}

function normalizeProduct(value: unknown): Product | null {
  return isValidProduct(value) ? value : null;
}

function normalizeCartItems(value: unknown): CartItem[] {
  if (!Array.isArray(value)) return [];

  const result: CartItem[] = [];

  for (const item of value) {
    if (!isObject(item)) continue;

    const product = normalizeProduct(item.product);
    const rawQuantity = item.quantity;

    if (
      product &&
      typeof rawQuantity === "number" &&
      Number.isFinite(rawQuantity) &&
      rawQuantity > 0
    ) {
      const quantity = Math.floor(rawQuantity);
      const existingIndex = result.findIndex(
        (cartItem) => cartItem.product.id === product.id,
      );

      if (existingIndex >= 0) {
        result[existingIndex] = {
          ...result[existingIndex],
          quantity: result[existingIndex].quantity + quantity,
        };
      } else {
        result.push({
          product,
          quantity,
        });
      }
    }
  }

  return result;
}

function normalizeFutureItems(value: unknown): Product[] {
  if (!Array.isArray(value)) return [];

  const result: Product[] = [];

  for (const item of value) {
    const product = normalizeProduct(item);

    if (
      product &&
      !result.some((existingProduct) => existingProduct.id === product.id)
    ) {
      result.push(product);
    }
  }

  return result;
}

function readStorage<T>(
  key: string,
  parser: (value: unknown) => T,
  fallback: T,
): T {
  try {
    const rawValue = window.localStorage.getItem(key);

    if (!rawValue) return fallback;

    const parsedValue: unknown = JSON.parse(rawValue);
    return parser(parsedValue);
  } catch {
    return fallback;
  }
}

function writeStorage(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ممکن است مرورگر اجازهٔ استفاده از localStorage را ندهد.
    // در این حالت برنامه باید بدون توقف به کار خود ادامه دهد.
  }
}

function SearchIcon() {
  return (
    <svg
      width="21"
      height="21"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="m20 20-4.2-4.2m1.2-5.3a6.5 6.5 0 1 1-13 0 6.5 6.5 0 0 1 13 0Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function CartIcon() {
  return (
    <svg
      width="23"
      height="23"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M3 4h2l1.5 10.2a2 2 0 0 0 2 1.8h8.8a2 2 0 0 0 2-1.7L21 7H6"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="10" cy="20" r="1.2" fill="currentColor" />
      <circle cx="18" cy="20" r="1.2" fill="currentColor" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg
      width="21"
      height="21"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M20 21a8 8 0 0 0-16 0M12 13a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}

function MenuIcon() {
  return (
    <svg
      width="23"
      height="23"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M4 6h16M4 12h16M4 18h16"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg
      width="23"
      height="23"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="m6 6 12 12M18 6 6 18"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

export default function Home({
  initialProducts,
  categoryOptions = CATEGORY_FILTERS.map((value) => ({ value, label: value })),
  initialHasMore = false,
  initialCursor = null,
  demoMode,
  initialCatalogError = null,
  checkoutEnabled,
  vendorApplicationsEnabled,
  accountAccessEnabled,
  publicCatalogOnly,
}: HomeProps) {
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("همه");
  const [minPriceInput, setMinPriceInput] = useState("");
  const [maxPriceInput, setMaxPriceInput] = useState("");
  const [inStockOnly, setInStockOnly] = useState(false);
  const [megaMenuOpen, setMegaMenuOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);

  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [cartAnnouncement, setCartAnnouncement] = useState("");
  const [futureItems, setFutureItems] = useState<Product[]>([]);
  const [cartLoaded, setCartLoaded] = useState(false);

  const [products, setProducts] = useState(initialProducts);
  const [cursor, setCursor] = useState<string | null>(initialCursor);
  const [sort, setSort] = useState("newest");
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState(initialCatalogError);
  const priceRangeInvalid = parsePriceFilter(minPriceInput) !== undefined
    && parsePriceFilter(maxPriceInput) !== undefined
    && parsePriceFilter(minPriceInput)! > parsePriceFilter(maxPriceInput)!;
  const hasActiveCatalogFilters = Boolean(
    search.trim() ||
    selectedCategory !== "همه" ||
    minPriceInput ||
    maxPriceInput ||
    inStockOnly,
  );
  const showCatalogControls = products.length > 0 || hasActiveCatalogFilters;
  const initialFilter = useRef("|همه|newest|||false");
  const activeCatalogRequest = useRef<AbortController | null>(null);
  const [imageErrors, setImageErrors] = useState<Record<string, boolean>>({});

  const cartCount = useMemo(() => {
    return cartItems.reduce((total, item) => {
      return total + item.quantity;
    }, 0);
  }, [cartItems]);

  useEffect(() => {
    const hydrationTimer = window.setTimeout(() => {
      setCartItems(
        readStorage(CART_STORAGE_KEY, normalizeCartItems, []),
      );
      setFutureItems(
        readStorage(FUTURE_STORAGE_KEY, normalizeFutureItems, []),
      );
      setCartLoaded(true);
    }, 0);

    return () => window.clearTimeout(hydrationTimer);
  }, []);

  useEffect(() => {
    function refreshCartFromStorage() {
      setCartItems(readStorage(CART_STORAGE_KEY, normalizeCartItems, []));
    }

    window.addEventListener("janankadeh:cart-changed", refreshCartFromStorage);
    window.addEventListener("storage", refreshCartFromStorage);
    return () => {
      window.removeEventListener("janankadeh:cart-changed", refreshCartFromStorage);
      window.removeEventListener("storage", refreshCartFromStorage);
    };
  }, []);

  useEffect(() => {
    if (!cartLoaded) return;

    writeStorage(CART_STORAGE_KEY, cartItems);
    writeStorage(FUTURE_STORAGE_KEY, futureItems);
  }, [cartItems, futureItems, cartLoaded]);

  useEffect(() => {
    if (demoMode) return;

    const normalizedQuery = search.trim();
    const minPrice = parsePriceFilter(minPriceInput);
    const maxPrice = parsePriceFilter(maxPriceInput);
    const filterKey = `${normalizedQuery}|${selectedCategory}|${sort}|${minPrice ?? ""}|${maxPrice ?? ""}|${inStockOnly}`;
    if (initialFilter.current === filterKey) return;
    initialFilter.current = filterKey;

    if (minPrice !== undefined && maxPrice !== undefined && minPrice > maxPrice) return;

    activeCatalogRequest.current?.abort();
    const controller = new AbortController();
    activeCatalogRequest.current = controller;
    const requestTimer = window.setTimeout(() => {
      void (async () => {
        setCatalogLoading(true);
        setCatalogError(null);

        try {
          const payload = await fetchCatalogPage(
            normalizedQuery,
            selectedCategory,
            null,
            sort,
            minPrice,
            maxPrice,
            inStockOnly,
            controller.signal,
          );

          setProducts(payload.products.map(toStorefrontProduct));
          setCursor(payload.nextCursor);
          setHasMore(payload.hasMore);
        } catch {
          if (controller.signal.aborted) return;
          setProducts([]);
          setCursor(null);
          setHasMore(false);
          setCatalogError("بارگذاری محصولات با مشکل روبه‌رو شد. دوباره تلاش کنید.");
        } finally {
          if (!controller.signal.aborted) setCatalogLoading(false);
        }
      })();
    }, 250);

    return () => {
      window.clearTimeout(requestTimer);
      controller.abort();
      if (activeCatalogRequest.current === controller) {
        activeCatalogRequest.current = null;
      }
    };
  }, [demoMode, search, selectedCategory, sort, minPriceInput, maxPriceInput, inStockOnly]);

  const filteredProducts = useMemo(() => {
    if (priceRangeInvalid) return [];
    if (!demoMode) return products;

    const query = search.trim().toLowerCase();

    const matches = products.filter((product) => {
      const categoryMatches =
        selectedCategory === "همه" ||
        product.category === selectedCategory;

      const searchMatches =
        query.length === 0 ||
        product.name.toLowerCase().includes(query) ||
        product.category.toLowerCase().includes(query) ||
        product.vendorName.toLowerCase().includes(query);

      const price = parseDisplayedPrice(product.price);
      const minPrice = parsePriceFilter(minPriceInput);
      const maxPrice = parsePriceFilter(maxPriceInput);
      const minMatches = minPrice === undefined || price >= minPrice;
      const maxMatches = maxPrice === undefined || price <= maxPrice;
      const stockMatches = !inStockOnly || product.inStock !== false;
      return categoryMatches && searchMatches && minMatches && maxMatches && stockMatches;
    });
    if (sort === "newest") return matches;
    return matches.sort((left, right) => sort === "price-asc"
      ? parseDisplayedPrice(left.price) - parseDisplayedPrice(right.price)
      : parseDisplayedPrice(right.price) - parseDisplayedPrice(left.price));
  }, [demoMode, products, search, selectedCategory, sort, minPriceInput, maxPriceInput, inStockOnly, priceRangeInvalid]);

  async function loadMoreProducts() {
    if (demoMode || catalogLoading || !hasMore || !cursor) return;

    activeCatalogRequest.current?.abort();
    const controller = new AbortController();
    activeCatalogRequest.current = controller;
    setCatalogLoading(true);
    setCatalogError(null);

    try {
      const payload = await fetchCatalogPage(
        search.trim(),
        selectedCategory,
        cursor,
        sort,
        parsePriceFilter(minPriceInput),
        parsePriceFilter(maxPriceInput),
        inStockOnly,
        controller.signal,
      );

      if (controller.signal.aborted) return;
      const nextProducts = payload.products.map(toStorefrontProduct);
      setProducts((currentProducts) => {
        const productsById = new Map(
          currentProducts.map((product) => [product.id, product]),
        );
        for (const product of nextProducts) {
          productsById.set(product.id, product);
        }
        return [...productsById.values()];
      });
      setCursor(payload.nextCursor);
      setHasMore(payload.hasMore);
    } catch {
      if (!controller.signal.aborted) {
        setCatalogError("بارگذاری محصولات بیشتر انجام نشد. دوباره تلاش کنید.");
      }
    } finally {
      if (!controller.signal.aborted) setCatalogLoading(false);
      if (activeCatalogRequest.current === controller) {
        activeCatalogRequest.current = null;
      }
    }
  }

  function addToCart(product: Product) {
    const currentQuantity = cartItems.find((item) => item.product.id === product.id)?.quantity ?? 0;
    setCartItems((currentItems) => {
      const existingIndex = currentItems.findIndex(
        (item) => item.product.id === product.id,
      );

      if (existingIndex === -1) {
        return [...currentItems, { product, quantity: 1 }];
      }

      const nextItems = [...currentItems];
      const existingItem = nextItems[existingIndex];

      nextItems[existingIndex] = {
        ...existingItem,
        quantity: existingItem.quantity + 1,
      };

      return nextItems;
    });
    setCartAnnouncement(`${product.name} به سبد خرید اضافه شد. تعداد: ${(currentQuantity + 1).toLocaleString("fa-IR")}.`);
  }

  function moveToFuture(product: Product) {
    const cartItem = cartItems.find(
      (item) => item.product.id === product.id,
    );

    if (!cartItem) return;

    const alreadyInFuture = futureItems.some(
      (item) => item.id === product.id,
    );

    const nextFutureItems = alreadyInFuture
      ? futureItems
      : [...futureItems, product];

    const nextCartItems = cartItems.filter(
      (item) => item.product.id !== product.id,
    );

    setFutureItems(nextFutureItems);
    setCartItems(nextCartItems);
    setCartAnnouncement(`${product.name} به سبد خرید آینده منتقل شد.`);
  }

  function moveToCart(product: Product) {
    const nextFutureItems = futureItems.filter(
      (item) => item.id !== product.id,
    );

    const existingIndex = cartItems.findIndex(
      (item) => item.product.id === product.id,
    );

    let nextCartItems: CartItem[];

    if (existingIndex === -1) {
      nextCartItems = [...cartItems, { product, quantity: 1 }];
    } else {
      nextCartItems = [...cartItems];
      const existingItem = nextCartItems[existingIndex];

      nextCartItems[existingIndex] = {
        ...existingItem,
        quantity: existingItem.quantity + 1,
      };
    }

    setFutureItems(nextFutureItems);
    setCartItems(nextCartItems);
    setCartAnnouncement(`${product.name} به سبد خرید برگشت.`);
  }

  function removeFromCart(product: Product) {
    const existingItem = cartItems.find((item) => item.product.id === product.id);
    if (!existingItem) return;
    setCartItems((currentItems) => {
      const existingIndex = currentItems.findIndex(
        (item) => item.product.id === product.id,
      );

      if (existingIndex === -1) return currentItems;

      const existingItem = currentItems[existingIndex];

      if (existingItem.quantity <= 1) {
        return currentItems.filter(
          (item) => item.product.id !== product.id,
        );
      }

      const nextItems = [...currentItems];

      nextItems[existingIndex] = {
        ...existingItem,
        quantity: existingItem.quantity - 1,
      };

      return nextItems;
    });
    setCartAnnouncement(existingItem.quantity <= 1
      ? `${product.name} از سبد خرید حذف شد.`
      : `یک عدد از ${product.name} کم شد. تعداد باقی‌مانده: ${(existingItem.quantity - 1).toLocaleString("fa-IR")}.`);
  }

  function removeFromFuture(product: Product) {
    if (!futureItems.some((item) => item.id === product.id)) return;
    setFutureItems((currentItems) => {
      return currentItems.filter((item) => item.id !== product.id);
    });
    setCartAnnouncement(`${product.name} از سبد خرید آینده حذف شد.`);
  }

  function clearCart() {
    setCartItems([]);
    setCartAnnouncement("سبد خرید خالی شد.");
  }

  function clearFutureItems() {
    setFutureItems([]);
    setCartAnnouncement("سبد خرید آینده خالی شد.");
  }

  function selectCategory(category: string) {
    setSelectedCategory(category);
    setMegaMenuOpen(false);
    setMobileMenuOpen(false);
  }

  return (
    <div
      dir="rtl"
      className="market-home min-h-screen bg-slate-50 text-slate-800"
    >
      <a href="#main-content" className="market-skip-link">
        رفتن به محتوای اصلی
      </a>
      <p role="status" aria-live="polite" className="sr-only">{cartAnnouncement}</p>
      {demoMode && (
        <div className="bg-amber-100 px-4 py-2 text-center text-sm font-bold text-amber-900">
          این محصولات نمونه نمایشی‌اند؛ قیمت و موجودی واقعی نیست.
        </div>
      )}

      {catalogError && !demoMode && !priceRangeInvalid && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-center gap-3 bg-rose-50 px-4 py-3 text-sm text-rose-800"
        >
          <span>{catalogError}</span>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="font-black underline underline-offset-4"
          >
            تلاش دوباره
          </button>
        </div>
      )}

      {publicCatalogOnly && (
        <div className="market-promo px-4 py-2 text-center text-xs leading-6 text-white" role="status">
          این نسخه برای مشاهدهٔ کاتالوگ است؛ ورود، ثبت سفارش و پذیرش فروشنده فعلاً فعال نیست.
        </div>
      )}

      <header className="market-header sticky top-0 z-40 border-b bg-white shadow-sm">
        <div className="mx-auto max-w-7xl px-3 py-3 sm:px-4 lg:py-4">
          <div className="flex items-center gap-3">
            {(products.length > 0 || accountAccessEnabled || vendorApplicationsEnabled) && (
              <button
                type="button"
                onClick={() => setMobileMenuOpen((value) => !value)}
                className="rounded-xl p-2 text-slate-700 hover:bg-slate-100 lg:hidden"
                aria-label="منوی موبایل"
                aria-expanded={mobileMenuOpen}
              >
                {mobileMenuOpen ? <CloseIcon /> : <MenuIcon />}
              </button>
            )}

            <Link href="/" aria-label="صفحهٔ اصلی جانان‌کده" className="flex shrink-0 items-center gap-2.5">
              <div className="market-logo-mark h-11 w-11" aria-hidden="true">
                <Image
                  src="/images/janankadeh-logo.webp"
                  alt=""
                  fill
                  sizes="44px"
                  className="market-logo-image"
                />
              </div>

              <div className="hidden leading-tight sm:block">
                <div className="text-base font-black tracking-tight text-slate-900">
                  جانان‌کده
                </div>

                <div className="mt-1 text-[11px] text-slate-500">
                  بازارِ انتخاب‌های خوب
                </div>
              </div>
            </Link>

            {products.length > 0 && <div className="hidden flex-1 px-4 lg:block">
              <div className="mx-auto flex max-w-3xl items-center gap-2">
                <select
                  value={selectedCategory}
                  onChange={(event) =>
                    setSelectedCategory(event.target.value)
                  }
                  className="h-12 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm outline-none focus:border-blue-500"
                  aria-label="انتخاب دسته‌بندی"
                >
                  {categoryOptions.map((category) => (
                    <option key={category.value} value={category.value}>
                      {category.label}
                    </option>
                  ))}
                </select>

                <div className="market-search-field relative flex-1 overflow-hidden rounded-xl border">
                  <input
                    type="search"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    aria-label="جست‌وجوی محصول، فروشنده یا دسته‌بندی"
                    placeholder="دنبال چی می‌گردی؟"
                    className="h-12 w-full border-0 bg-transparent px-4 pl-12 text-sm outline-none"
                  />

                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                    <SearchIcon />
                  </span>
                </div>
              </div>
            </div>}

            <div className="relative flex items-center gap-1 sm:gap-2">
              {accountAccessEnabled && (
                <Link
                  href="/account"
                  className="hidden items-center gap-2 rounded-xl px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 lg:flex"
                >
                  <UserIcon />
                  ورود / ثبت‌نام
                </Link>
              )}

              {vendorApplicationsEnabled && (
                <Link
                  href="/seller/apply"
                  className="hidden rounded-xl bg-amber-400 px-3 py-2.5 text-sm font-black text-slate-900 transition hover:bg-amber-300 lg:block"
                >
                  پنل فروشندگان
                </Link>
              )}

              {checkoutEnabled && (
                <button
                  type="button"
                  className="relative rounded-xl p-2.5 text-slate-700 hover:bg-slate-100"
                  aria-label="سبد خرید"
                  aria-expanded={cartOpen}
                  onClick={() => setCartOpen((open) => !open)}
                >
                  <CartIcon />

                  {cartCount > 0 && (
                    <span className="absolute -left-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-black text-white">
                      {cartCount}
                    </span>
                  )}
                </button>
              )}

              {checkoutEnabled && cartOpen && (
                <div className="absolute left-0 top-full z-50 mt-2 max-h-[75vh] w-[min(90vw,360px)] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-4 shadow-xl">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <h2 className="text-base font-black text-slate-900">
                      سبد خرید
                    </h2>

                    <button
                      type="button"
                      onClick={() => setCartOpen(false)}
                      className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                      aria-label="بستن سبد خرید"
                    >
                      <CloseIcon />
                    </button>
                  </div>

                  <Link
                    href="/cart"
                    onClick={() => setCartOpen(false)}
                    className="mb-3 block rounded-xl bg-blue-50 px-3 py-2.5 text-center text-sm font-bold text-blue-800 hover:bg-blue-100"
                  >
                    بررسی قیمت و موجودی از سرور
                  </Link>

                  {cartItems.length > 0 && (
                    <button
                      type="button"
                      onClick={clearCart}
                      className="mb-3 rounded-lg bg-red-100 px-3 py-2 text-xs font-bold text-red-800 hover:bg-red-200"
                    >
                      خالی کردن سبد خرید
                    </button>
                  )}

                  {cartItems.length === 0 ? (
                    <p className="text-sm text-slate-500">
                      سبد خرید خالی است.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {cartItems.map((item) => (
                        <div
                          key={item.product.id}
                          className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3"
                        >
                          <div className="min-w-0">
                            <p className="font-bold text-slate-800">
                              {item.product.name}
                            </p>

                            <p className="mt-1 text-xs text-slate-500">
                              {item.product.price} تومان • تعداد:{" "}
                              {item.quantity}
                            </p>
                          </div>

                          <div className="flex shrink-0 flex-col gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                moveToFuture(item.product)
                              }
                              aria-label={`انتقال ${item.product.name} به سبد آینده`}
                              className="rounded-lg bg-amber-100 px-2 py-2 text-xs font-bold text-amber-800 hover:bg-amber-200"
                            >
                              سبد آینده
                            </button>

                            <button
                              type="button"
                              onClick={() =>
                                removeFromCart(item.product)
                              }
                              aria-label={`کاهش تعداد ${item.product.name} در سبد خرید`}
                              className="rounded-lg bg-red-100 px-2 py-2 text-xs font-bold text-red-800 hover:bg-red-200"
                            >
                              حذف
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="mt-5 border-t border-slate-200 pt-4">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <h3 className="text-sm font-black text-slate-900">
                        سبد خرید آینده
                      </h3>

                      {futureItems.length > 0 && (
                        <button
                          type="button"
                          onClick={clearFutureItems}
                          aria-label="خالی کردن سبد خرید آینده"
                          className="rounded-lg bg-red-100 px-3 py-2 text-xs font-bold text-red-800 hover:bg-red-200"
                        >
                          خالی کردن
                        </button>
                      )}
                    </div>

                    {futureItems.length === 0 ? (
                      <p className="text-sm text-slate-500">
                        سبد خرید آینده خالی است.
                      </p>
                    ) : (
                      <div className="space-y-3">
                        {futureItems.map((item) => (
                          <div
                            key={item.id}
                            className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3"
                          >
                            <div className="min-w-0">
                              <p className="font-bold text-slate-800">
                                {item.name}
                              </p>

                              <p className="mt-1 text-xs text-slate-500">
                                {item.price} تومان
                              </p>
                            </div>

                            <div className="flex shrink-0 flex-col gap-2">
                              <button
                                type="button"
                                onClick={() => moveToCart(item)}
                                aria-label={`بازگرداندن ${item.name} به سبد خرید`}
                                className="rounded-lg bg-emerald-100 px-2 py-2 text-xs font-bold text-emerald-800 hover:bg-emerald-200"
                              >
                                بازگشت به سبد
                              </button>

                              <button
                                type="button"
                                onClick={() =>
                                  removeFromFuture(item)
                                }
                                aria-label={`حذف ${item.name} از سبد آینده`}
                                className="rounded-lg bg-red-100 px-2 py-2 text-xs font-bold text-red-800 hover:bg-red-200"
                              >
                                حذف
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {products.length > 0 && <div className="market-mobile-search relative mt-3 lg:hidden">
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            aria-label="جست‌وجوی محصول، فروشنده یا دسته‌بندی"
            placeholder="جست‌وجوی کالا و فروشگاه"
            className="market-search-field h-11 w-full rounded-xl border px-4 pl-12 text-sm outline-none"
          />
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
            <SearchIcon />
          </span>
        </div>}

        {(products.length > 0 || vendorApplicationsEnabled) && <div className="hidden border-t border-slate-100 lg:block">
          <div className="mx-auto flex max-w-7xl items-center gap-1 px-4">
            {products.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={() => setMegaMenuOpen((value) => !value)}
                  className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-black transition ${
                    megaMenuOpen
                      ? "border-blue-600 text-blue-600"
                      : "border-transparent text-slate-800 hover:text-blue-600"
                  }`}
                  aria-expanded={megaMenuOpen}
                >
                  <MenuIcon />
                  دسته‌بندی کالاها
                </button>

                <a
                  href="#products"
                  className="border-b-2 border-transparent px-4 py-3 text-sm text-slate-600 hover:border-blue-600 hover:text-blue-600"
                >
                  محصولات
                </a>
              </>
            )}

            {vendorApplicationsEnabled && (
              <Link
                href="/seller/apply"
                className="border-b-2 border-transparent px-4 py-3 text-sm text-slate-600 hover:border-blue-600 hover:text-blue-600"
              >
                فروشنده شوید
              </Link>
            )}
          </div>
        </div>}

        {products.length > 0 && megaMenuOpen && (
          <div className="hidden border-t border-slate-100 bg-white lg:block">
            <div className="mx-auto max-w-7xl px-4 py-6">
              <div className="grid grid-cols-5 gap-4">
                {CATEGORIES.map((category) => (
                  <div
                    key={category.title}
                    className="rounded-2xl border border-slate-100 p-4 transition hover:border-blue-200 hover:bg-blue-50/40"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        if (category.title === "موبایل و دیجیتال") {
                          selectCategory("الکترونیک");
                        } else if (category.title === "مد و پوشاک") {
                          selectCategory("پوشاک");
                        } else {
                          selectCategory("همه");
                        }
                      }}
                      className="mb-4 flex w-full items-center gap-3 text-right"
                    >
                      <span
                        className={`flex h-11 w-11 items-center justify-center rounded-xl text-2xl ${category.color}`}
                      >
                        {category.icon}
                      </span>

                      <span className="text-sm font-black text-slate-800">
                        {category.title}
                      </span>
                    </button>

                    <div className="space-y-2">
                      {category.items.map((item) => (
                        <a
                          key={item}
                          href="#products"
                          className="block text-xs text-slate-500 transition hover:text-blue-600"
                        >
                          {item}
                        </a>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {mobileMenuOpen && (products.length > 0 || accountAccessEnabled || vendorApplicationsEnabled) && (
          <div className="border-t border-slate-100 bg-white px-4 py-4 lg:hidden">
            {products.length > 0 && (
              <>
                <div className="mb-3 rounded-xl bg-blue-50 p-3 text-sm font-bold text-blue-700">
                  دسته‌بندی کالاها
                </div>

                <div className="grid grid-cols-2 gap-2">
                  {categoryOptions.map((category) => (
                    <button
                      key={category.value}
                      type="button"
                      onClick={() => selectCategory(category.value)}
                      className="rounded-xl bg-slate-50 px-3 py-3 text-right text-sm text-slate-700 hover:bg-blue-50"
                    >
                      {category.label}
                    </button>
                  ))}
                </div>
              </>
            )}

            <div className="mt-4 space-y-1 border-t border-slate-100 pt-3">
              {accountAccessEnabled && (
                <Link href="/account" className="block rounded-lg p-3 text-sm hover:bg-slate-50">
                  ورود / ثبت‌نام
                </Link>
              )}

              {vendorApplicationsEnabled && (
                <Link
                  href="/seller/apply"
                  className="block rounded-lg bg-amber-400 p-3 text-center text-sm font-black"
                >
                  پنل فروشندگان
                </Link>
              )}
            </div>
          </div>
        )}
      </header>

      <main id="main-content" tabIndex={-1}>
      <section className="market-hero" aria-labelledby="market-hero-title">
        <div className="market-hero-inner">
          <div className="market-hero-copy">
            <span className="market-hero-eyebrow">
              {publicCatalogOnly && products.length === 0 ? "بازارگاه آنلاین جانان‌کده" : "از نیازهای روزمره تا انتخاب‌های خاص"}
            </span>
            <h1 id="market-hero-title" className="market-hero-title">
              {publicCatalogOnly && products.length === 0
                ? <>ویترین در حال آماده‌سازی است.</>
                : <>هر انتخاب خوب، از <em>جانان‌کده</em> شروع می‌شود.</>}
            </h1>
            <p className="market-hero-description">
              {publicCatalogOnly && products.length === 0
                ? "نسخهٔ عمومی فعال است؛ نمایش کالاها پس از ثبت و تأیید آغاز می‌شود."
                : "میان کالاها و فروشگاه‌های گوناگون بگرد، انتخابت را پیدا کن و خریدت را ساده‌تر پیش ببر."}
            </p>
            <div className="market-hero-actions">
              <a href="#products" className="market-primary-action">
                {products.length > 0 ? "دیدن محصولات" : "مشاهدهٔ وضعیت ویترین"} <span aria-hidden="true">←</span>
              </a>
              {vendorApplicationsEnabled && (
                <Link href="/seller/apply" className="market-secondary-action">
                  فروشگاهت را بساز
                </Link>
              )}
            </div>
          </div>

          <div className="market-hero-stage">
            <div className="market-hero-art">
              <Image
                src="/images/marketplace-hero-concept-v1.webp"
                alt="چیدمانی از کالاهای متنوع بازارگاه جانان‌کده"
                fill
                preload
                sizes="(max-width: 640px) 100vw, (max-width: 900px) 46vw, 42vw"
              />
            </div>
            <div className="market-hero-depth-cube" aria-hidden="true">
              <span className="market-hero-orbit" />
              <div className="market-hero-cube">
                <span className="market-hero-cube-face market-hero-cube-front" />
                <span className="market-hero-cube-face market-hero-cube-back" />
                <span className="market-hero-cube-face market-hero-cube-right" />
                <span className="market-hero-cube-face market-hero-cube-left" />
                <span className="market-hero-cube-face market-hero-cube-top" />
                <span className="market-hero-cube-face market-hero-cube-bottom" />
              </div>
            </div>
            <div className="market-hero-stamp">
              <strong>چند فروشگاه، یک مقصد</strong>
              <span>انتخاب‌های متنوع در جانان‌کده</span>
            </div>
          </div>
        </div>
      </section>

      {products.length > 0 && <section className="market-benefits" aria-label="ویژگی‌های جانان‌کده">
        <div className="market-benefit">
          <span className="market-benefit-icon" aria-hidden="true">✦</span>
          <div><strong>انتخاب‌های متنوع</strong><span>دسته‌های گوناگون، در یک جا</span></div>
        </div>
        <div className="market-benefit">
          <span className="market-benefit-icon" aria-hidden="true">⌕</span>
          <div><strong>پیدا کردن آسان</strong><span>جست‌وجو و فیلتر روشن و ساده</span></div>
        </div>
        <div className="market-benefit">
          <span className="market-benefit-icon" aria-hidden="true">◈</span>
          <div><strong>فروشگاه‌های مستقل</strong><span>خرید از فروشندگان بازارگاه</span></div>
        </div>
      </section>}

      <section className="market-category-section" aria-labelledby="market-category-title">
        <div>
          <span className="market-section-kicker">کشف جانان‌کده</span>
          <h2 id="market-category-title" className="market-section-title">از کجا شروع کنیم؟</h2>
        </div>
        <div className="market-category-grid">
          {CATEGORY_SHOWCASE.map((category) => (
            <button
              key={category.title}
              type="button"
              onClick={() => {
                const matchingCategory = categoryOptions.find(
                  (option) =>
                    option.value !== "همه" &&
                    category.filterTerms.some(
                      (term) => option.label.includes(term) || option.value.includes(term),
                    ),
                );
                const demoCategory = demoMode
                  ? categoryOptions.find((option) => option.value === category.demoCategory)
                  : undefined;
                const categoryToSelect = matchingCategory ?? demoCategory;
                if (categoryToSelect) selectCategory(categoryToSelect.value);
                document.getElementById("products")?.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
              className="market-category-tile"
            >
              <span className="market-category-image">
                <Image
                  src={category.image}
                  alt={category.alt}
                  fill
                  sizes="(max-width: 640px) 48vw, (max-width: 900px) 45vw, 22vw"
                />
                <span className="market-category-image-shade" aria-hidden="true" />
              </span>
              <span className="market-category-copy">
                <span>
                  <strong>{category.title}</strong>
                  <small>مرور دسته‌بندی</small>
                </span>
                <span className="market-category-arrow" aria-hidden="true">←</span>
              </span>
            </button>
          ))}
        </div>
      </section>

      <section
        id="products"
        className="market-catalog-section mx-auto max-w-7xl px-3 py-8 sm:px-4 lg:py-10"
      >
        <div className="market-catalog-heading mb-5 flex items-center justify-between">
          <div>
            <span className="market-section-kicker">ویترین جانان‌کده</span>
            <h2 className="market-section-title">محصولات منتخب</h2>

            <p className="mt-2 text-sm text-slate-500">
              کالاهایی که می‌توانی از فروشگاه‌های بازارگاه بررسی کنی.
            </p>
          </div>

          <span className="text-sm text-slate-500">
            {filteredProducts.length} محصول
          </span>
        </div>

        {showCatalogControls && (
          <>
        <div className="market-category-filters mb-7 flex gap-3 overflow-x-auto pb-2">
          {categoryOptions.map((category) => (
            <button
              key={category.value}
              type="button"
              onClick={() => setSelectedCategory(category.value)}
              className={`market-filter-pill whitespace-nowrap rounded-full px-4 py-2 text-sm font-bold ${selectedCategory === category.value ? "is-active" : ""}`}
            >
              {category.label}
            </button>
          ))}
        </div>

        <div className="market-filter-panel mb-5 flex flex-wrap items-end gap-3 rounded-2xl border bg-white p-4">
          <label htmlFor="min-price" className="text-xs font-bold text-slate-600">حداقل قیمت (تومان)
            <input id="min-price" inputMode="numeric" value={minPriceInput} onChange={(event) => setMinPriceInput(normalizePriceDigits(event.target.value))} placeholder="بدون محدودیت" className="mt-2 block h-10 w-36 rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-blue-500" />
          </label>
          <label htmlFor="max-price" className="text-xs font-bold text-slate-600">حداکثر قیمت (تومان)
            <input id="max-price" inputMode="numeric" value={maxPriceInput} onChange={(event) => setMaxPriceInput(normalizePriceDigits(event.target.value))} placeholder="بدون محدودیت" className="mt-2 block h-10 w-36 rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-blue-500" />
          </label>
          <label className="flex min-h-10 items-center gap-2 px-2 text-sm font-bold text-slate-700">
            <input type="checkbox" checked={inStockOnly} onChange={(event) => setInStockOnly(event.target.checked)} className="h-4 w-4 accent-blue-700" />
            فقط کالاهای موجود
          </label>
          {(minPriceInput || maxPriceInput || inStockOnly) && <button type="button" onClick={() => { setMinPriceInput(""); setMaxPriceInput(""); setInStockOnly(false); }} className="min-h-10 rounded-lg px-3 text-sm font-bold text-blue-700 hover:bg-blue-50">پاک‌کردن فیلترها</button>}
        </div>
        {priceRangeInvalid && <p role="alert" className="mb-5 text-sm font-bold text-rose-700">حداقل قیمت نمی‌تواند از حداکثر قیمت بیشتر باشد.</p>}

        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <label htmlFor="catalog-sort" className="text-sm font-bold text-slate-700">مرتب‌سازی کالاها</label>
          <select id="catalog-sort" value={sort} onChange={(event) => setSort(event.target.value)} className="min-h-11 min-w-48 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 outline-none focus:border-blue-500">
            <option value="newest">تازه‌ترین کالاها</option>
            <option value="price-asc">ارزان‌ترین</option>
            <option value="price-desc">گران‌ترین</option>
          </select>
        </div>
          </>
        )}

        {catalogLoading && (
          <p role="status" className="mb-4 text-sm text-slate-500">
            در حال دریافت محصولات…
          </p>
        )}

        {filteredProducts.length === 0 ? (
          catalogLoading || catalogError ? null : (
            <div className="market-empty-state rounded-3xl border border-emerald-100 bg-white px-6 py-12 text-center shadow-sm sm:px-12">
              <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-2xl text-emerald-800" aria-hidden="true">
                {hasActiveCatalogFilters ? "⌕" : "✦"}
              </div>
              <h3 className="text-lg font-black text-slate-900">
                {hasActiveCatalogFilters ? "با این فیلترها محصولی پیدا نشد" : "هنوز کالایی برای نمایش منتشر نشده است"}
              </h3>
              {hasActiveCatalogFilters && (
                <p className="mx-auto mt-3 max-w-xl text-sm leading-7 text-slate-600">
                  عبارت جست‌وجو یا فیلترها را تغییر بده و دوباره بررسی کن.
                </p>
              )}
              {hasActiveCatalogFilters && (
                <button
                  type="button"
                  onClick={() => {
                    setSearch("");
                    setSelectedCategory("همه");
                    setMinPriceInput("");
                    setMaxPriceInput("");
                    setInStockOnly(false);
                    setSort("newest");
                  }}
                  className="mt-5 min-h-11 rounded-xl border border-emerald-800 px-5 text-sm font-bold text-emerald-900 transition hover:bg-emerald-50"
                >
                  پاک‌کردن جست‌وجو و فیلترها
                </button>
              )}
            </div>
          )
        ) : (
          <div className="market-product-grid grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
            {filteredProducts.map((product) => (
              <article
                key={product.id}
                className="group overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-lg"
              >
                <div className="market-product-media relative aspect-[4/3] overflow-hidden bg-slate-100">
                  <Link href={product.href ?? "#products"} aria-label={`مشاهدهٔ ${product.name}`} className="absolute inset-0">
                    <Image
                      src={imageErrors[product.id] ? PLACEHOLDER_IMAGE : product.image}
                      alt={product.name || "تصویر محصول"}
                      fill
                      sizes="(max-width: 1279px) 50vw, 300px"
                      className="object-contain transition duration-500 group-hover:scale-105"
                      onError={() => setImageErrors((previousErrors) => previousErrors[product.id] ? previousErrors : { ...previousErrors, [product.id]: true })}
                    />
                  </Link>
                  <span className={`market-product-badge absolute right-3 top-3 rounded-full px-3 py-1 text-xs font-black text-white shadow ${
                    product.inStock === false ? "bg-slate-600" : "bg-blue-600"
                  }`}>
                    {product.badge}
                  </span>
                </div>

                <div className="market-product-body p-4">
                  <p className="market-product-category mb-2 text-xs font-bold">
                    {product.category}
                  </p>

                  <h3 className="market-product-name mb-2 text-sm font-black leading-7">
                    {product.name}
                  </h3>

                  {product.reviewCount !== undefined && product.reviewCount > 0 && product.averageRating !== null && product.averageRating !== undefined && (
                    <p className="mb-2 text-xs font-bold text-amber-700" aria-label={`میانگین امتیاز ${product.averageRating.toLocaleString("fa-IR", { maximumFractionDigits: 1 })} از ۵ بر اساس ${product.reviewCount} دیدگاه`}>
                      <span aria-hidden="true">★</span> {product.averageRating.toLocaleString("fa-IR", { maximumFractionDigits: 1 })} <span className="font-normal text-slate-500">({product.reviewCount.toLocaleString("fa-IR")} دیدگاه)</span>
                    </p>
                  )}

                  <p className="mb-4 text-xs text-slate-500">
                    فروشنده:{" "}
                    {product.vendorHref ? <Link href={product.vendorHref} className="font-bold text-slate-700 hover:text-blue-700 hover:underline" onClick={(event) => event.stopPropagation()}>{product.vendorName}</Link> : <span className="font-bold text-slate-700">{product.vendorName}</span>}
                  </p>

                  <div className="mt-auto flex items-center justify-between gap-2 pt-4">
                    <div>
                      <strong className="market-product-price text-base">
                        {product.price}
                      </strong>

                      <span className="mr-1 text-xs text-slate-500">
                        تومان
                      </span>
                    </div>

                    {checkoutEnabled ? (
                      <button
                        type="button"
                        onClick={() => addToCart(product)}
                        aria-label={product.inStock === false ? `${product.name} ناموجود` : `افزودن ${product.name} به سبد خرید`}
                        disabled={product.inStock === false}
                        className="market-add-button min-h-[40px] rounded-lg px-3 py-2 text-sm font-black disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {product.inStock === false ? "ناموجود" : "افزودن به سبد"}
                      </button>
                    ) : (
                      <span className="text-xs font-bold text-slate-500" role="status">
                        خرید آنلاین غیرفعال
                      </span>
                    )}
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}

        {hasMore && !demoMode && !priceRangeInvalid && (
          <div className="mt-7 text-center">
            <button
              type="button"
              onClick={loadMoreProducts}
              disabled={catalogLoading}
              className="rounded-xl bg-white px-6 py-3 text-sm font-black text-blue-700 shadow-sm transition hover:bg-blue-50 disabled:cursor-wait disabled:opacity-60"
            >
              {catalogLoading ? "در حال بارگذاری…" : "نمایش محصولات بیشتر"}
            </button>
          </div>
        )}
      </section>

      {vendorApplicationsEnabled && (
        <section
          id="vendor-cta"
          className="market-vendor-section mx-auto max-w-7xl px-3 pb-10 sm:px-4"
        >
          <div className="market-vendor-banner flex flex-col items-start justify-between gap-5 px-5 py-7 text-white sm:px-8 sm:py-9 lg:flex-row lg:items-center">
            <div>
              <span className="market-section-kicker text-orange-200">برای فروشندگان</span>
              <h2 className="mb-2 text-2xl font-black sm:text-3xl">
                ویترین خودت را در جانان‌کده بساز
              </h2>

              <p className="max-w-2xl text-sm leading-7 text-emerald-50/80">
                فروشگاهت را معرفی کن، محصولاتت را ثبت کن و در کنار دیگر فروشندگان رشد بده.
              </p>
            </div>

            <Link
              href="/seller/apply"
              className="market-vendor-action px-6 py-3 font-black"
            >
              شروع فروشندگی <span aria-hidden="true">←</span>
            </Link>
          </div>
        </section>
      )}
      </main>

      <footer className="market-footer px-4 py-8 sm:py-10">
        <div className="mx-auto flex w-full max-w-[78rem] flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" aria-label="صفحهٔ اصلی جانان‌کده" className="market-footer-logo">
              <Image src="/images/janankadeh-logo.webp" alt="" fill sizes="56px" />
            </Link>
            <div>
              <Link href="/" className="font-black text-emerald-950">جانان‌کده</Link>
              <p className="mt-1 text-xs leading-6">بازارگاه آنلاین برای پیدا کردن کالاها و فروشگاه‌های تازه.</p>
            </div>
          </div>
          <nav aria-label="پیوندهای پایانی" className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
            <a href="#products" className="transition hover:text-emerald-900">محصولات</a>
            {vendorApplicationsEnabled && <Link href="/seller/apply" className="transition hover:text-emerald-900">فروشندگان</Link>}
            {accountAccessEnabled && <Link href="/account" className="transition hover:text-emerald-900">حساب کاربری</Link>}
          </nav>
        </div>
      </footer>
    </div>
  );
}
