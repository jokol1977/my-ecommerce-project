import { createHash } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import { getPrisma } from "@/lib/prisma";
import { checkAccountRateLimit } from "@/lib/rate-limit";
import { ORDER_RESERVATION_MAX_AGE_MS } from "@/lib/order-reservations";
import { recordVerifiedPaymentCapture } from "@/lib/financial-ledger";
import { enqueueOrderSmsNotification } from "@/lib/sms-outbox";
import { getZarinpalConfiguration, verifyZarinpalPayment, ZARINPAL_PROVIDER } from "@/lib/zarinpal";

export const runtime = "nodejs";
const noStore = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };
const AUTHORITY_PATTERN = /^[A-Za-z0-9]{16,80}$/;
const CLAIM_STALE_MS = 60_000;
const CALLBACK_GRACE_MS = 2 * 60_000;

function orderRedirect(siteOrigin: string, orderId: string | null, result: "success" | "failed" | "processing" | "review") {
  const destination = orderId
    ? new URL(`/orders/${encodeURIComponent(orderId)}`, siteOrigin)
    : new URL("/account/orders", siteOrigin);
  destination.searchParams.set("payment", result);
  return new Response(null, { status: 303, headers: { ...noStore, Location: destination.toString() } });
}

function settledOrderResult(
  orderStatus: string,
  hasProviderTransactionId: boolean,
  paymentAmountMatchesOrder: boolean,
): "success" | "review" {
  return hasProviderTransactionId && paymentAmountMatchesOrder && ["PAID", "PROCESSING", "SHIPPED", "DELIVERED"].includes(orderStatus)
    ? "success"
    : "review";
}

async function flagOrderForPaymentReview(tx: Prisma.TransactionClient, orderId: string) {
  const updated = await tx.order.updateMany({
    where: { id: orderId, status: { not: "PAYMENT_REVIEW" } },
    data: { status: "PAYMENT_REVIEW", paymentExpiresAt: null },
  });
  if (updated.count === 1) {
    await tx.adminAuditEvent.create({
      data: { action: "ZARINPAL_PAYMENT_REQUIRES_REVIEW", targetType: "ORDER", targetId: orderId },
    });
  }
}

async function lockPaymentAndOrder(tx: Prisma.TransactionClient, paymentId: string, orderId: string) {
  await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "Order" WHERE "id" = ${orderId} FOR UPDATE`;
  await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "Payment" WHERE "id" = ${paymentId} FOR UPDATE`;
}

class InventoryUnavailableError extends Error {}

