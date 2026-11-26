"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { StorefrontProduct } from "@/types/catalog";
import type { SavedAddress } from "@/types/address";
import { MIN_ORDER_TOTAL_TOMAN } from "@/lib/money";

const CART_STORAGE_KEY = "janankadeh-cart";

type CartItem = { product: StorefrontProduct; quantity: number };
type QuoteLine = {
  productId: string;
  name: string | null;
  vendorName: string | null;
  quantity: number;
  unitPriceToman: number | null;
  lineTotalToman: number | null;
  stockQuantity: number;
  available: boolean;
};
type Quote = { lines: QuoteLine[]; totalToman: number; totalExceedsLimit: boolean; canContinue: boolean; quotedAt: string };
type DeliveryAddress = Omit<SavedAddress, "id" | "title">;
const emptyAddress: DeliveryAddress = { recipient: "", phone: "", province: "", city: "", addressLine: "", postalCode: "" };

function formatPrice(value: number) {
  return new Intl.NumberFormat("fa-IR").format(value);
}

function readCart(): CartItem[] {
  try {
    const data: unknown = JSON.parse(window.localStorage.getItem(CART_STORAGE_KEY) ?? "[]");
    if (!Array.isArray(data)) return [];
    return data.flatMap((item): CartItem[] => {
      if (typeof item !== "object" || item === null || !("product" in item) || !("quantity" in item)) return [];
      if (typeof item.product !== "object" || item.product === null || !("id" in item.product) || typeof item.product.id !== "string") return [];
      if (!("name" in item.product) || typeof item.product.name !== "string" || !("price" in item.product) || typeof item.product.price !== "string" || !("image" in item.product) || typeof item.product.image !== "string" || !("vendorName" in item.product) || typeof item.product.vendorName !== "string" || !("category" in item.product) || typeof item.product.category !== "string" || !("badge" in item.product) || typeof item.product.badge !== "string") return [];
      if (!Number.isSafeInteger(item.quantity) || Number(item.quantity) < 1 || Number(item.quantity) > 99) return [];
      return [{ product: item.product as StorefrontProduct, quantity: Number(item.quantity) }];
    });
  } catch {
    return [];
  }
}

