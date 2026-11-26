import type { SupportCaseCategoryValue, SupportCaseStatusValue } from "@/lib/support-cases";

export const SUPPORT_CASE_CATEGORY_LABELS: Record<SupportCaseCategoryValue, string> = {
  DELIVERY: "ارسال و تحویل",
  ITEM_QUALITY: "کیفیت یا مغایرت کالا",
  MISSING_ITEM: "کالای ناقص یا مفقود",
  OTHER: "موضوع دیگر",
};

export const SUPPORT_CASE_STATUS_LABELS: Record<SupportCaseStatusValue, string> = {
  WAITING_FOR_VENDOR: "در انتظار پاسخ فروشنده",
  WAITING_FOR_CUSTOMER: "در انتظار پاسخ شما",
  UNDER_REVIEW: "در حال بررسی مدیر",
  RESOLVED: "حل‌شده",
};