export async function GET(request: Request) {
  const configuration = getZarinpalConfiguration();
  if (!configuration) return Response.json({ error: "پیکربندی زرین‌پال در دسترس نیست." }, { status: 503, headers: noStore });

  const callbackUrl = new URL(request.url);
  const authority = callbackUrl.searchParams.get("Authority") ?? "";
  if (!AUTHORITY_PATTERN.test(authority)) return orderRedirect(configuration.siteOrigin, null, "failed");

  const callbackLimitKey = createHash("sha256").update(`zarinpal-callback:v1\0${authority}`).digest("hex");
  try {
    const callbackLimit = await checkAccountRateLimit("zarinpal-callback", callbackLimitKey, 30, 60 * 60);
    if (!callbackLimit.allowed) return orderRedirect(configuration.siteOrigin, null, "processing");
  } catch {
    return orderRedirect(configuration.siteOrigin, null, "processing");
  }

  const prisma = getPrisma();
  const found = await prisma.payment.findFirst({
    where: { provider: ZARINPAL_PROVIDER, providerReference: authority },
    select: { id: true, orderId: true, status: true, verificationStartedAt: true },
  });
  if (!found) return orderRedirect(configuration.siteOrigin, null, "failed");
  const orderUrl = (result: "success" | "failed" | "processing" | "review") => orderRedirect(configuration.siteOrigin, found.orderId, result);
  if (found.status === "SUCCEEDED") {
    try {
      const orderStatus = await prisma.$transaction(async (tx) => {
        await lockPaymentAndOrder(tx, found.id, found.orderId);
        const payment = await tx.payment.findUnique({
          where: { id: found.id },
          select: { id: true, orderId: true, provider: true, amountToman: true, status: true, providerTransactionId: true },
        });
        if (!payment || payment.status !== "SUCCEEDED") return null;
        await recordVerifiedPaymentCapture(tx, payment);
        const order = await tx.order.findUnique({ where: { id: found.orderId }, select: { status: true, totalToman: true } });
        if (!order) return null;
        const hasProviderTransactionId = Boolean(payment.providerTransactionId);
        const paymentAmountMatchesOrder = payment.amountToman === order.totalToman;
        if (!hasProviderTransactionId || !paymentAmountMatchesOrder) {
          await flagOrderForPaymentReview(tx, found.orderId);
          return { status: "PAYMENT_REVIEW", hasProviderTransactionId, paymentAmountMatchesOrder };
        }
        return { status: order.status, hasProviderTransactionId, paymentAmountMatchesOrder };
      }, { isolationLevel: "Serializable", timeout: 10_000 });
      return orderUrl(orderStatus === null ? "processing" : settledOrderResult(
        orderStatus.status,
        orderStatus.hasProviderTransactionId,
        orderStatus.paymentAmountMatchesOrder,
      ));
    } catch {
      return orderUrl("processing");
    }
  }
  if (found.status === "REFUNDED") return orderUrl("failed");

  const now = new Date();
  const staleBefore = new Date(now.getTime() - CLAIM_STALE_MS);
  type Claim =
    | { kind: "claimed"; amountToman: number; claimedAt: Date }
    | { kind: "settled"; result: "success" | "failed" | "review" }
    | { kind: "busy" | "missing" };
  let claim: Claim;
  try {
    claim = await prisma.$transaction(async (tx): Promise<Claim> => {
      await lockPaymentAndOrder(tx, found.id, found.orderId);
      const payment = await tx.payment.findUnique({
        where: { id: found.id },
        select: { provider: true, providerReference: true, providerTransactionId: true, amountToman: true, status: true, verificationStartedAt: true },
      });
      const order = await tx.order.findUnique({
        where: { id: found.orderId },
        select: { status: true, totalToman: true, createdAt: true, paymentExpiresAt: true },
      });
      if (!payment || !order || payment.provider !== ZARINPAL_PROVIDER || payment.providerReference !== authority) return { kind: "missing" };
      if (payment.status === "SUCCEEDED") {
        await recordVerifiedPaymentCapture(tx, { id: found.id, orderId: found.orderId, provider: payment.provider, amountToman: payment.amountToman });
        const hasProviderTransactionId = Boolean(payment.providerTransactionId);
        const paymentAmountMatchesOrder = payment.amountToman === order.totalToman;
        if (!hasProviderTransactionId || !paymentAmountMatchesOrder) await flagOrderForPaymentReview(tx, found.orderId);
        return {
          kind: "settled",
          result: settledOrderResult(order.status, hasProviderTransactionId, paymentAmountMatchesOrder),
        };
      }
      if (payment.status === "REFUNDED") return { kind: "settled", result: "failed" };
      if (payment.status !== "PENDING" && payment.status !== "FAILED") return { kind: "settled", result: "failed" };
      if (payment.verificationStartedAt && payment.verificationStartedAt > staleBefore) return { kind: "busy" };

      const claimedAt = new Date();
      await tx.payment.update({ where: { id: found.id }, data: { verificationStartedAt: claimedAt } });

      if (order.status === "PENDING_PAYMENT" && order.paymentExpiresAt) {
        const graceEnd = new Date(claimedAt.getTime() + CALLBACK_GRACE_MS);
        const hardEnd = new Date(order.createdAt.getTime() + ORDER_RESERVATION_MAX_AGE_MS);
        const extendedUntil = graceEnd < hardEnd ? graceEnd : hardEnd;
        if (extendedUntil > order.paymentExpiresAt) {
          await tx.order.update({ where: { id: found.orderId }, data: { paymentExpiresAt: extendedUntil } });
        }
      }
      return { kind: "claimed", amountToman: payment.amountToman, claimedAt };
    }, { isolationLevel: "Serializable", timeout: 10_000 });
  } catch {
    return orderUrl("processing");
  }

  if (claim.kind !== "claimed") {
    if (claim.kind === "busy") return orderUrl("processing");
    return orderUrl(claim.kind === "settled" ? claim.result : "failed");
  }

  const verified = await verifyZarinpalPayment({ configuration, authority, amountToman: claim.amountToman });
  if (verified.kind === "indeterminate") {
    await prisma.payment.updateMany({
      where: { id: found.id, status: { in: ["PENDING", "FAILED"] }, verificationStartedAt: claim.claimedAt },
      data: { verificationStartedAt: null },
    }).catch(() => undefined);
    return orderUrl("processing");
  }

  if (verified.kind === "failed") {
    await prisma.payment.updateMany({
      where: { id: found.id, status: { in: ["PENDING", "FAILED"] }, verificationStartedAt: claim.claimedAt },
      data: { status: "FAILED", verificationStartedAt: null },
    }).catch(() => undefined);
    return orderUrl("failed");
  }

  const verifiedAt = new Date();
  try {
    const result = await prisma.$transaction(async (tx) => {
      await lockPaymentAndOrder(tx, found.id, found.orderId);
      const payment = await tx.payment.findUnique({ where: { id: found.id }, select: { id: true, status: true, orderId: true, provider: true, providerTransactionId: true, amountToman: true, verificationStartedAt: true } });
      const order = await tx.order.findUnique({
        where: { id: found.orderId },
        select: {
          status: true,
          totalToman: true,
          vendorOrders: { select: { id: true, items: { select: { productId: true, quantity: true } } } },
        },
      });
      if (!payment || !order) return "failed" as const;
      if (payment.status === "SUCCEEDED") {
        await recordVerifiedPaymentCapture(tx, payment);
        const hasProviderTransactionId = Boolean(payment.providerTransactionId);
        const paymentAmountMatchesOrder = payment.amountToman === order.totalToman;
        if (!hasProviderTransactionId || !paymentAmountMatchesOrder) await flagOrderForPaymentReview(tx, found.orderId);
        return settledOrderResult(order.status, hasProviderTransactionId, paymentAmountMatchesOrder);
      }
      if (payment.status !== "PENDING" && payment.status !== "FAILED") return "failed" as const;

      const otherPotentialPayments = await tx.payment.count({
        where: { orderId: found.orderId, id: { not: found.id }, status: { in: ["PENDING", "SUCCEEDED"] } },
      });
      if (
        verified.transactionId === null ||
        payment.amountToman !== order.totalToman ||
        otherPotentialPayments > 0 ||
        order.status === "PAYMENT_REVIEW" ||
        (order.status !== "PENDING_PAYMENT" && order.status !== "CANCELLED")
      ) {
        await tx.payment.update({
          where: { id: found.id },
          data: { status: "SUCCEEDED", providerTransactionId: verified.transactionId, verifiedAt, verificationStartedAt: null },
        });
        await recordVerifiedPaymentCapture(tx, payment);
        await flagOrderForPaymentReview(tx, found.orderId);
        return "review" as const;
      }

      if (order.status === "CANCELLED") {
        const quantities = new Map<string, number>();
        for (const vendorOrder of order.vendorOrders) {
          for (const item of vendorOrder.items) quantities.set(item.productId, (quantities.get(item.productId) ?? 0) + item.quantity);
        }
        for (const [productId, quantity] of [...quantities.entries()].sort(([left], [right]) => left.localeCompare(right))) {
          const reserved = await tx.product.updateMany({
            where: {
              id: productId,
              status: "ACTIVE",
              stockQuantity: { gte: quantity },
              vendor: { status: "ACTIVE" },
              category: { isActive: true },
            },
            data: { stockQuantity: { decrement: quantity } },
          });
          if (reserved.count !== 1) throw new InventoryUnavailableError();
        }
        await tx.order.update({ where: { id: found.orderId }, data: { status: "PAID", paymentExpiresAt: null } });
        await tx.vendorOrder.updateMany({ where: { orderId: found.orderId, status: "CANCELLED" }, data: { status: "PAID" } });
      } else {
        await tx.order.update({ where: { id: found.orderId }, data: { status: "PAID", paymentExpiresAt: null } });
        await tx.vendorOrder.updateMany({ where: { orderId: found.orderId, status: "PENDING_PAYMENT" }, data: { status: "PAID" } });
      }

      await tx.payment.update({
        where: { id: found.id },
        data: { status: "SUCCEEDED", providerTransactionId: verified.transactionId, verifiedAt, verificationStartedAt: null },
      });
      await recordVerifiedPaymentCapture(tx, payment);
      await enqueueOrderSmsNotification(tx, { eventType: "ORDER_PAID", orderId: found.orderId });
      return "success" as const;
    }, { isolationLevel: "Serializable", timeout: 15_000 });
    return orderUrl(result);
  } catch (error) {
    if (!(error instanceof InventoryUnavailableError)) {
      await prisma.payment.updateMany({
        where: { id: found.id, status: { in: ["PENDING", "FAILED"] }, verificationStartedAt: claim.claimedAt },
        data: { verificationStartedAt: null },
      }).catch(() => undefined);
      console.error("Verified ZarinPal payment could not be finalized automatically.");
      return orderUrl("processing");
    }

    try {
      await prisma.$transaction(async (tx) => {
        await lockPaymentAndOrder(tx, found.id, found.orderId);
        const payment = await tx.payment.findUnique({ where: { id: found.id }, select: { id: true, status: true, orderId: true, provider: true, amountToman: true } });
        const order = await tx.order.findUnique({ where: { id: found.orderId }, select: { status: true } });
        if (!payment || !order || (payment.status !== "PENDING" && payment.status !== "FAILED")) return;
        await tx.payment.update({
          where: { id: found.id },
          data: { status: "SUCCEEDED", providerTransactionId: verified.transactionId, verifiedAt, verificationStartedAt: null },
        });
        await recordVerifiedPaymentCapture(tx, payment);
        await flagOrderForPaymentReview(tx, found.orderId);
      }, { isolationLevel: "Serializable", timeout: 10_000 });
      return orderUrl("review");
    } catch {
      console.error("A verified ZarinPal payment requires manual order and refund review.");
      return orderUrl("processing");
    }
  }
}
