import { describe, expect, it } from "vitest";
import { remainingInvoiceBalance } from "./payments";
import { timeRangesOverlap } from "./schedule";

describe("simulated fee settlement policy", () => {
  it("calculates a remaining invoice balance without allowing overpayment", () => {
    expect(remainingInvoiceBalance(12_500, 4_000)).toBe(8_500);
    expect(remainingInvoiceBalance(12_500, 12_500)).toBe(0);
    expect(() => remainingInvoiceBalance(12_500, 12_501)).toThrow("cannot exceed");
  });
});

describe("timetable overlap policy", () => {
  it("identifies overlapping classes while allowing adjacent class meetings", () => {
    expect(timeRangesOverlap("09:00", "10:30", "10:00", "11:00")).toBe(true);
    expect(timeRangesOverlap("09:00", "10:00", "10:00", "11:00")).toBe(false);
    expect(timeRangesOverlap("13:00", "14:00", "09:00", "12:00")).toBe(false);
  });
});
