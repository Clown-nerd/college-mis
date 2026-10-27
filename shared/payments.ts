export function remainingInvoiceBalance(balanceCents: number, paymentCents: number) {
  if (!Number.isInteger(balanceCents) || balanceCents <= 0) throw new Error("Invoice must have an outstanding positive balance.");
  if (!Number.isInteger(paymentCents) || paymentCents <= 0) throw new Error("Payment amount must be a positive whole-cent amount.");
  if (paymentCents > balanceCents) throw new Error("The simulated payment cannot exceed the invoice balance.");
  return balanceCents - paymentCents;
}
