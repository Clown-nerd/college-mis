import { describe, expect, it } from "vitest";
import { calculateGpa, gradeFromScore } from "./academic";

describe("institutional grading policy", () => {
  it("maps scores to the approved default grade scale", () => {
    expect(gradeFromScore(90)).toEqual({ letterGrade: "A", gradePointsTimes100: 400 });
    expect(gradeFromScore(85)).toEqual({ letterGrade: "A-", gradePointsTimes100: 370 });
    expect(gradeFromScore(80)).toEqual({ letterGrade: "B+", gradePointsTimes100: 330 });
    expect(gradeFromScore(0)).toEqual({ letterGrade: "F", gradePointsTimes100: 0 });
  });

  it("rejects invalid scores rather than silently calculating an outcome", () => {
    expect(() => gradeFromScore(-1)).toThrow("Score must be a whole number from 0 to 100.");
    expect(() => gradeFromScore(75.5)).toThrow("Score must be a whole number from 0 to 100.");
    expect(() => gradeFromScore(101)).toThrow("Score must be a whole number from 0 to 100.");
  });

  it("calculates a credit-weighted GPA and supports a record without completed courses", () => {
    expect(calculateGpa([
      { credits: 3, gradePointsTimes100: 400 },
      { credits: 4, gradePointsTimes100: 300 },
    ])).toBe(3.43);
    expect(calculateGpa([])).toBeNull();
  });
});
