import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { normalizeIranianMobile } from "@/lib/iranian-input";
import { getPrisma } from "@/lib/prisma";
import { isIranianSmsConfigured, sendIranianSms } from "@/lib/sms";

const MAX_ATTEMPTS = 3;
const BATCH_SIZE = 5;
const LOCK_TIMEOUT_MS = 2 * 60 * 1_000;
const MAX_QUEUE_AGE_MS = 24 * 60 * 60 * 1_000;

type SmsNotificationEvent =
  | { eventType: "ORDER_PAID"; orderId: string }
  | { eventType: "VENDOR_ORDER_SHIPPED"; orderId: string; vendorOrderId: string };

type ClaimedNotification = {
  id: string;
  orderId: string;
  vendorOrderId: string | null;
  eventType: "ORDER_PAID" | "VENDOR_ORDER_SHIPPED";
  attempts: number;
};

type SmsMessage = { to: string; message: string };
type DeliveryResult = "sent" | "retrying" | "failed" | "unsettled";

/** Insert the notification in the same transaction as its order event. */
export async function enqueueOrderSmsNotification(tx: Prisma.TransactionClient, event: SmsNotificationEvent) {
  if (!isIranianSmsConfigured()) return false;

  const eventKey = event.eventType === "ORDER_PAID"
    ? "order-paid:" + event.orderId
    : "vendor-order-shipped:" + event.vendorOrderId;
  const data = event.eventType === "ORDER_PAID"
    ? { eventKey, eventType: event.eventType, orderId: event.orderId }
    : { eventKey, eventType: event.eventType, orderId: event.orderId, vendorOrderId: event.vendorOrderId };

  const result = await tx.smsNotification.createMany({ data: [data], skipDuplicates: true });
  return result.count === 1;
}

async function claimQueuedNotifications() {
  const prisma = getPrisma();
  const now = new Date();
  const staleLockBefore = new Date(now.getTime() - LOCK_TIMEOUT_MS);
  const queueAgeBefore = new Date(now.getTime() - MAX_QUEUE_AGE_MS);

  return prisma.$transaction(async (tx) => {
    await tx.smsNotification.updateMany({
      where: {
        OR: [
          { status: "PENDING", createdAt: { lt: queueAgeBefore } },
          { status: "PROCESSING", attempts: { gte: MAX_ATTEMPTS }, lockedAt: { lt: staleLockBefore } },
          { status: "PROCESSING", createdAt: { lt: queueAgeBefore }, lockedAt: { lt: staleLockBefore } },
        ],
      },
      data: { status: "FAILED", lockedAt: null },
    });

    const claimSql = [
      "WITH candidates AS (",
      '  SELECT "id" FROM "SmsNotification"',
      '  WHERE "createdAt" >= $1 AND (',
      '    ("status" = \'PENDING\' AND "nextAttemptAt" <= $2 AND "attempts" < $3)',
      '    OR ("status" = \'PROCESSING\' AND "lockedAt" < $4 AND "attempts" < $3)',
      '  )',
      '  ORDER BY "nextAttemptAt" ASC, "createdAt" ASC, "id" ASC',
      "  LIMIT $5",
      "  FOR UPDATE SKIP LOCKED",
      ")",
      'UPDATE "SmsNotification" AS notification',
      "SET \"status\" = 'PROCESSING',",
      '    "attempts" = notification."attempts" + 1,',
      '    "lockedAt" = $2,',
      '    "lastAttemptAt" = $2,',
      '    "updatedAt" = $2',
      'FROM candidates WHERE notification."id" = candidates."id"',
      'RETURNING notification."id", notification."orderId", notification."vendorOrderId",',
      '          notification."eventType", notification."attempts"',
    ].join("\n");

    return tx.$queryRawUnsafe<ClaimedNotification[]>(
      claimSql,
      queueAgeBefore,
      now,
      MAX_ATTEMPTS,
      staleLockBefore,
      BATCH_SIZE,
    );
  });
}

