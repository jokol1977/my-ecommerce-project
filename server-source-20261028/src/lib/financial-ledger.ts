import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { ZARINPAL_PROVIDER } from "@/lib/zarinpal";

type VerifiedPayment = {
  id: string;
  orderId: string;
  provider: string;
  amountToman: number;
};

/** Record only the provider-verified capture; allocation, refunds, and payouts are separate future events. */
export async function recordVerifiedPaymentCapture(tx: Prisma.TransactionClient, payment: VerifiedPayment) {
  if (payment.provider !== ZARINPAL_PROVIDER) throw new Error("Only verified ZarinPal payments can be posted to this ledger.");
  if (!Number.isSafeInteger(payment.amountToman) || payment.amountToman <= 0) throw new Error("Verified payment amount is invalid for the ledger.");

  const eventKey = `payment-capture-verified:${payment.id}`;
  const expected = {
    eventType: "PAYMENT_CAPTURE_VERIFIED" as const,
    debitAccount: "GATEWAY_CLEARING" as const,
    creditAccount: "UNALLOCATED_ORDER_FUNDS" as const,
    amountToman: payment.amountToman,
    orderId: payment.orderId,
    paymentId: payment.id,
  };
  const existing = await tx.ledgerTransfer.findUnique({
    where: { eventKey },
    select: { eventType: true, debitAccount: true, creditAccount: true, amountToman: true, orderId: true, paymentId: true },
  });
  if (existing) {
    if (
      existing.eventType !== expected.eventType ||
      existing.debitAccount !== expected.debitAccount ||
      existing.creditAccount !== expected.creditAccount ||
      existing.amountToman !== expected.amountToman ||
      existing.orderId !== expected.orderId ||
      existing.paymentId !== expected.paymentId
    ) {
      throw new Error("An existing ledger event does not match its verified payment.");
    }
    return existing;
  }

  return tx.ledgerTransfer.create({ data: { eventKey, ...expected } });
}
