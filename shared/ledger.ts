export type LedgerPayment = { amountCents: number; reconciliationStatus: string; paidAt: Date | string | null; gatewayReference: string; invoiceNumber: string; legalFirstName: string; legalLastName: string; studentNumber: string; gatewayStatus: string };

export function filterAndSortLedger<T extends LedgerPayment>(payments: T[], filter: string, sort: string) {
  const filtered = filter === "all" ? [...payments] : payments.filter(payment => payment.reconciliationStatus === filter);
  return filtered.sort((a, b) => sort === "amount_high" ? b.amountCents - a.amountCents : sort === "amount_low" ? a.amountCents - b.amountCents : new Date(b.paidAt || 0).getTime() - new Date(a.paidAt || 0).getTime());
}

export function ledgerToCsv(payments: LedgerPayment[]) {
  const rows = [["Gateway reference", "Invoice", "Student", "Amount USD", "Gateway status", "Reconciliation status", "Settled at"], ...payments.map(payment => [payment.gatewayReference, payment.invoiceNumber, `${payment.legalFirstName} ${payment.legalLastName} (${payment.studentNumber})`, (payment.amountCents / 100).toFixed(2), payment.gatewayStatus, payment.reconciliationStatus, payment.paidAt ? new Date(payment.paidAt).toISOString() : ""])];
  return rows.map(row => row.map(value => `"${String(value).replaceAll('"', '""')}"`).join(",")).join("\n");
}
