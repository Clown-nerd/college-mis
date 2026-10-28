import { gradeFromScore } from "./academic";

export const publicationStatusValues = ["draft", "published", "scheduled", "archived"] as const;
export type PublicationStatus = (typeof publicationStatusValues)[number];

export const lateSubmissionPolicyValues = ["accept_with_penalty", "accept_no_penalty", "reject_after_due"] as const;
export type LateSubmissionPolicy = (typeof lateSubmissionPolicyValues)[number];

export const quizQuestionTypeValues = ["multiple_choice", "multiple_select", "true_false", "short_answer", "essay"] as const;
export type QuizQuestionType = (typeof quizQuestionTypeValues)[number];

export const quizReviewPolicyValues = ["immediate", "after_due", "after_release", "never"] as const;
export type QuizReviewPolicy = (typeof quizReviewPolicyValues)[number];

export const gradeItemStatusValues = ["missing", "submitted", "exempt", "draft_grade", "released"] as const;
export type GradeItemStatus = (typeof gradeItemStatusValues)[number];

export interface VisibilityCheckInput {
  status: PublicationStatus;
  publishAt?: Date | string | null;
  availableFrom?: Date | string | null;
  now?: Date;
}

/**
 * Determines whether a course module, page, resource, assignment, or announcement
 * is visible to an enrolled student at `now`.
 */
export function isContentVisibleToStudent(input: VisibilityCheckInput): boolean {
  const now = input.now ?? new Date();
  if (input.status === "draft" || input.status === "archived") {
    return false;
  }
  if (input.status === "scheduled") {
    if (!input.publishAt) return false;
    const pubDate = new Date(input.publishAt);
    if (Number.isNaN(pubDate.getTime()) || pubDate.getTime() > now.getTime()) {
      return false;
    }
  }
  if (input.availableFrom) {
    const availDate = new Date(input.availableFrom);
    if (!Number.isNaN(availDate.getTime()) && availDate.getTime() > now.getTime()) {
      return false;
    }
  }
  return true;
}

export interface SubmissionWindowInput {
  now?: Date;
  status: PublicationStatus;
  publishAt?: Date | string | null;
  availableFrom?: Date | string | null;
  dueAt?: Date | string | null;
  lockAt?: Date | string | null;
  extensionDueAt?: Date | string | null;
  latePolicy: LateSubmissionPolicy;
  maxAttempts: number;
  currentAttempts: number;
  allowResubmission: boolean;
}

export interface SubmissionWindowEvaluation {
  allowed: boolean;
  reason?: string;
  isLate: boolean;
  effectiveDueAt: Date | null;
  daysLate: number;
}

export function evaluateAssignmentSubmissionWindow(input: SubmissionWindowInput): SubmissionWindowEvaluation {
  const now = input.now ?? new Date();
  if (!isContentVisibleToStudent({ status: input.status, publishAt: input.publishAt, availableFrom: input.availableFrom, now })) {
    return {
      allowed: false,
      reason: "This assignment is not currently open for submissions.",
      isLate: false,
      effectiveDueAt: null,
      daysLate: 0,
    };
  }

  if (input.currentAttempts > 0 && !input.allowResubmission) {
    return {
      allowed: false,
      reason: "Resubmissions are not permitted for this assignment.",
      isLate: false,
      effectiveDueAt: null,
      daysLate: 0,
    };
  }

  if (input.maxAttempts > 0 && input.currentAttempts >= input.maxAttempts) {
    return {
      allowed: false,
      reason: `Maximum submission attempts (${input.maxAttempts}) reached.`,
      isLate: false,
      effectiveDueAt: null,
      daysLate: 0,
    };
  }

  const baseDue = input.dueAt ? new Date(input.dueAt) : null;
  const extDue = input.extensionDueAt ? new Date(input.extensionDueAt) : null;
  const effectiveDueAt =
    extDue && !Number.isNaN(extDue.getTime()) && (!baseDue || extDue.getTime() > baseDue.getTime())
      ? extDue
      : baseDue && !Number.isNaN(baseDue.getTime())
        ? baseDue
        : null;

  if (input.lockAt) {
    const lockDate = new Date(input.lockAt);
    const effectiveLock =
      extDue && !Number.isNaN(extDue.getTime()) && extDue.getTime() > lockDate.getTime()
        ? extDue
        : lockDate;
    if (!Number.isNaN(effectiveLock.getTime()) && now.getTime() > effectiveLock.getTime()) {
      return {
        allowed: false,
        reason: "The submission closing date for this assignment has passed.",
        isLate: true,
        effectiveDueAt,
        daysLate: 0,
      };
    }
  }

  let isLate = false;
  let daysLate = 0;
  if (effectiveDueAt && now.getTime() > effectiveDueAt.getTime()) {
    isLate = true;
    const diffMs = now.getTime() - effectiveDueAt.getTime();
    daysLate = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
    if (input.latePolicy === "reject_after_due") {
      return {
        allowed: false,
        reason: "Late submissions are not accepted for this assignment.",
        isLate: true,
        effectiveDueAt,
        daysLate,
      };
    }
  }

  return {
    allowed: true,
    isLate,
    effectiveDueAt,
    daysLate,
  };
}

