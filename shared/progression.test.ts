import { describe, expect, it } from "vitest";
import { aggregateTermProgression } from "./progression";

describe("term progression aggregation", () => {
  it("groups published results by term and derives attempted credits, completed credits, and GPA", () => {
    const progression = aggregateTermProgression([{ termId: 1, termName: "Spring 2026", termCode: "SP26", startsAt: new Date("2026-01-10"), courseCode: "CSC101", courseTitle: "Computing", credits: 3, letterGrade: "A", gradePointsTimes100: 400 }, { termId: 1, termName: "Spring 2026", termCode: "SP26", startsAt: new Date("2026-01-10"), courseCode: "MAT101", courseTitle: "Mathematics", credits: 3, letterGrade: "F", gradePointsTimes100: 0 }]);
    expect(progression).toHaveLength(1);
    expect(progression[0]).toMatchObject({ attemptedCredits: 6, completedCredits: 3, gpa: 2 });
  });
});
