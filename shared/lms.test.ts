import { describe, expect, it } from "vitest";
import {
  calculateWeightedCourseGrade,
  computeAssignmentPenaltyScore,
  evaluateAssignmentSubmissionWindow,
  evaluateQuizAttemptWindow,
  gradeQuizQuestions,
  isContentVisibleToStudent,
  isQuizAttemptWithinTimeLimit,
} from "./lms";

describe("LMS content visibility & publication rules", () => {
  const now = new Date("2026-10-27T12:00:00Z");

  it("hides draft and archived items from learners", () => {
    expect(isContentVisibleToStudent({ status: "draft", now })).toBe(false);
    expect(isContentVisibleToStudent({ status: "archived", now })).toBe(false);
  });

  it("enforces scheduled publication timestamps and availableFrom windows", () => {
    expect(
      isContentVisibleToStudent({
        status: "scheduled",
        publishAt: "2026-10-28T00:00:00Z",
        now,
      }),
    ).toBe(false);

    expect(
      isContentVisibleToStudent({
        status: "scheduled",
        publishAt: "2026-10-27T08:00:00Z",
        now,
      }),
    ).toBe(true);

    expect(
      isContentVisibleToStudent({
        status: "published",
        availableFrom: "2026-10-29T00:00:00Z",
        now,
      }),
    ).toBe(false);
  });
});

describe("LMS assignment submission window & late penalties", () => {
  const now = new Date("2026-10-27T12:00:00Z");

  it("rejects late submissions when policy is reject_after_due unless an extension is granted", () => {
    const withoutExtension = evaluateAssignmentSubmissionWindow({
      now,
      status: "published",
      dueAt: "2026-10-25T12:00:00Z",
      latePolicy: "reject_after_due",
      maxAttempts: 3,
      currentAttempts: 0,
      allowResubmission: true,
    });
    expect(withoutExtension.allowed).toBe(false);
    expect(withoutExtension.isLate).toBe(true);

    const withExtension = evaluateAssignmentSubmissionWindow({
      now,
      status: "published",
      dueAt: "2026-10-25T12:00:00Z",
      extensionDueAt: "2026-10-29T12:00:00Z",
      latePolicy: "reject_after_due",
      maxAttempts: 3,
      currentAttempts: 0,
      allowResubmission: true,
    });
    expect(withExtension.allowed).toBe(true);
    expect(withExtension.isLate).toBe(false);
  });

  it("calculates daily late penalty accurately", () => {
    const result = computeAssignmentPenaltyScore({
      rawScore: 90,
      maxScore: 100,
      isLate: true,
      daysLate: 2,
      latePolicy: "accept_with_penalty",
      latePenaltyPercentPerDay: 10,
    });
    expect(result).toEqual({ finalScore: 70, penaltyPoints: 20 });
  });
});

describe("LMS quiz engine & auto-grading", () => {
  it("enforces quiz attempt limits and time limits", () => {
    const now = new Date("2026-10-27T12:00:00Z");
    const blocked = evaluateQuizAttemptWindow({
      now,
      status: "published",
      maxAttempts: 2,
      completedAttempts: 2,
      timeLimitMinutes: 30,
    });
    expect(blocked.allowed).toBe(false);

    expect(
      isQuizAttemptWithinTimeLimit({
        startedAt: "2026-10-27T11:00:00Z",
        timeLimitMinutes: 30,
        now,
        graceSeconds: 15,
      }),
    ).toBe(false);
  });

  it("auto-grades objective questions and flags essay questions for instructor grading", () => {
    const graded = gradeQuizQuestions(
      [
        {
          id: 1,
          questionType: "multiple_choice",
          prompt: "Primary key property?",
          options: ["Unique & not null", "Nullable"],
          correctAnswer: "Unique & not null",
          points: 10,
        },
        {
          id: 2,
          questionType: "multiple_select",
          prompt: "Select ACID properties",
          options: ["Atomicity", "Isolation", "Latency"],
          correctAnswer: ["Atomicity", "Isolation"],
          points: 10,
        },
        {
          id: 3,
          questionType: "short_answer",
          prompt: "SQL clause to filter groups",
          options: [],
          correctAnswer: ["having", "HAVING clause"],
          points: 10,
        },
        {
          id: 4,
          questionType: "essay",
          prompt: "Explain serializable isolation.",
          options: [],
          correctAnswer: "",
          points: 20,
        },
      ],
      {
        "1": "Unique & not null",
        "2": ["Isolation", "Atomicity"],
        "3": "HAVING",
        "4": "Serializable prevents phantom reads...",
      },
      60,
    );

    expect(graded.autoScore).toBe(30);
    expect(graded.maxScore).toBe(50);
    expect(graded.requiresManualGrading).toBe(true);
    expect(graded.passed).toBeNull();
  });
});

describe("LMS weighted gradebook calculation & release controls", () => {
  const categories = [
    { id: 1, name: "Coursework", weightPercent: 40 },
    { id: 2, name: "Examinations", weightPercent: 60 },
  ];

  const entries = [
    {
      id: 101,
      categoryId: 1,
      title: "Assignment 1",
      sourceType: "assignment" as const,
      score: 80,
      maxScore: 100,
      status: "released" as const,
      feedback: "Well structured.",
    },
    {
      id: 102,
      categoryId: 2,
      title: "Midterm Quiz",
      sourceType: "quiz" as const,
      score: 90,
      maxScore: 100,
      status: "draft_grade" as const,
      feedback: "Internal draft note.",
    },
  ];

  it("includes draft grades for faculty view and computes weighted score", () => {
    const facultyCalc = calculateWeightedCourseGrade(categories, entries, { forStudentView: false });
    // 80 * 0.4 + 90 * 0.6 = 32 + 54 = 86% -> A-
    expect(facultyCalc.overallPercent).toBe(86);
    expect(facultyCalc.letterGrade).toBe("A-");
  });

  it("conceals unreleased draft grades and feedback in student view", () => {
    const studentCalc = calculateWeightedCourseGrade(categories, entries, { forStudentView: true });
    // Only Assignment 1 (released, 80%) is visible to student
    expect(studentCalc.overallPercent).toBe(80);
    expect(studentCalc.letterGrade).toBe("B+");
    const draftItem = studentCalc.visibleEntries.find(e => e.id === 102);
    expect(draftItem?.score).toBeNull();
    expect(draftItem?.feedback).toBeNull();
  });
});
