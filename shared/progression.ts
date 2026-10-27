import { calculateGpa } from "./academic";

export type PublishedTermResult = { termId: number; termName: string; termCode: string; startsAt: Date; courseCode: string; courseTitle: string; credits: number; letterGrade: string; gradePointsTimes100: number };
export function aggregateTermProgression(rows: PublishedTermResult[]) {
  const byTerm = new Map<number, PublishedTermResult[]>();
  for (const row of rows) byTerm.set(row.termId, [...(byTerm.get(row.termId) || []), row]);
  return Array.from(byTerm.values()).map(termRows => {
    const first = termRows[0];
    const attemptedCredits = termRows.reduce((total, row) => total + row.credits, 0);
    const completedCredits = termRows.filter(row => row.letterGrade !== "F").reduce((total, row) => total + row.credits, 0);
    return { termId: first.termId, termName: first.termName, termCode: first.termCode, startsAt: first.startsAt, attemptedCredits, completedCredits, gpa: calculateGpa(termRows.map(row => ({ credits: row.credits, gradePointsTimes100: row.gradePointsTimes100 }))), results: termRows.map(({ termId: _termId, termName: _termName, termCode: _termCode, startsAt: _startsAt, ...result }) => result) };
  });
}
