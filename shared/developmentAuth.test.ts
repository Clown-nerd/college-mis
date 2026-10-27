import { describe, expect, it } from "vitest";
import { shouldProvisionLocalStudentRecord } from "./developmentAuth";

describe("development student profile linking", () => {
  it("creates an academic record only for the local student identity", () => {
    expect(shouldProvisionLocalStudentRecord("student")).toBe(true);
    expect(shouldProvisionLocalStudentRecord("applicant")).toBe(false);
    expect(shouldProvisionLocalStudentRecord("faculty")).toBe(false);
  });
});
