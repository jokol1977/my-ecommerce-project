import "server-only";
import type { Prisma } from "@/generated/prisma/client";

const EXPIRATION_BATCH_SIZE = 10;
export const ORDER_PAYMENT_WINDOW_MS = 20 * 60_000;
export const ORDER_RESERVATION_MAX_AGE_MS = 30 * 60_000;

export async function releaseExpiredOrderReservations(tx: Prisma.TransactionClient, now = new Date()) {
  const maxAgeCutoff = new Date(now.getTime() - ORDER_RESERVATION_MAX_AGE_MS);
  const expirationCriteria = {
    OR: [
      { paymentExpiresAt: { lte: now } },
      { createdAt: { lte: maxAgeCutoff } },
    ],
  };
  const expiredOrders = await tx.order.findMany({
    where: { status: "PENDING_PAYMENT", ...expirationCriteria },
    orderBy: [{ paymentExpiresAt: "asc" }, { id: "asc" }],
    take: EXPIRATION_BATCH_SIZE,
    select: { id: true, vendorOrders: { select: { items: { select: { productId: true, quantity: true } } } } },
  });

  let releasedCount = 0;
  for (const order of expiredOrders) {
    const canceled = await tx.order.updateMany({
      where: { id: order.id, status: "PENDING_PAYMENT", ...expirationCriteria },
      data: { status: "CANCELLED", paymentExpiresAt: null },
    });
    if (canceled.count !== 1) continue;

    const quantities = new Map<string, number>();
    for (const vendorOrder of order.vendorOrders) {
      for (const item of vendorOrder.items) quantities.set(item.productId, (quantities.get(item.productId) ?? 0) + item.quantity);
    }
    for (const [productId, quantity] of quantities) {
      await tx.product.updateMany({ where: { id: productId }, data: { stockQuantity: { increment: quantity } } });
    }
    await tx.vendorOrder.updateMany({ where: { orderId: order.id, status: "PENDING_PAYMENT" }, data: { status: "CANCELLED" } });
    releasedCount += 1;
  }
  return releasedCount;
}