export function computeAssignmentPenaltyScore(input: {
  rawScore: number;
  maxScore: number;
  isLate: boolean;
  daysLate: number;
  latePolicy: LateSubmissionPolicy;
  latePenaltyPercentPerDay: number;
}): { finalScore: number; penaltyPoints: number } {
  const clampedRaw = Math.max(0, Math.min(input.maxScore, Math.round(input.rawScore)));
  if (!input.isLate || input.latePolicy !== "accept_with_penalty" || input.latePenaltyPercentPerDay <= 0 || input.daysLate <= 0) {
    return { finalScore: clampedRaw, penaltyPoints: 0 };
  }
  const totalPenaltyPercent = Math.min(100, input.daysLate * input.latePenaltyPercentPerDay);
  const penaltyPoints = Math.round((input.maxScore * totalPenaltyPercent) / 100);
  const finalScore = Math.max(0, clampedRaw - penaltyPoints);
  return { finalScore, penaltyPoints };
}

export interface QuizQuestionDefinition {
  id: number;
  questionType: QuizQuestionType;
  prompt: string;
  options: string[];
  correctAnswer: string | string[];
  points: number;
}

export interface GradedQuizItem {
  questionId: number;
  questionType: QuizQuestionType;
  awardedPoints: number | null;
  maxPoints: number;
  isCorrect: boolean | null;
  requiresManualGrading: boolean;
}

export interface GradedQuizResult {
  items: GradedQuizItem[];
  autoScore: number;
  maxScore: number;
  requiresManualGrading: boolean;
  totalScore: number;
  percentScore: number;
  passed: boolean | null;
}

export function evaluateQuizAttemptWindow(input: {
  now?: Date;
  status: PublicationStatus;
  publishAt?: Date | string | null;
  availableFrom?: Date | string | null;
  dueAt?: Date | string | null;
  maxAttempts: number;
  completedAttempts: number;
  timeLimitMinutes: number | null;
}): { allowed: boolean; reason?: string; expiresAt: Date | null } {
  const now = input.now ?? new Date();
  if (!isContentVisibleToStudent({ status: input.status, publishAt: input.publishAt, availableFrom: input.availableFrom, now })) {
    return { allowed: false, reason: "This quiz is not currently available.", expiresAt: null };
  }
  if (input.dueAt) {
    const dueDate = new Date(input.dueAt);
    if (!Number.isNaN(dueDate.getTime()) && now.getTime() > dueDate.getTime()) {
      return { allowed: false, reason: "The availability window for this quiz has closed.", expiresAt: null };
    }
  }
  if (input.maxAttempts > 0 && input.completedAttempts >= input.maxAttempts) {
    return { allowed: false, reason: `You have used all ${input.maxAttempts} allowed attempt(s).`, expiresAt: null };
  }
  const expiresAt =
    input.timeLimitMinutes && input.timeLimitMinutes > 0
      ? new Date(now.getTime() + input.timeLimitMinutes * 60 * 1000)
      : null;
  return { allowed: true, expiresAt };
}

export function isQuizAttemptWithinTimeLimit(input: {
  startedAt: Date | string;
  timeLimitMinutes: number | null;
  now?: Date;
  graceSeconds?: number;
}): boolean {
  if (!input.timeLimitMinutes || input.timeLimitMinutes <= 0) return true;
  const now = input.now ?? new Date();
  const started = new Date(input.startedAt);
  const graceMs = (input.graceSeconds ?? 30) * 1000;
  const limitMs = input.timeLimitMinutes * 60 * 1000 + graceMs;
  return now.getTime() - started.getTime() <= limitMs;
}

