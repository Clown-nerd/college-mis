export type GradeResult = {
  letterGrade: string;
  gradePointsTimes100: number;
};

export type GpaCourse = {
  credits: number;
  gradePointsTimes100: number;
};

/**
 * Default 4.0 grading scale. Institutions should replace this policy with
 * their approved academic regulations before operating with live records.
 */
export function gradeFromScore(score: number): GradeResult {
  if (!Number.isInteger(score) || score < 0 || score > 100) {
    throw new Error("Score must be a whole number from 0 to 100.");
  }

  if (score >= 90) return { letterGrade: "A", gradePointsTimes100: 400 };
  if (score >= 85) return { letterGrade: "A-", gradePointsTimes100: 370 };
  if (score >= 80) return { letterGrade: "B+", gradePointsTimes100: 330 };
  if (score >= 75) return { letterGrade: "B", gradePointsTimes100: 300 };
  if (score >= 70) return { letterGrade: "B-", gradePointsTimes100: 270 };
  if (score >= 65) return { letterGrade: "C+", gradePointsTimes100: 230 };
  if (score >= 60) return { letterGrade: "C", gradePointsTimes100: 200 };
  if (score >= 55) return { letterGrade: "D", gradePointsTimes100: 100 };
  return { letterGrade: "F", gradePointsTimes100: 0 };
}

export function calculateGpa(courses: GpaCourse[]): number | null {
  const attemptedCredits = courses.reduce((total, course) => total + course.credits, 0);
  if (attemptedCredits === 0) return null;

  const qualityPoints = courses.reduce(
    (total, course) => total + (course.gradePointsTimes100 / 100) * course.credits,
    0,
  );

  return Number((qualityPoints / attemptedCredits).toFixed(2));
}
