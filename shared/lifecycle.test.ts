import { describe, expect, it } from "vitest";
import { canActivateApplicant } from "./lifecycle";

describe("student activation policy", () => {
  it("allows activation only after a submitted application and approved fee condition", () => {
    expect(canActivateApplicant("submitted", "settled", true)).toBe(true);
    expect(canActivateApplicant("under_review", "waived", true)).toBe(true);
    expect(canActivateApplicant("admitted", "not_required", true)).toBe(true);
  });

  it("blocks activation if the application is not ready or the fee is unresolved", () => {
    expect(canActivateApplicant("inquiry", "settled", true)).toBe(false);
    expect(canActivateApplicant("submitted", "pending", true)).toBe(false);
    expect(canActivateApplicant("declined", "settled", true)).toBe(false);
    expect(canActivateApplicant("submitted", "settled", false)).toBe(false);
  });
});