export function gradeQuizQuestions(
  questions: QuizQuestionDefinition[],
  answers: Record<string, string | string[]>,
  passMarkPercent = 50,
): GradedQuizResult {
  let autoScore = 0;
  let maxScore = 0;
  let requiresManualGrading = false;

  const items: GradedQuizItem[] = questions.map(q => {
    maxScore += q.points;
    const rawAnswer = answers[String(q.id)];

    if (q.questionType === "essay") {
      requiresManualGrading = true;
      return {
        questionId: q.id,
        questionType: q.questionType,
        awardedPoints: null,
        maxPoints: q.points,
        isCorrect: null,
        requiresManualGrading: true,
      };
    }

    if (q.questionType === "multiple_choice" || q.questionType === "true_false") {
      const expected = String(Array.isArray(q.correctAnswer) ? q.correctAnswer[0] ?? "" : q.correctAnswer)
        .trim()
        .toLowerCase();
      const actual = typeof rawAnswer === "string" ? rawAnswer.trim().toLowerCase() : "";
      const isCorrect = Boolean(expected && actual === expected);
      const pts = isCorrect ? q.points : 0;
      autoScore += pts;
      return {
        questionId: q.id,
        questionType: q.questionType,
        awardedPoints: pts,
        maxPoints: q.points,
        isCorrect,
        requiresManualGrading: false,
      };
    }

    if (q.questionType === "multiple_select") {
      const expectedSet = new Set(
        (Array.isArray(q.correctAnswer) ? q.correctAnswer : [q.correctAnswer])
          .map(v => String(v).trim().toLowerCase())
          .filter(Boolean),
      );
      const actualList = Array.isArray(rawAnswer)
        ? rawAnswer
        : typeof rawAnswer === "string" && rawAnswer.trim()
          ? rawAnswer.split(",")
          : [];
      const actualSet = new Set(actualList.map(v => String(v).trim().toLowerCase()).filter(Boolean));
      const isCorrect =
        expectedSet.size > 0 &&
        expectedSet.size === actualSet.size &&
        Array.from(expectedSet).every(item => actualSet.has(item));
      const pts = isCorrect ? q.points : 0;
      autoScore += pts;
      return {
        questionId: q.id,
        questionType: q.questionType,
        awardedPoints: pts,
        maxPoints: q.points,
        isCorrect,
        requiresManualGrading: false,
      };
    }

    // short_answer
    const acceptedAnswers = (Array.isArray(q.correctAnswer) ? q.correctAnswer : [q.correctAnswer])
      .map(v => String(v).trim().toLowerCase())
      .filter(Boolean);
    const actualText = typeof rawAnswer === "string" ? rawAnswer.trim().toLowerCase() : "";
    const isCorrect = Boolean(actualText && acceptedAnswers.includes(actualText));
    const pts = isCorrect ? q.points : 0;
    autoScore += pts;
    return {
      questionId: q.id,
      questionType: q.questionType,
      awardedPoints: pts,
      maxPoints: q.points,
      isCorrect,
      requiresManualGrading: false,
    };
  });

  const totalScore = autoScore;
  const percentScore = maxScore > 0 ? Number(((totalScore / maxScore) * 100).toFixed(2)) : 0;
  const passed = requiresManualGrading ? null : percentScore >= passMarkPercent;

  return {
    items,
    autoScore,
    maxScore,
    requiresManualGrading,
    totalScore,
    percentScore,
    passed,
  };
}

export interface GradebookCategoryInput {
  id: number;
  name: string;
  weightPercent: number;
}

export interface GradebookEntryInput {
  id: number;
  categoryId: number | null;
  title: string;
  sourceType: "assignment" | "quiz" | "manual";
  score: number | null;
  maxScore: number;
  status: GradeItemStatus;
  feedback?: string | null;
}

export interface CategoryCalculationSummary {
  categoryId: number;
  name: string;
  configuredWeightPercent: number;
  earnedPoints: number;
  possiblePoints: number;
  averagePercent: number | null;
}

export interface CourseGradebookCalculation {
  categories: CategoryCalculationSummary[];
  visibleEntries: Array<GradebookEntryInput & { percentage: number | null }>;
  overallPercent: number | null;
  roundedInstitutionalScore: number | null;
  letterGrade: string | null;
  gradePointsTimes100: number | null;
  weightWarning: string | null;
  explanation: string;
}

