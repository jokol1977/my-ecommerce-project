import "server-only";
import type { Prisma } from "@/generated/prisma/client";

export type AdminAuditAction =
  | "CATEGORY_CREATED"
  | "CATEGORY_ACTIVATED"
  | "CATEGORY_DEACTIVATED"
  | "VENDOR_APPROVED"
  | "VENDOR_REJECTED"
  | "PRODUCT_APPROVED"
  | "PRODUCT_REJECTED"
  | "PRODUCT_IMAGE_DELETED"
  | "REVIEW_APPROVED"
  | "REVIEW_REJECTED"
  | "SUPPORT_CASE_UNDER_REVIEW"
  | "SUPPORT_CASE_WAITING_FOR_VENDOR"
  | "SUPPORT_CASE_WAITING_FOR_CUSTOMER"
  | "SUPPORT_CASE_RESOLVED";

export type AdminAuditTarget = "CATEGORY" | "VENDOR" | "PRODUCT" | "PRODUCT_REVIEW" | "SUPPORT_CASE";

export async function recordAdminAuditEvent(
  tx: Prisma.TransactionClient,
  actorUserId: string,
  action: AdminAuditAction,
  targetType: AdminAuditTarget,
  targetId: string,
) {
  await tx.adminAuditEvent.create({
    data: { actorUserId, action, targetType, targetId },
  });
}