async function resolveSmsMessage(notification: ClaimedNotification): Promise<SmsMessage | null> {
  const prisma = getPrisma();
  const reference = notification.orderId.slice(-8).toUpperCase();

  if (notification.eventType === "ORDER_PAID") {
    if (notification.vendorOrderId !== null) return null;
    const order = await prisma.order.findUnique({
      where: { id: notification.orderId },
      select: { phone: true, status: true },
    });
    if (!order || order.status === "PAYMENT_REVIEW") return null;
    if (!normalizeIranianMobile(order.phone)) return null;
    return {
      to: order.phone,
      message: "پرداخت سفارش " + reference + " با موفقیت تأیید شد. جزئیات را در حساب کاربری پیگیری کنید.",
    };
  }

  if (!notification.vendorOrderId) return null;
  const vendorOrder = await prisma.vendorOrder.findUnique({
    where: { id: notification.vendorOrderId },
    select: {
      orderId: true,
      status: true,
      shippedAt: true,
      order: { select: { phone: true } },
    },
  });
  if (
    !vendorOrder ||
    vendorOrder.orderId !== notification.orderId ||
    !vendorOrder.shippedAt ||
    (vendorOrder.status !== "SHIPPED" && vendorOrder.status !== "DELIVERED") ||
    !normalizeIranianMobile(vendorOrder.order.phone)
  ) {
    return null;
  }
  return {
    to: vendorOrder.order.phone,
    message: "بخشی از سفارش " + reference + " ارسال شد. جزئیات و کد رهگیری در حساب کاربری شماست.",
  };
}

async function markPermanentlyFailed(notification: ClaimedNotification) {
  try {
    const result = await getPrisma().smsNotification.updateMany({
      where: { id: notification.id, status: "PROCESSING", attempts: notification.attempts },
      data: { status: "FAILED", lockedAt: null },
    });
    return result.count === 1 ? "failed" as const : "unsettled" as const;
  } catch {
    return "unsettled" as const;
  }
}

async function scheduleRetry(notification: ClaimedNotification) {
  const exhausted = notification.attempts >= MAX_ATTEMPTS;
  const delayMs = notification.attempts === 1 ? 60_000 : 5 * 60_000;
  try {
    const result = await getPrisma().smsNotification.updateMany({
      where: { id: notification.id, status: "PROCESSING", attempts: notification.attempts },
      data: {
        status: exhausted ? "FAILED" : "PENDING",
        nextAttemptAt: new Date(Date.now() + delayMs),
        lockedAt: null,
      },
    });
    if (result.count !== 1) return "unsettled" as const;
    return exhausted ? "failed" as const : "retrying" as const;
  } catch {
    return "unsettled" as const;
  }
}

async function deliverNotification(notification: ClaimedNotification): Promise<DeliveryResult> {
  let sms: SmsMessage | null;
  try {
    sms = await resolveSmsMessage(notification);
  } catch {
    return scheduleRetry(notification);
  }
  if (!sms) return markPermanentlyFailed(notification);

  try {
    await sendIranianSms(sms);
  } catch {
    return scheduleRetry(notification);
  }

  try {
    const result = await getPrisma().smsNotification.updateMany({
      where: { id: notification.id, status: "PROCESSING", attempts: notification.attempts },
      data: { status: "SENT", sentAt: new Date(), lockedAt: null },
    });
    return result.count === 1 ? "sent" : "unsettled";
  } catch {
    return "unsettled";
  }
}

/** Called by the protected minute-level cron. Provider errors never undo an order event. */
export async function processQueuedSmsNotifications() {
  if (!isIranianSmsConfigured()) {
    return { enabled: false, claimed: 0, sent: 0, retrying: 0, failed: 0, unsettled: 0 };
  }

  const claimed = await claimQueuedNotifications();
  const outcomes = await Promise.all(claimed.map(deliverNotification));
  return {
    enabled: true,
    claimed: claimed.length,
    sent: outcomes.filter((outcome) => outcome === "sent").length,
    retrying: outcomes.filter((outcome) => outcome === "retrying").length,
    failed: outcomes.filter((outcome) => outcome === "failed").length,
    unsettled: outcomes.filter((outcome) => outcome === "unsettled").length,
  };
}