/**
 * Calculates a student's course gradebook with category weighting, exemptions,
 * missing-work handling, and draft vs. released grade visibility.
 * Rounding policy: category and overall percentages are rounded half-up to 2 decimal places;
 * mapping to official MIS 0–100 score uses Math.round(overallPercent).
 */
export function calculateWeightedCourseGrade(
  categories: GradebookCategoryInput[],
  entries: GradebookEntryInput[],
  options: { forStudentView: boolean } = { forStudentView: false },
): CourseGradebookCalculation {
  const totalConfiguredWeight = categories.reduce((sum, c) => sum + c.weightPercent, 0);
  const weightWarning =
    categories.length > 0 && totalConfiguredWeight !== 100
      ? `Category weights total ${totalConfiguredWeight}% (expected 100%). Active categories are normalized proportionally.`
      : null;

  const visibleEntries = entries.map(entry => {
    const hideUnreleased = options.forStudentView && entry.status !== "released" && entry.status !== "exempt" && entry.status !== "missing";
    const effectiveScore =
      hideUnreleased
        ? null
        : entry.status === "missing"
          ? 0
          : entry.score;
    const percentage =
      entry.status === "exempt" || effectiveScore === null || entry.maxScore <= 0
        ? null
        : Number(((effectiveScore / entry.maxScore) * 100).toFixed(2));
    return {
      ...entry,
      score: hideUnreleased ? null : entry.score,
      feedback: hideUnreleased ? null : entry.feedback ?? null,
      percentage,
    };
  });

  const gradedFilter = (e: typeof visibleEntries[number]) => {
    if (e.status === "exempt") return false;
    if (options.forStudentView) {
      return e.status === "released" || e.status === "missing";
    }
    return e.status === "released" || e.status === "draft_grade" || e.status === "missing";
  };

  const categorySummaries: CategoryCalculationSummary[] = categories.map(cat => {
    const catEntries = visibleEntries.filter(e => e.categoryId === cat.id && gradedFilter(e));
    const earnedPoints = catEntries.reduce((sum, e) => sum + (e.status === "missing" ? 0 : e.score ?? 0), 0);
    const possiblePoints = catEntries.reduce((sum, e) => sum + (e.score !== null || e.status === "missing" ? e.maxScore : 0), 0);
    const averagePercent = possiblePoints > 0 ? Number(((earnedPoints / possiblePoints) * 100).toFixed(2)) : null;
    return {
      categoryId: cat.id,
      name: cat.name,
      configuredWeightPercent: cat.weightPercent,
      earnedPoints,
      possiblePoints,
      averagePercent,
    };
  });

  let overallPercent: number | null = null;
  let explanation = "No graded items available yet.";

  const activeCategories = categorySummaries.filter(c => c.averagePercent !== null && c.configuredWeightPercent > 0);
  if (activeCategories.length > 0) {
    const activeWeightSum = activeCategories.reduce((sum, c) => sum + c.configuredWeightPercent, 0);
    const weightedTotal = activeCategories.reduce(
      (sum, c) => sum + (c.averagePercent! * c.configuredWeightPercent) / activeWeightSum,
      0,
    );
    overallPercent = Number(weightedTotal.toFixed(2));
    explanation = activeCategories
      .map(c => `${c.name}: ${c.averagePercent}% (weight ${c.configuredWeightPercent}%)`)
      .join(" · ");
  } else {
    // Fallback to unweighted points across all eligible entries
    const eligible = visibleEntries.filter(gradedFilter);
    const earned = eligible.reduce((sum, e) => sum + (e.status === "missing" ? 0 : e.score ?? 0), 0);
    const possible = eligible.reduce((sum, e) => sum + (e.score !== null || e.status === "missing" ? e.maxScore : 0), 0);
    if (possible > 0) {
      overallPercent = Number(((earned / possible) * 100).toFixed(2));
      explanation = `Unweighted points total: ${earned}/${possible} (${overallPercent}%)`;
    }
  }

  const roundedInstitutionalScore =
    overallPercent !== null ? Math.max(0, Math.min(100, Math.round(overallPercent))) : null;
  const gradeInfo = roundedInstitutionalScore !== null ? gradeFromScore(roundedInstitutionalScore) : null;

  return {
    categories: categorySummaries,
    visibleEntries,
    overallPercent,
    roundedInstitutionalScore,
    letterGrade: gradeInfo?.letterGrade ?? null,
    gradePointsTimes100: gradeInfo?.gradePointsTimes100 ?? null,
    weightWarning,
    explanation,
  };
}
