import { describe, expect, it } from "vitest";
import { filterAndSortLedger, ledgerToCsv } from "./ledger";

const payments = [
  { amountCents: 5000, reconciliationStatus: "pending", paidAt: new Date("2026-01-05T09:00:00Z"), gatewayReference: "SIM-01", invoiceNumber: "INV-01", legalFirstName: "Ava", legalLastName: "O'Neil", studentNumber: "2026-001", gatewayStatus: "settled" },
  { amountCents: 9000, reconciliationStatus: "reconciled", paidAt: new Date("2026-01-06T09:00:00Z"), gatewayReference: "SIM-02", invoiceNumber: "INV-02", legalFirstName: "Ben", legalLastName: "Clark", studentNumber: "2026-002", gatewayStatus: "settled" },
];

describe("payment reconciliation ledger", () => {
  it("filters reconciliation states and applies amount-based sorting", () => {
    expect(filterAndSortLedger(payments, "pending", "latest")).toHaveLength(1);
    expect(filterAndSortLedger(payments, "all", "amount_high").map(item => item.gatewayReference)).toEqual(["SIM-02", "SIM-01"]);
  });
  it("generates spreadsheet-safe CSV with escaped quotation marks", () => {
    const csv = ledgerToCsv(payments);
    expect(csv).toContain('"Ava O\'Neil (2026-001)"');
    expect(csv).toContain('"90.00"');
  });
});
