import { beforeEach, describe, expect, it } from "vitest";
import type { TrpcContext } from "./_core/context";
import { memoryDb } from "./db";
import * as misDb from "./db/mis";
import { appRouter } from "./routers";

function makeCtx(user: {
  id: number;
  role: "admin" | "registrar" | "faculty" | "student" | "finance" | "non_teaching" | "applicant";
  name?: string;
  email?: string;
}): TrpcContext {
  return {
    user: {
      id: user.id,
      openId: `test-openid-${user.id}`,
      name: user.name ?? `User ${user.id}`,
      email: user.email ?? `user${user.id}@college.edu`,
      loginMethod: "local",
      role: user.role,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { cookie: () => undefined, clearCookie: () => undefined } as unknown as TrpcContext["res"],
  };
}

describe("LMS End-to-End Journeys & Authorization Boundaries", () => {
  let assignedFacultyId = 10;
  let unassignedFacultyId = 11;
  let enrolledStudentUserId = 20;
  let secondEnrolledStudentUserId = 21;
  let unenrolledStudentUserId = 22;
  let adminUserId = 1;
  let offeringId = 0;
  let targetCopyOfferingId = 0;
  let enrolledStudentEnrollmentId = 0;
  let secondStudentEnrollmentId = 0;

  beforeEach(async () => {
    process.env.DATABASE_URL = "";
    memoryDb.users.length = 0;
    memoryDb.departments.length = 0;
    memoryDb.programmes.length = 0;
    memoryDb.terms.length = 0;
    memoryDb.courses.length = 0;
    memoryDb.offerings.length = 0;
    memoryDb.facultyAssignments.length = 0;
    memoryDb.students.length = 0;
    memoryDb.enrollments.length = 0;
    memoryDb.courseActivities.length = 0;
    memoryDb.activitySubmissions.length = 0;
    memoryDb.gradeRecords.length = 0;
    memoryDb.auditEvents.length = 0;
    memoryDb.lmsCourseSpaces.length = 0;
    memoryDb.lmsModules.length = 0;
    memoryDb.lmsModuleItems.length = 0;
    memoryDb.lmsItemCompletions.length = 0;
    memoryDb.lmsGradeCategories.length = 0;
    memoryDb.lmsAssignmentConfigs.length = 0;
    memoryDb.lmsAssignmentExtensions.length = 0;
    memoryDb.lmsSubmissionVersions.length = 0;
    memoryDb.lmsQuestionBank.length = 0;
    memoryDb.lmsQuizzes.length = 0;
    memoryDb.lmsQuizQuestions.length = 0;
    memoryDb.lmsQuizAttempts.length = 0;
    memoryDb.lmsGradebookEntries.length = 0;
    memoryDb.lmsAnnouncements.length = 0;
    memoryDb.lmsDiscussionTopics.length = 0;
    memoryDb.lmsDiscussionReplies.length = 0;
    memoryDb.lmsCourseMessages.length = 0;
    memoryDb.lmsNotifications.length = 0;
    memoryDb.lmsNotificationPreferences.length = 0;

    const now = new Date();
    memoryDb.users.push(
      {
        id: adminUserId,
        openId: "admin-1",
        name: "System Admin",
        email: "admin@college.edu",
        loginMethod: "local",
        role: "admin",
        createdAt: now,
        updatedAt: now,
        lastSignedIn: now,
      },
      {
        id: assignedFacultyId,
        openId: "fac-10",
        name: "Dr. Evelyn Vance",
        email: "vance@college.edu",
        loginMethod: "local",
        role: "faculty",
        createdAt: now,
        updatedAt: now,
        lastSignedIn: now,
      },
      {
        id: unassignedFacultyId,
        openId: "fac-11",
        name: "Dr. Marcus Cole",
        email: "cole@college.edu",
        loginMethod: "local",
        role: "faculty",
        createdAt: now,
        updatedAt: now,
        lastSignedIn: now,
      },
      {
        id: enrolledStudentUserId,
        openId: "stu-20",
        name: "Amara Okafor",
        email: "amara@college.edu",
        loginMethod: "local",
        role: "student",
        createdAt: now,
        updatedAt: now,
        lastSignedIn: now,
      },
      {
        id: secondEnrolledStudentUserId,
        openId: "stu-21",
        name: "Liam Chen",
        email: "liam@college.edu",
        loginMethod: "local",
        role: "student",
        createdAt: now,
        updatedAt: now,
        lastSignedIn: now,
      },
      {
        id: unenrolledStudentUserId,
        openId: "stu-22",
        name: "Noah Patel",
        email: "noah@college.edu",
        loginMethod: "local",
        role: "student",
        createdAt: now,
        updatedAt: now,
        lastSignedIn: now,
      },
    );

    const deptId = await misDb.createDepartment({ code: "CS", name: "Computer Science" });
    const termId = await misDb.createTerm({
      code: "2026-T1",
      name: "Autumn 2026",
      startsAt: new Date(Date.now() - 86_400_000),
      endsAt: new Date(Date.now() + 90 * 86_400_000),
      status: "active",
    });
    const courseId = await misDb.createCourse({
      departmentId: deptId,
      code: "CS301",
      title: "Operating Systems & Concurrency",
      credits: 15,
      level: 6,
    });
    offeringId = await misDb.createOffering({
      courseId,
      termId,
      section: "A",
      modality: "hybrid",
      capacity: 40,
      status: "open",
    });
    targetCopyOfferingId = await misDb.createOffering({
      courseId,
      termId,
      section: "B",
      modality: "online",
      capacity: 40,
      status: "open",
    });

    await misDb.assignFaculty({ courseOfferingId: offeringId, facultyUserId: assignedFacultyId });
    await misDb.assignFaculty({ courseOfferingId: targetCopyOfferingId, facultyUserId: assignedFacultyId });

    const s1 = await misDb.createStudent({
      studentNumber: "STU-001",
      legalFirstName: "Amara",
      legalLastName: "Okafor",
      status: "active",
    });
    memoryDb.students.find(s => s.id === s1)!.userId = enrolledStudentUserId;

    const s2 = await misDb.createStudent({
      studentNumber: "STU-002",
      legalFirstName: "Liam",
      legalLastName: "Chen",
      status: "active",
    });
    memoryDb.students.find(s => s.id === s2)!.userId = secondEnrolledStudentUserId;

    const s3 = await misDb.createStudent({
      studentNumber: "STU-003",
      legalFirstName: "Noah",
      legalLastName: "Patel",
      status: "active",
    });
    memoryDb.students.find(s => s.id === s3)!.userId = unenrolledStudentUserId;

    enrolledStudentEnrollmentId = await misDb.enrollStudent({
      studentId: s1,
      courseOfferingId: offeringId,
    });
    secondStudentEnrollmentId = await misDb.enrollStudent({
      studentId: s2,
      courseOfferingId: offeringId,
    });
  });

  it("enforces course access: allows assigned faculty & enrolled students, blocks unassigned faculty & unenrolled students", async () => {
    const facultyCaller = appRouter.createCaller(makeCtx({ id: assignedFacultyId, role: "faculty" }));
    const unassignedFacultyCaller = appRouter.createCaller(makeCtx({ id: unassignedFacultyId, role: "faculty" }));
    const enrolledCaller = appRouter.createCaller(makeCtx({ id: enrolledStudentUserId, role: "student" }));
    const unenrolledCaller = appRouter.createCaller(makeCtx({ id: unenrolledStudentUserId, role: "student" }));

    const mod = await facultyCaller.lms.createModule({
      courseOfferingId: offeringId,
      title: "Week 1: Kernel Abstractions",
      status: "published",
    });
    await facultyCaller.lms.createModuleItem({
      courseOfferingId: offeringId,
      moduleId: mod.id,
      itemType: "page",
      title: "Process Control Blocks & Context Switching",
      bodyHtml: "<p>Published kernel notes</p>",
      status: "published",
    });
    await facultyCaller.lms.createModuleItem({
      courseOfferingId: offeringId,
      moduleId: mod.id,
      itemType: "page",
      title: "Draft Instructor Key",
      bodyHtml: "<p>Secret draft notes</p>",
      status: "draft",
    });

    const studentSpace = await enrolledCaller.lms.courseSpace({ courseOfferingId: offeringId });
    expect(studentSpace.modules).toHaveLength(1);
    expect(studentSpace.modules[0].items).toHaveLength(1);
    expect(studentSpace.modules[0].items[0].title).toBe("Process Control Blocks & Context Switching");

    await expect(
      unenrolledCaller.lms.courseSpace({ courseOfferingId: offeringId }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    await expect(
      unassignedFacultyCaller.lms.courseSpace({ courseOfferingId: offeringId }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    await expect(
      unassignedFacultyCaller.lms.createModule({
        courseOfferingId: offeringId,
        title: "Unauthorized Module",
        status: "published",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("handles assignment submission receipts, draft vs released grades, and student-to-student privacy isolation", async () => {
    const facultyCaller = appRouter.createCaller(makeCtx({ id: assignedFacultyId, role: "faculty" }));
    const student1Caller = appRouter.createCaller(makeCtx({ id: enrolledStudentUserId, role: "student" }));
    const student2Caller = appRouter.createCaller(makeCtx({ id: secondEnrolledStudentUserId, role: "student" }));

    const assignment = await facultyCaller.lms.createAssignment({
      courseOfferingId: offeringId,
      title: "Project 1: Thread Scheduler Implementation",
      description: "Implement a multi-level feedback queue scheduler.",
      dueAt: new Date(Date.now() + 3 * 86_400_000),
      maxScore: 100,
      latePolicy: "accept_with_penalty",
      latePenaltyPercentPerDay: 10,
      maxAttempts: 2,
      allowResubmission: true,
      submissionMode: "individual",
      allowTextResponse: true,
      allowFileUpload: true,
      status: "published",
    });

    const receipt = await student1Caller.lms.submitAssignment({
      courseOfferingId: offeringId,
      activityId: assignment.id,
      isDraft: false,
      responseText: "Implemented MLFQ with priority boost every 50ms.",
    });
    expect(receipt.receiptCode).toMatch(/^SUB-/);
    expect(receipt.attemptNumber).toBe(1);

    // Student 2 cannot see Student 1's submission
    const s2View = await student2Caller.lms.courseSpace({ courseOfferingId: offeringId });
    expect(s2View.assignments[0].submissions).toHaveLength(0);

    // Faculty grades as draft (releaseGrade: false)
    await facultyCaller.lms.gradeAssignment({
      courseOfferingId: offeringId,
      activityId: assignment.id,
      enrollmentId: enrolledStudentEnrollmentId,
      rawScore: 92,
      feedback: "Great priority boost analysis.",
      releaseGrade: false,
    });

    // Student 1 cannot see draft score or feedback yet
    const s1BeforeRelease = await student1Caller.lms.courseSpace({ courseOfferingId: offeringId });
    expect(s1BeforeRelease.assignments[0].submissions[0].finalScore).toBeNull();
    expect(s1BeforeRelease.assignments[0].submissions[0].feedback).toBeNull();

    // Faculty releases grade
    await facultyCaller.lms.gradeAssignment({
      courseOfferingId: offeringId,
      activityId: assignment.id,
      enrollmentId: enrolledStudentEnrollmentId,
      rawScore: 92,
      feedback: "Great priority boost analysis.",
      releaseGrade: true,
    });

    const s1AfterRelease = await student1Caller.lms.courseSpace({ courseOfferingId: offeringId });
    expect(s1AfterRelease.assignments[0].submissions[0].finalScore).toBe(92);
    expect(s1AfterRelease.assignments[0].submissions[0].feedback).toBe("Great priority boost analysis.");
  });

  it("enforces quiz attempt limits, autosaves, auto-grades objective questions, and publishes official MIS course grades", async () => {
    const facultyCaller = appRouter.createCaller(makeCtx({ id: assignedFacultyId, role: "faculty" }));
    const studentCaller = appRouter.createCaller(makeCtx({ id: enrolledStudentUserId, role: "student" }));

    const q1 = await facultyCaller.lms.createQuestion({
      courseOfferingId: offeringId,
      topic: "Virtual Memory",
      questionType: "multiple_choice",
      prompt: "Which hardware structure caches virtual-to-physical page translations?",
      options: ["TLB", "DMA", "ALU", "PIC"],
      correctAnswer: "TLB",
      defaultPoints: 50,
    });

    const q2 = await facultyCaller.lms.createQuestion({
      courseOfferingId: offeringId,
      topic: "Virtual Memory",
      questionType: "true_false",
      prompt: "A page fault always indicates an invalid memory access bug.",
      options: ["True", "False"],
      correctAnswer: "False",
      defaultPoints: 50,
    });

    const spaceBefore = await facultyCaller.lms.courseSpace({ courseOfferingId: offeringId });
    const quizCategoryId = spaceBefore.categories.find(c => c.name.includes("Quizzes"))?.id;

    const quiz = await facultyCaller.lms.createQuiz({
      courseOfferingId: offeringId,
      categoryId: quizCategoryId,
      title: "Midterm Quiz: Virtual Memory",
      status: "published",
      timeLimitMinutes: 20,
      maxAttempts: 1,
      passMarkPercent: 60,
      randomizeQuestions: false,
      randomizeOptions: false,
      reviewPolicy: "immediate",
      questionBankIds: [q1.id, q2.id],
    });

    const attempt = await studentCaller.lms.startQuizAttempt({
      courseOfferingId: offeringId,
      quizId: quiz.id,
    });
    expect(attempt.status).toBe("in_progress");

    await studentCaller.lms.autosaveQuizAttempt({
      courseOfferingId: offeringId,
      attemptId: attempt.id,
      answers: { [String(q1.id)]: "TLB" },
    });

    const submitted = await studentCaller.lms.submitQuizAttempt({
      courseOfferingId: offeringId,
      attemptId: attempt.id,
      answers: {
        [String(q1.id)]: "TLB",
        [String(q2.id)]: "False",
      },
    });
    expect(submitted.autoScore).toBe(100);
    expect(submitted.passed).toBe(true);

    // Starting a second attempt when maxAttempts = 1 is blocked
    await expect(
      studentCaller.lms.startQuizAttempt({
        courseOfferingId: offeringId,
        quizId: quiz.id,
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    // Publish calculated LMS course grade to official MIS transcript record
    const official = await facultyCaller.lms.publishOfficialCourseGrade({
      courseOfferingId: offeringId,
      enrollmentId: enrolledStudentEnrollmentId,
    });
    expect(official.score).toBe(100);
    expect(official.letterGrade).toBe("A");

    const studentRecord = await studentCaller.students.myAcademicRecord();
    expect(studentRecord?.results).toHaveLength(1);
    expect(studentRecord?.results[0].letterGrade).toBe("A");
  });

  it("copies course structure to a new offering while excluding student enrollments, submissions, and private messages", async () => {
    const facultyCaller = appRouter.createCaller(makeCtx({ id: assignedFacultyId, role: "faculty" }));
    const student1Caller = appRouter.createCaller(makeCtx({ id: enrolledStudentUserId, role: "student" }));

    const mod = await facultyCaller.lms.createModule({
      courseOfferingId: offeringId,
      title: "Week 1: Memory Hierarchy",
      status: "published",
    });
    await facultyCaller.lms.createModuleItem({
      courseOfferingId: offeringId,
      moduleId: mod.id,
      itemType: "page",
      title: "Cache Coherency Protocols",
      bodyHtml: "<p>MESI states</p>",
      status: "published",
    });
    await student1Caller.lms.sendCourseMessage({
      courseOfferingId: offeringId,
      recipientUserId: assignedFacultyId,
      subject: "Private Accommodation Question",
      body: "Confidential student question",
    });

    const preview = await facultyCaller.lms.previewCourseCopy({
      sourceOfferingId: offeringId,
      targetOfferingId: targetCopyOfferingId,
    });
    expect(preview.modulesCount).toBe(1);
    expect(preview.moduleItemsCount).toBe(1);

    await facultyCaller.lms.executeCourseCopy({
      sourceOfferingId: offeringId,
      targetOfferingId: targetCopyOfferingId,
    });

    const targetSpace = await facultyCaller.lms.courseSpace({ courseOfferingId: targetCopyOfferingId });
    expect(targetSpace.modules).toHaveLength(1);
    expect(targetSpace.modules[0].title).toBe("Week 1: Memory Hierarchy");
    expect(targetSpace.modules[0].status).toBe("draft");
    expect(targetSpace.messages).toHaveLength(0);
    expect(targetSpace.gradebook).toHaveLength(0);
  });
});
