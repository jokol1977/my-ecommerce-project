/** Roles are assigned and checked on the server; never trust a role from the browser. */
export type UserRole = "CUSTOMER" | "VENDOR" | "ADMIN";

export type VendorStatus = "PENDING" | "ACTIVE" | "SUSPENDED";
export type UserStatus = "ACTIVE" | "SUSPENDED";

export type ProductStatus =
  | "DRAFT"
  | "PENDING_REVIEW"
  | "ACTIVE"
  | "REJECTED"
  | "ARCHIVED";

export type OrderStatus =
  | "PENDING_PAYMENT"
  | "PAYMENT_REVIEW"
  | "PAID"
  | "PROCESSING"
  | "SHIPPED"
  | "DELIVERED"
  | "CANCELLED"
  | "REFUNDED";

export type PaymentStatus = "PENDING" | "SUCCEEDED" | "FAILED" | "REFUNDED";

export interface User {
  id: string;
  name: string | null;
  email: string;
  role: UserRole;
  status: UserStatus;
  /** ISO 8601 timestamp so the value is safe to serialize through APIs. */
  createdAt: string;
}

export interface VendorProfile {
  id: string;
  userId: string;
  storeName: string;
  slug: string;
  description: string;
  status: VendorStatus;
  createdAt: string;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
  isActive: boolean;
}

export interface Product {
  id: string;
  vendorId: string;
  slug: string;
  name: string;
  description: string;
  /** Whole toman; prices and stock must be re-read on the server at checkout. */
  priceToman: number;
  categoryId: string;
  imageUrl: string;
  stockQuantity: number;
  status: ProductStatus;
  images: ProductImage[];
  createdAt: string;
  updatedAt: string;
}

export interface ProductImage {
  id: string;
  url: string;
  altText: string;
  position: number;
}

export interface Address {
  id: string;
  userId: string;
  title: string;
  recipient: string;
  phone: string;
  province: string;
  city: string;
  addressLine: string;
  postalCode: string;
}

export interface OrderItem {
  id: string;
  vendorOrderId: string;
  productId: string;
  productName: string;
  quantity: number;
  /** Price snapshot in whole toman at the time the order was created. */
  unitPriceToman: number;
}

export interface Order {
  id: string;
  customerId: string;
  status: OrderStatus;
  recipient: string;
  phone: string;
  province: string;
  city: string;
  addressLine: string;
  postalCode: string;
  subtotalToman: number;
  shippingFeeToman: number;
  totalToman: number;
  createdAt: string;
  updatedAt: string;
}

/** Each seller fulfills and updates their own part of a multi-vendor order. */
export interface VendorOrder {
  id: string;
  orderId: string;
  vendorId: string;
  status: OrderStatus;
  items: OrderItem[];
  subtotalToman: number;
  createdAt: string;
  updatedAt: string;
}

export interface Payment {
  id: string;
  orderId: string;
  provider: string;
  providerReference: string | null;
  providerTransactionId: string | null;
  amountToman: number;
  status: PaymentStatus;
  verifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
}