export default function CartReview({ isAuthenticated, savedAddresses, checkoutEnabled, liveCheckoutGateEnabled, paymentConfigured }: { isAuthenticated: boolean; savedAddresses: SavedAddress[]; checkoutEnabled: boolean; liveCheckoutGateEnabled: boolean; paymentConfigured: boolean }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [quote, setQuote] = useState<{ key: string; data: Quote } | null>(null);
  const [error, setError] = useState<{ key: string; message: string } | null>(null);
  const [retry, setRetry] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [orderError, setOrderError] = useState<string | null>(null);
  const [selectedAddressId, setSelectedAddressId] = useState("");
  const [address, setAddress] = useState<DeliveryAddress>(emptyAddress);
  const checkoutAttempt = useRef<{ fingerprint: string; key: string } | null>(null);
  const router = useRouter();

  function updateAddress<K extends keyof DeliveryAddress>(field: K, value: DeliveryAddress[K]) {
    setSelectedAddressId("");
    setAddress((current) => ({ ...current, [field]: value }));
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setItems(readCart());
      setLoaded(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    try {
      window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items));
    } catch {
      // The in-memory cart remains usable when browser storage is blocked.
    }
  }, [items, loaded]);

  useEffect(() => {
    if (!loaded || items.length === 0) return;

    const controller = new AbortController();
    const quoteItems = items.map((item) => ({ productId: item.product.id, quantity: item.quantity }));
    const key = JSON.stringify(quoteItems);
    void fetch("/api/cart/quote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: quoteItems }),
      signal: controller.signal,
      cache: "no-store",
    }).then(async (response) => {
      const data: unknown = await response.json();
      if (!response.ok || typeof data !== "object" || data === null || !("lines" in data) || !("totalToman" in data) || !("totalExceedsLimit" in data) || !("canContinue" in data) || !("quotedAt" in data)) {
        throw new Error("در حال حاضر بررسی قیمت و موجودی ممکن نیست.");
      }
      const value = data as Quote;
      if (!Array.isArray(value.lines) || !Number.isSafeInteger(value.totalToman) || typeof value.totalExceedsLimit !== "boolean" || typeof value.canContinue !== "boolean" || typeof value.quotedAt !== "string" || !Number.isFinite(Date.parse(value.quotedAt))) {
        throw new Error("پاسخ بررسی سبد معتبر نیست.");
      }
      setQuote({ key, data: value });
      setError((current) => current?.key === key ? null : current);
    }).catch((reason: unknown) => {
      if (!controller.signal.aborted) setError({
        key,
        message: reason instanceof Error ? reason.message : "بررسی سبد انجام نشد.",
      });
    });

    return () => controller.abort();
  }, [items, loaded, retry]);

  const currentKey = JSON.stringify(items.map((item) => ({ productId: item.product.id, quantity: item.quantity })));
  const currentQuote = quote?.key === currentKey ? quote.data : null;
  const belowPaymentMinimum = Boolean(paymentConfigured && currentQuote && currentQuote.totalToman < MIN_ORDER_TOTAL_TOMAN);
  const currentError = error?.key === currentKey ? error.message : null;
  const quoteLoading = loaded && items.length > 0 && !currentQuote && !currentError;

  function changeQuantity(productId: string, delta: number) {
    setOrderError(null);
    checkoutAttempt.current = null;
    setItems((current) => current.flatMap((item) => {
      if (item.product.id !== productId) return [item];
      const quantity = item.quantity + delta;
      return quantity < 1 ? [] : [{ ...item, quantity: Math.min(quantity, 99) }];
    }));
  }

  async function createOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!checkoutEnabled || !currentQuote?.canContinue || submitting) return;

    const orderItems = items.map((item) => ({ productId: item.product.id, quantity: item.quantity }));
    const expectedPrices = currentQuote.lines.map((line) => ({
      productId: line.productId,
      unitPriceToman: line.unitPriceToman ?? -1,
    }));
    if (expectedPrices.some((line) => line.unitPriceToman < 0)) return;
    const requestAddress = selectedAddressId ? { addressId: selectedAddressId } : address;
    const fingerprint = JSON.stringify({ orderItems, expectedPrices, address: requestAddress });
    if (checkoutAttempt.current?.fingerprint !== fingerprint) {
      checkoutAttempt.current = { fingerprint, key: crypto.randomUUID() };
    }

    setSubmitting(true);
    setOrderError(null);
    try {
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": checkoutAttempt.current.key,
        },
        body: JSON.stringify({ items: orderItems, expectedPrices, ...(selectedAddressId ? { addressId: selectedAddressId } : { address }) }),
        cache: "no-store",
      });
      const result: unknown = await response.json();
      if (!response.ok || typeof result !== "object" || result === null || !("orderId" in result) || typeof result.orderId !== "string") {
        const errorMessage = typeof result === "object" && result !== null && "error" in result && typeof result.error === "string"
          ? result.error
          : "ثبت سفارش انجام نشد. دوباره تلاش کنید.";
        const errorCode = typeof result === "object" && result !== null && "code" in result && typeof result.code === "string"
          ? result.code
          : null;
        if (response.status === 409 && (errorCode === "PRICE_CHANGED" || errorCode === "CART_CHANGED")) {
          checkoutAttempt.current = null;
          setQuote(null);
          setOrderError(errorCode === "PRICE_CHANGED"
            ? "قیمت یکی از کالاها تغییر کرده است. قیمت و جمع تازه را بررسی کنید و سپس سفارش را دوباره ثبت کنید."
            : "موجودی یا وضعیت یکی از کالاها تغییر کرده است. سبد تازه بررسی شد؛ پیش از ثبت دوباره، موجودی و قیمت را مرور کنید.");
          setRetry((value) => value + 1);
          return;
        }
        if (response.status === 409) checkoutAttempt.current = null;
        throw new Error(response.status === 401 ? "برای ثبت سفارش ابتدا وارد حساب شوید." : errorMessage);
      }

      window.localStorage.setItem(CART_STORAGE_KEY, "[]");
      window.dispatchEvent(new Event("janankadeh:cart-changed"));
      setItems([]);
      router.push(`/orders/${encodeURIComponent(result.orderId)}`);
    } catch (reason) {
      setOrderError(reason instanceof Error ? reason.message : "ثبت سفارش انجام نشد. دوباره تلاش کنید.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main dir="rtl" className="min-h-screen bg-slate-50 px-4 py-10">
      <div className="mx-auto max-w-4xl">
        <h1 className="text-2xl font-black text-slate-900">بازبینی سبد خرید</h1>
        <p className="mt-2 text-sm leading-7 text-slate-600">قیمت و موجودی در این صفحه مستقیماً از سرور بررسی می‌شود.</p>
        {!liveCheckoutGateEnabled && <p role="status" className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold leading-7 text-amber-900">فروش واقعی تا تکمیل و تأیید فرآیندهای فروشندگان، مالیات، بازگشت وجه و تسویه فعال نمی‌شود.</p>}
        {liveCheckoutGateEnabled && !checkoutEnabled && <p role="status" className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold leading-7 text-amber-900">تنظیمات امن درگاه و نشانی رسمی سایت کامل نیست؛ ثبت سفارش واقعی فعلاً غیرفعال است.</p>}
        {checkoutEnabled && !paymentConfigured && <p role="status" className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold leading-7 text-amber-900">زرین‌پال در این محیط پیکربندی نشده است؛ سفارش محلی ثبت می‌شود و پرداخت واقعی انجام نمی‌گیرد.</p>}

        {currentError && <div role="alert" className="mt-6 rounded-xl bg-rose-50 p-4 text-sm font-bold text-rose-800"><p>{currentError}</p><button type="button" onClick={() => setRetry((value) => value + 1)} className="mt-3 underline">تلاش دوباره</button></div>}
        {loaded && items.length === 0 && <p className="mt-8 rounded-2xl bg-white p-8 text-center text-slate-600">سبد خرید خالی است.</p>}

        {currentQuote && (
          <div className="mt-8 space-y-4">
            <section id="cart-proforma" aria-labelledby="cart-proforma-title" className="print-document rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
              <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-5">
                <div>
                  <p className="text-xs font-black tracking-wide text-emerald-800">جانان‌کده</p>
                  <h2 id="cart-proforma-title" className="mt-2 text-xl font-black text-slate-900">پیش‌فاکتور موقت</h2>
                  <p className="mt-1 text-sm text-slate-500">شناسه سفارش پس از ثبت سفارش صادر می‌شود.</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-xs text-slate-500">
                    زمان بررسی قیمت: <time dateTime={currentQuote.quotedAt}>{new Intl.DateTimeFormat("fa-IR-u-ca-persian", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Tehran" }).format(new Date(currentQuote.quotedAt))}</time>
                  </p>
                  <button type="button" onClick={() => window.print()} className="print-hide min-h-10 rounded-lg border border-slate-300 px-3 text-sm font-bold text-slate-700 hover:bg-slate-50">چاپ پیش‌فاکتور</button>
                  <button type="button" disabled={quoteLoading} onClick={() => {
                    setQuote(null);
                    setError(null);
                    setRetry((value) => value + 1);
                  }} className="print-hide min-h-10 rounded-lg bg-emerald-800 px-3 text-sm font-bold text-white hover:bg-emerald-900 disabled:opacity-50">بررسی دوباره قیمت</button>
                </div>
              </div>
              <div className="mt-5 overflow-x-auto">
                <table className="cart-proforma-table w-full min-w-[620px] text-right text-sm">
                  <thead className="bg-slate-50 text-xs text-slate-600">
                    <tr>
                      <th scope="col" className="px-3 py-3 font-bold">کالا و فروشنده</th>
                      <th scope="col" className="px-3 py-3 font-bold">تعداد</th>
                      <th scope="col" className="px-3 py-3 font-bold">قیمت واحد</th>
                      <th scope="col" className="px-3 py-3 font-bold">جمع ردیف</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {currentQuote.lines.map((line) => (
                      <tr key={line.productId}>
                        <th scope="row" className="px-3 py-3 font-bold text-slate-800">
                          <span className="block">{line.name ?? "کالای ناموجود"}</span>
                          <span className="mt-1 block text-xs font-normal text-slate-500">فروشنده: {line.vendorName ?? "—"}</span>
                          {!line.available && <span className="mt-1 block text-xs font-bold text-rose-700">در حال حاضر قابل سفارش نیست</span>}
                        </th>
                        <td className="px-3 py-3 text-slate-700">{formatPrice(line.quantity)}</td>
                        <td className="px-3 py-3 text-slate-700">{line.unitPriceToman === null ? "—" : formatPrice(line.unitPriceToman) + " تومان"}</td>
                        <td className="px-3 py-3 font-bold text-slate-800">{line.lineTotalToman === null ? "—" : formatPrice(line.lineTotalToman) + " تومان"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <dl className="mt-5 space-y-3 border-t border-slate-200 pt-5 text-sm">
                <div className="flex justify-between gap-4 text-slate-600"><dt>هزینه ارسال</dt><dd>در این نسخه محاسبه نمی‌شود</dd></div>
                <div className="flex justify-between gap-4 text-slate-600"><dt>مالیات</dt><dd>در این نسخه محاسبه نمی‌شود</dd></div>
                <div className="flex justify-between gap-4 border-t border-slate-100 pt-4 text-base font-black text-slate-900"><dt>جمع کالاهای قابل سفارش</dt><dd>{formatPrice(currentQuote.totalToman)} تومان</dd></div>
              </dl>
              <p className="mt-4 rounded-xl bg-amber-50 p-3 text-xs leading-6 text-amber-900">
                این پیش‌فاکتور موقت و غیررسمی است. مبلغ بالا فقط جمع کالاهاست و شامل مالیات یا هزینه ارسال محاسبه‌شده نیست؛ بنابراین مبلغ نهایی پرداخت محسوب نمی‌شود. قیمت و موجودی هنگام ثبت سفارش دوباره در سرور بررسی می‌شود.
              </p>
            </section>
            <div className="print-hide pt-2">
              <h2 className="text-lg font-black text-slate-900">اقلام سبد خرید</h2>
              <p className="mt-1 text-sm text-slate-600">تعداد را تغییر دهید یا کالا را حذف کنید؛ سپس پیش‌فاکتور را دوباره بررسی کنید.</p>
            </div>
            {currentQuote.lines.map((line) => (
              <article key={line.productId} className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <h2 className="font-black text-slate-900">{line.name ?? "این کالا دیگر قابل سفارش نیست"}</h2>
                    {line.vendorName && <p className="mt-1 text-sm text-slate-500">فروشنده: {line.vendorName}</p>}
                    <p className={`mt-2 text-sm font-bold ${line.available ? "text-emerald-700" : "text-rose-700"}`}>
                      {line.available ? `موجودی کافی: ${formatPrice(line.stockQuantity)}` : line.stockQuantity === 0 ? "ناموجود یا غیرفعال" : `فقط ${formatPrice(line.stockQuantity)} عدد موجود است`}
                    </p>
                  </div>
                  <div className="text-left">
                    <p className="font-black text-blue-800">{line.unitPriceToman === null ? "—" : `${formatPrice(line.unitPriceToman)} تومان`}</p>
                    <p className="mt-1 text-xs text-slate-500">جمع این ردیف: {line.lineTotalToman === null ? "—" : `${formatPrice(line.lineTotalToman)} تومان`}</p>
                  </div>
                </div>
                <div className="mt-4 flex items-center gap-3">
                  <button type="button" aria-label="یک عدد کم کن" onClick={() => changeQuantity(line.productId, -1)} className="h-9 w-9 rounded-lg bg-slate-100 font-black">−</button>
                  <span className="min-w-8 text-center font-bold">{formatPrice(line.quantity)}</span>
                  <button type="button" aria-label="یک عدد اضافه کن" onClick={() => changeQuantity(line.productId, 1)} disabled={line.quantity >= 99} className="h-9 w-9 rounded-lg bg-slate-100 font-black disabled:opacity-50">+</button>
                  <button type="button" onClick={() => setItems((current) => current.filter((item) => item.product.id !== line.productId))} className="mr-auto text-sm font-bold text-rose-700">حذف</button>
                </div>
              </article>
            ))}
            <section className="rounded-2xl bg-white p-5 shadow-sm">
              <h2 className="text-lg font-black text-slate-900">ادامهٔ سفارش</h2>
              <p className="mt-2 text-xs leading-6 text-slate-500">پیش از ایجاد سفارش، سرور قیمت و موجودی را دوباره بررسی می‌کند.</p>
              {quoteLoading && <p className="mt-3 text-sm text-slate-500">در حال بررسی سبد…</p>}
              {!currentQuote.canContinue && <p role="alert" className="mt-3 text-sm font-bold text-rose-700">{currentQuote.totalExceedsLimit ? "جمع سفارش از سقف مجاز فراتر است؛ تعداد یا اقلام سبد را کاهش دهید." : "برای ادامه، اقلام ناموجود یا بیش از حد موجودی را اصلاح کنید."}</p>}
              {belowPaymentMinimum && <p role="alert" className="mt-3 text-sm font-bold text-rose-700">حداقل مبلغ پرداخت زرین‌پال {formatPrice(MIN_ORDER_TOTAL_TOMAN)} تومان است؛ مبلغ سبد را افزایش دهید.</p>}
              {currentQuote.canContinue && !belowPaymentMinimum && (
                <form onSubmit={createOrder} className="mt-7 border-t border-slate-100 pt-6">
                  <h2 className="text-lg font-black text-slate-900">نشانی تحویل</h2>
                  {!isAuthenticated ? (
                    <p className="mt-3 text-sm leading-7 text-slate-600">برای ثبت سفارش ابتدا <Link href="/login" className="font-black text-blue-700 underline">وارد حساب کاربری</Link> شوید.</p>
                  ) : (
                    <>
                      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                        <label className="min-w-56 flex-1 text-sm font-bold">انتخاب از دفترچهٔ نشانی‌ها<select value={selectedAddressId} onChange={(event) => {
                          const id = event.target.value;
                          setSelectedAddressId(id);
                          const selected = savedAddresses.find((item) => item.id === id);
                          setAddress(selected ? { recipient: selected.recipient, phone: selected.phone, province: selected.province, city: selected.city, addressLine: selected.addressLine, postalCode: selected.postalCode } : emptyAddress);
                        }} className="mt-2 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 font-normal"><option value="">ثبت نشانی تازه</option>{savedAddresses.map((item) => <option key={item.id} value={item.id}>{item.title} — {item.province}، {item.city}</option>)}</select></label>
                        <Link href="/account/addresses" className="mt-5 text-sm font-bold text-blue-700 underline">مدیریت دفترچهٔ نشانی‌ها</Link>
                      </div>
                      <div className="mt-4 grid gap-4 sm:grid-cols-2">
                        <label className="text-sm font-bold">نام تحویل‌گیرنده<input name="recipient" required minLength={2} maxLength={120} autoComplete="name" value={address.recipient} onChange={(event) => updateAddress("recipient", event.target.value)} className="mt-2 min-h-11 w-full rounded-xl border border-slate-300 px-3 font-normal" /></label>
                        <label className="text-sm font-bold">شمارهٔ موبایل<input name="phone" required type="tel" maxLength={24} autoComplete="tel" value={address.phone} onChange={(event) => updateAddress("phone", event.target.value)} className="mt-2 min-h-11 w-full rounded-xl border border-slate-300 px-3 text-left font-normal" dir="ltr" /></label>
                        <label className="text-sm font-bold">استان<input name="province" required minLength={2} maxLength={100} autoComplete="address-level1" value={address.province} onChange={(event) => updateAddress("province", event.target.value)} className="mt-2 min-h-11 w-full rounded-xl border border-slate-300 px-3 font-normal" /></label>
                        <label className="text-sm font-bold">شهر<input name="city" required minLength={2} maxLength={100} autoComplete="address-level2" value={address.city} onChange={(event) => updateAddress("city", event.target.value)} className="mt-2 min-h-11 w-full rounded-xl border border-slate-300 px-3 font-normal" /></label>
                        <label className="text-sm font-bold sm:col-span-2">نشانی کامل<input name="addressLine" required minLength={8} maxLength={1000} autoComplete="street-address" value={address.addressLine} onChange={(event) => updateAddress("addressLine", event.target.value)} className="mt-2 min-h-11 w-full rounded-xl border border-slate-300 px-3 font-normal" /></label>
                        <label className="text-sm font-bold">کد پستی ۱۰ رقمی<input name="postalCode" required inputMode="numeric" minLength={10} maxLength={10} autoComplete="postal-code" value={address.postalCode} onChange={(event) => updateAddress("postalCode", event.target.value)} className="mt-2 min-h-11 w-full rounded-xl border border-slate-300 px-3 font-normal" /></label>
                      </div>
                      {orderError && <p role="alert" className="mt-4 rounded-xl bg-rose-50 p-3 text-sm font-bold text-rose-800">{orderError}</p>}
                      <p className="mt-4 text-xs leading-6 text-slate-500">پس از ثبت سفارش، جزئیات آن نمایش داده می‌شود. اگر زرین‌پال برای این محیط پیکربندی شده باشد، پرداخت از صفحهٔ سفارش آغاز می‌شود؛ موجودی سفارش‌های پرداخت‌نشده حداکثر ۲۰ دقیقه رزرو می‌ماند.</p>
                      <button type="submit" disabled={!checkoutEnabled || submitting || quoteLoading} className="mt-4 min-h-12 w-full rounded-xl bg-blue-700 px-5 py-3 font-black text-white transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60">
                        {submitting ? "در حال ثبت سفارش…" : checkoutEnabled ? "ثبت سفارش و ادامه" : "ثبت سفارش فعلاً غیرفعال است"}
                      </button>
                    </>
                  )}
                </form>
              )}
            </section>
          </div>
        )}
        {quoteLoading && !currentQuote && <p aria-live="polite" className="mt-8 rounded-2xl bg-white p-6 text-center text-sm text-slate-500">در حال بررسی قیمت و موجودی کالاها…</p>}
      </div>
    </main>
  );
}
