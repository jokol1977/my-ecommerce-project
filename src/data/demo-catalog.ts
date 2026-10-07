import type { StorefrontProduct } from "@/types/catalog";

export type DemoProduct = StorefrontProduct;

/** Display-only sample data. It is not authoritative for price, stock, or orders. */
export const DEMO_PRODUCTS: DemoProduct[] = [
  {
    id: 1,
    name: "کیف دستی چرمی",
    category: "اکسسوری",
    vendorName: "خانه چرم ایران",
    price: "۲,۴۵۰,۰۰۰",
    badge: "محبوب",
    inStock: true,
    image:
      "https://images.unsplash.com/photo-1584917865442-de89df76afd3?q=80&w=900",
  },
  {
    id: 2,
    name: "کفش اسپرت روزمره",
    category: "پوشاک",
    vendorName: "پوشاک جانان",
    price: "۱,۸۹۰,۰۰۰",
    badge: "ویژه",
    inStock: true,
    image:
      "https://images.unsplash.com/photo-1542291026-7eec264c27ff?q=80&w=900",
  },
  {
    id: 3,
    name: "لامپ کم مصرف",
    category: "الکترونیک",
    vendorName: "بازار تجهیزات نوین",
    price: "۸۵۰,۰۰۰",
    badge: "جدید",
    inStock: true,
    image:
      "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?q=80&w=900",
  },
  {
    id: 4,
    name: "ساعت هوشمند حرفه‌ای",
    category: "پوشیدنی هوشمند",
    vendorName: "فروشگاه مرکزی جانان",
    price: "۱,۲۵۰,۰۰۰",
    badge: "پرفروش",
    inStock: true,
    image:
      "https://images.unsplash.com/photo-1523275335684-37898b6baf30?q=80&w=900",
  },
];
