"use client";

type ReceiptPayment = {
  provider: string;
  providerTransactionId: string | null;
  amountToman: number;
  verifiedAt: string;
};

type ReceiptOrder = {
  id: string;
  createdAt: string;
  subtotalToman: number;
  shippingFeeToman: number;
  totalToman: number;
  vendorOrders: Array<{
    id: string;
    vendorName: string;
    items: Array<{ productName: string; quantity: number; unitPriceToman: number }>;
  }>;
};

function formatPrice(value: number) {
  return new Intl.NumberFormat("fa-IR").format(value);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "Asia/Tehran",
  }).format(new Date(value));
}

export default function PaymentReceipt({ order, payments, capturedTotalToman, confirmedPaymentCount }: {
  order: ReceiptOrder;
  payments: ReceiptPayment[];
  capturedTotalToman: number;
  confirmedPaymentCount: number;
}) {
  return (
    <section aria-labelledby="payment-receipt-title" className="print-document mt-7 rounded-2xl border border-emerald-100 bg-white p-5 shadow-sm sm:p-7">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <p className="text-xs font-black tracking-wide text-emerald-800">جانان‌کده</p>
          <h2 id="payment-receipt-title" className="mt-2 text-xl font-black text-slate-900">رسید پرداخت تأییدشده</h2>
          <p className="mt-1 text-sm text-slate-500">پرداخت پس از تأیید سروری درگاه ثبت شده است.</p>
        </div>
        <button type="button" onClick={() => window.print()} className="print-hide min-h-10 rounded-lg border border-slate-300 px-3 text-sm font-bold text-slate-700 hover:bg-slate-50">چاپ یا ذخیره به PDF</button>
      </header>

      <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
        <div><dt className="text-slate-500">شناسه سفارش</dt><dd dir="ltr" className="mt-1 break-all text-right font-mono font-bold text-slate-800">{order.id}</dd></div>
        <div><dt className="text-slate-500">زمان ثبت سفارش</dt><dd className="mt-1 font-bold text-slate-800">{formatDate(order.createdAt)}</dd></div>
      </dl>

      <div className="mt-6 space-y-4">
        <h3 className="font-black text-slate-900">اقلام سفارش</h3>
        {order.vendorOrders.map((vendorOrder) => (
          <section key={vendorOrder.id} className="rounded-xl border border-slate-100 p-4">
            <h4 className="mb-3 text-sm font-black text-slate-800">فروشنده: {vendorOrder.vendorName}</h4>
            <div className="overflow-x-auto">
              <table className="cart-proforma-table w-full min-w-[500px] text-right text-sm">
                <thead className="bg-slate-50 text-xs text-slate-600">
                  <tr>
                    <th scope="col" className="px-3 py-2 font-bold">کالا</th>
                    <th scope="col" className="px-3 py-2 font-bold">تعداد</th>
                    <th scope="col" className="px-3 py-2 font-bold">قیمت واحد</th>
                    <th scope="col" className="px-3 py-2 font-bold">جمع ردیف</th>
                  </tr>
                </thead>
                <tbody>
                  {vendorOrder.items.map((item, index) => (
                    <tr key={item.productName + "-" + index}>
                      <th scope="row" className="px-3 py-2 font-medium text-slate-800">{item.productName}</th>
                      <td className="px-3 py-2 text-slate-700">{formatPrice(item.quantity)}</td>
                      <td className="px-3 py-2 text-slate-700">{formatPrice(item.unitPriceToman)} تومان</td>
                      <td className="px-3 py-2 font-bold text-slate-800">{formatPrice(item.unitPriceToman * item.quantity)} تومان</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))}
      </div>

      <dl className="mt-5 space-y-3 border-t border-slate-200 pt-5 text-sm">
        <div className="flex justify-between gap-4 text-slate-600"><dt>جمع کالاها</dt><dd>{formatPrice(order.subtotalToman)} تومان</dd></div>
        <div className="flex justify-between gap-4 text-slate-600"><dt>هزینه ارسال ثبت‌شده</dt><dd>{formatPrice(order.shippingFeeToman)} تومان</dd></div>
        <div className="flex justify-between gap-4 border-t border-slate-100 pt-4 font-black text-slate-900"><dt>مبلغ سفارش</dt><dd>{formatPrice(order.totalToman)} تومان</dd></div>
        <div className="flex justify-between gap-4 text-emerald-800"><dt>جمع پرداخت‌های تأییدشده ({formatPrice(confirmedPaymentCount)} پرداخت)</dt><dd className="font-black">{formatPrice(capturedTotalToman)} تومان</dd></div>
      </dl>

      <div className="mt-5 space-y-3">
        {payments.map((payment, index) => (
          <div key={(payment.providerTransactionId || payment.verifiedAt) + "-" + index} className="rounded-xl bg-slate-50 p-4 text-sm">
            <p className="font-black text-slate-800">درگاه: {payment.provider === "zarinpal" ? "زرین‌پال" : "درگاه پرداخت"}</p>
            <p className="mt-1 text-slate-600">زمان تأیید: {formatDate(payment.verifiedAt)}</p>
            <p className="mt-1 text-slate-600">مبلغ این پرداخت: {formatPrice(payment.amountToman)} تومان</p>
            {payment.providerTransactionId && <p className="mt-1 text-slate-600">شناسه تراکنش: <span dir="ltr" className="inline-block font-mono">{payment.providerTransactionId}</span></p>}
          </div>
        ))}
      </div>

      {confirmedPaymentCount > payments.length && <p role="status" className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold leading-7 text-amber-900">فقط ۱۰ پرداخت تأییدشدهٔ اخیر نمایش داده شده‌اند؛ جمع بالا همهٔ پرداخت‌های تأییدشده را در بر می‌گیرد.</p>}
      {capturedTotalToman !== order.totalToman && <p role="status" className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold leading-7 text-amber-900">جمع پرداخت‌های تأییدشده با مبلغ سفارش یکسان نیست؛ این مغایرت برای بررسی ثبت شده است. رسید فقط مبالغ تأییدشده را نشان می‌دهد.</p>}
      <p className="mt-5 rounded-xl bg-slate-50 p-4 text-xs leading-6 text-slate-600">این رسید، ثبت پرداخت تأییدشده در سامانه است و فاکتور رسمی یا صورتحساب مالیاتی محسوب نمی‌شود. وضعیت ارسال سفارش جداگانه در همین صفحه نمایش داده می‌شود.</p>
    </section>
  );
}
