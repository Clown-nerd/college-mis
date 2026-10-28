import { and, asc, desc, eq, or } from "drizzle-orm";
import { nanoid } from "nanoid";
import {
  academicTerms,
  activitySubmissions,
  courseActivities,
  courseOfferings,
  courses,
  enrollments,
  facultyAssignments,
  gradeRecords,
  lmsAnnouncements,
  lmsAssignmentConfigs,
  lmsAssignmentExtensions,
  lmsCourseMessages,
  lmsCourseSpaces,
  lmsDiscussionReplies,
  lmsDiscussionTopics,
  lmsGradeCategories,
  lmsGradebookEntries,
  lmsItemCompletions,
  lmsModuleItems,
  lmsModules,
  lmsNotificationPreferences,
  lmsNotifications,
  lmsQuestionBank,
  lmsQuizAttempts,
  lmsQuizQuestions,
  lmsQuizzes,
  lmsSubmissionVersions,
  students,
  users,
  type UserRole,
} from "../../drizzle/schema";
import {
  calculateWeightedCourseGrade,
  computeAssignmentPenaltyScore,
  evaluateAssignmentSubmissionWindow,
  evaluateQuizAttemptWindow,
  gradeQuizQuestions,
  isContentVisibleToStudent,
  isQuizAttemptWithinTimeLimit,
  type GradeItemStatus,
  type LateSubmissionPolicy,
  type PublicationStatus,
  type QuizQuestionDefinition,
  type QuizQuestionType,
  type QuizReviewPolicy,
} from "../../shared/lms";
import { getDb, memoryDb } from "../db";
import { storageGetSignedUrl } from "../storage";
import * as misDb from "./mis";

export type CourseAccessCheck = {
  allowed: boolean;
  mode: "staff" | "learner" | "none";
  enrollmentId: number | null;
  studentId: number | null;
};

export async function checkCourseSpaceAccess(
  userId: number,
  role: UserRole,
  courseOfferingId: number,
): Promise<CourseAccessCheck> {
  if (role === "admin" || role === "registrar") {
    return { allowed: true, mode: "staff", enrollmentId: null, studentId: null };
  }
  if (role === "faculty") {
    const canManage = await misDb.canManageOffering(userId, role, courseOfferingId);
    return { allowed: canManage, mode: canManage ? "staff" : "none", enrollmentId: null, studentId: null };
  }
  if (role === "student" || role === "user") {
    const studentId = await misDb.getStudentIdForUser(userId);
    if (!studentId) return { allowed: false, mode: "none", enrollmentId: null, studentId: null };
    const db = await getDb();
    if (!db) {
      const enrollment = memoryDb.enrollments.find(
        e =>
          e.studentId === studentId &&
          e.courseOfferingId === courseOfferingId &&
          (e.status === "registered" || e.status === "completed"),
      );
      return {
        allowed: Boolean(enrollment),
        mode: enrollment ? "learner" : "none",
        enrollmentId: enrollment?.id ?? null,
        studentId,
      };
    }
    const [enrollment] = await db
      .select({ id: enrollments.id })
      .from(enrollments)
      .where(
        and(
          eq(enrollments.studentId, studentId),
          eq(enrollments.courseOfferingId, courseOfferingId),
          or(eq(enrollments.status, "registered"), eq(enrollments.status, "completed")),
        ),
      )
      .limit(1);
    return {
      allowed: Boolean(enrollment),
      mode: enrollment ? "learner" : "none",
      enrollmentId: enrollment?.id ?? null,
      studentId,
    };
  }
  return { allowed: false, mode: "none", enrollmentId: null, studentId: null };
}

export async function createNotification(input: {
  userId: number;
  courseOfferingId?: number | null;
  category: "announcement" | "due_date" | "submission" | "grade_released" | "discussion_reply" | "message";
  title: string;
  body: string;
  linkPath?: string;
}) {
  const db = await getDb();
  if (!db) {
    const prefs = memoryDb.lmsNotificationPreferences.find(p => p.userId === input.userId);
    if (prefs) {
      if (input.category === "announcement" && !prefs.announcements) return;
      if (input.category === "due_date" && !prefs.dueDates) return;
      if (input.category === "submission" && !prefs.submissions) return;
      if (input.category === "grade_released" && !prefs.grades) return;
      if (input.category === "discussion_reply" && !prefs.discussions) return;
      if (input.category === "message" && !prefs.messages) return;
    }
    memoryDb.lmsNotifications.unshift({
      id: memoryDb.lmsNotifications.length + 1,
      userId: input.userId,
      courseOfferingId: input.courseOfferingId ?? null,
      category: input.category,
      title: input.title,
      body: input.body,
      linkPath: input.linkPath ?? "/learning",
      readAt: null,
      createdAt: new Date(),
    });
    return;
  }
  await db.insert(lmsNotifications).values({
    userId: input.userId,
    courseOfferingId: input.courseOfferingId ?? null,
    category: input.category,
    title: input.title,
    body: input.body,
    linkPath: input.linkPath ?? "/learning",
  });
}

export async function notifyEnrolledStudents(
  courseOfferingId: number,
  notification: {
    category: "announcement" | "due_date" | "submission" | "grade_released" | "discussion_reply" | "message";
    title: string;
    body: string;
  },
) {
  const db = await getDb();
  if (!db) {
    const enrolledStudentIds = memoryDb.enrollments
      .filter(e => e.courseOfferingId === courseOfferingId && e.status === "registered")
      .map(e => e.studentId);
    const userIds = memoryDb.students
      .filter(s => enrolledStudentIds.includes(s.id) && s.userId !== null)
      .map(s => s.userId!);
    for (const uid of userIds) {
      await createNotification({
        userId: uid,
        courseOfferingId,
        ...notification,
      });
    }
    return;
  }
  const rows = await db
    .select({ userId: students.userId })
    .from(enrollments)
    .innerJoin(students, eq(enrollments.studentId, students.id))
    .where(and(eq(enrollments.courseOfferingId, courseOfferingId), eq(enrollments.status, "registered")));
  for (const row of rows) {
    if (row.userId) {
      await createNotification({
        userId: row.userId,
        courseOfferingId,
        ...notification,
      });
    }
  }
}

export async function listAccessibleOfferingsForUser(userId: number, role: UserRole) {
  if (role === "admin" || role === "registrar" || role === "faculty") {
    return misDb.getTeachingOfferings(userId, role);
  }
  if (role === "student" || role === "user") {
    const studentId = await misDb.getStudentIdForUser(userId);
    if (!studentId) return [];
    const db = await getDb();
    if (!db) {
      return memoryDb.enrollments
        .filter(e => e.studentId === studentId && (e.status === "registered" || e.status === "completed"))
        .map(e => {
          const o = memoryDb.offerings.find(off => off.id === e.courseOfferingId);
          const course = o ? memoryDb.courses.find(c => c.id === o.courseId) : undefined;
          const term = o ? memoryDb.terms.find(t => t.id === o.termId) : undefined;
          return {
            id: o?.id ?? e.courseOfferingId,
            section: o?.section ?? "A",
            meetingPattern: o?.meetingPattern ?? null,
            room: o?.room ?? null,
            modality: o?.modality ?? ("in_person" as const),
            status: o?.status ?? ("open" as const),
            courseCode: course?.code ?? "COURSE",
            courseTitle: course?.title ?? "Course",
            termName: term?.name ?? "Term",
            enrollmentId: e.id,
          };
        });
    }
    return db
      .select({
        id: courseOfferings.id,
        section: courseOfferings.section,
        meetingPattern: courseOfferings.meetingPattern,
        room: courseOfferings.room,
        modality: courseOfferings.modality,
        status: courseOfferings.status,
        courseCode: courses.code,
        courseTitle: courses.title,
        termName: academicTerms.name,
        enrollmentId: enrollments.id,
      })
      .from(enrollments)
      .innerJoin(courseOfferings, eq(enrollments.courseOfferingId, courseOfferings.id))
      .innerJoin(courses, eq(courseOfferings.courseId, courses.id))
      .innerJoin(academicTerms, eq(courseOfferings.termId, academicTerms.id))
      .where(
        and(
          eq(enrollments.studentId, studentId),
          or(eq(enrollments.status, "registered"), eq(enrollments.status, "completed")),
        ),
      );
  }
  return [];
}

async function ensureDefaultCourseSpaceAndCategories(courseOfferingId: number) {
  const db = await getDb();
  if (!db) {
    let space = memoryDb.lmsCourseSpaces.find(s => s.courseOfferingId === courseOfferingId);
    if (!space) {
      const offering = memoryDb.offerings.find(o => o.id === courseOfferingId);
      const course = offering ? memoryDb.courses.find(c => c.id === offering.courseId) : undefined;
      const now = new Date();
      space = {
        id: memoryDb.lmsCourseSpaces.length + 1,
        courseOfferingId,
        overview:
          course?.description ??
          "Structured academic course space for weekly learning materials, guided activities, assessments, and collaborative discussion.",
        learningOutcomes:
          "1. Master core theoretical and practical concepts of the module.\n2. Apply analytical methods to solve real-world domain problems.\n3. Communicate findings clearly through structured coursework and assessments.",
        instructorBio: "Assigned course faculty member.",
        officeHours: "Tuesdays & Thursdays 15:00–16:30 (or by appointment via course messages)",
        gradingPolicy:
          "Weighted category grading: Coursework & Assignments (40%), Quizzes & Online Tests (30%), Final Examination / Project (30%). Rounded half-up to nearest whole percentage for institutional transcript publication.",
        latePenaltyPercentPerDay: 10,
        allowDiscussions: true,
        allowPrivateMessages: true,
        proctoringNoticeAcknowledged: true,
        retentionDays: 365,
        updatedByUserId: null,
        createdAt: now,
        updatedAt: now,
      };
      memoryDb.lmsCourseSpaces.push(space);
    }
    const existingCats = memoryDb.lmsGradeCategories.filter(c => c.courseOfferingId === courseOfferingId);
    if (existingCats.length === 0) {
      const now = new Date();
      memoryDb.lmsGradeCategories.push(
        { id: memoryDb.lmsGradeCategories.length + 1, courseOfferingId, name: "Coursework & Assignments", weightPercent: 40, position: 1, createdAt: now },
        { id: memoryDb.lmsGradeCategories.length + 2, courseOfferingId, name: "Quizzes & Online Tests", weightPercent: 30, position: 2, createdAt: now },
        { id: memoryDb.lmsGradeCategories.length + 3, courseOfferingId, name: "Final Assessment", weightPercent: 30, position: 3, createdAt: now },
      );
    }
    return space;
  }

  const [existingSpace] = await db
    .select()
    .from(lmsCourseSpaces)
    .where(eq(lmsCourseSpaces.courseOfferingId, courseOfferingId))
    .limit(1);

  if (!existingSpace) {
    await db.insert(lmsCourseSpaces).values({
      courseOfferingId,
      overview:
        "Structured academic course space for weekly learning materials, guided activities, assessments, and collaborative discussion.",
      learningOutcomes:
        "1. Master core theoretical and practical concepts of the module.\n2. Apply analytical methods to solve real-world domain problems.\n3. Communicate findings clearly through structured coursework and assessments.",
      instructorBio: "Assigned course faculty member.",
      officeHours: "Tuesdays & Thursdays 15:00–16:30",
      gradingPolicy:
        "Weighted category grading: Coursework & Assignments (40%), Quizzes & Online Tests (30%), Final Assessment (30%).",
      latePenaltyPercentPerDay: 10,
      allowDiscussions: true,
      allowPrivateMessages: true,
      proctoringNoticeAcknowledged: true,
      retentionDays: 365,
    });
  }

  const existingCats = await db
    .select()
    .from(lmsGradeCategories)
    .where(eq(lmsGradeCategories.courseOfferingId, courseOfferingId));

  if (existingCats.length === 0) {
    await db.insert(lmsGradeCategories).values([
      { courseOfferingId, name: "Coursework & Assignments", weightPercent: 40, position: 1 },
      { courseOfferingId, name: "Quizzes & Online Tests", weightPercent: 30, position: 2 },
      { courseOfferingId, name: "Final Assessment", weightPercent: 30, position: 3 },
    ]);
  }

  const [space] = await db
    .select()
    .from(lmsCourseSpaces)
    .where(eq(lmsCourseSpaces.courseOfferingId, courseOfferingId))
    .limit(1);
  return space!;
}

export async function getCourseSpaceFull(
  courseOfferingId: number,
  viewer: { userId: number; role: UserRole; enrollmentId: number | null },
) {
  const isLearner = viewer.role === "student" || viewer.role === "user";
  const now = new Date();
  const space = await ensureDefaultCourseSpaceAndCategories(courseOfferingId);
  const db = await getDb();

  if (!db) {
    const offering = memoryDb.offerings.find(o => o.id === courseOfferingId);
    const course = offering ? memoryDb.courses.find(c => c.id === offering.courseId) : undefined;
    const term = offering ? memoryDb.terms.find(t => t.id === offering.termId) : undefined;

    const assignedFacultyIds = memoryDb.facultyAssignments
      .filter(a => a.courseOfferingId === courseOfferingId)
      .map(a => a.facultyUserId);
    const instructors = memoryDb.users
      .filter(u => assignedFacultyIds.includes(u.id))
      .map(u => ({ id: u.id, name: u.name ?? "Instructor", email: u.email ?? "" }));

    const rawModules = memoryDb.lmsModules
      .filter(m => m.courseOfferingId === courseOfferingId)
      .sort((a, b) => a.position - b.position);
    const visibleModules = isLearner
      ? rawModules.filter(m =>
          isContentVisibleToStudent({ status: m.status, publishAt: m.publishAt, availableFrom: m.unlockAt, now }),
        )
      : rawModules;

    const rawItems = memoryDb.lmsModuleItems
      .filter(i => i.courseOfferingId === courseOfferingId)
      .sort((a, b) => a.position - b.position);

    const modulesWithItems = await Promise.all(
      visibleModules.map(async mod => {
        const modItems = rawItems.filter(i => i.moduleId === mod.id);
        const filteredItems = isLearner
          ? modItems.filter(i => isContentVisibleToStudent({ status: i.status, publishAt: i.publishAt, now }))
          : modItems;
        const enrichedItems = await Promise.all(
          filteredItems.map(async item => {
            const completed = viewer.enrollmentId
              ? memoryDb.lmsItemCompletions.some(
                  c => c.moduleItemId === item.id && c.enrollmentId === viewer.enrollmentId,
                )
              : false;
            const fileUrl = item.fileKey ? await storageGetSignedUrl(item.fileKey) : null;
            return {
              ...item,
              completed,
              fileUrl,
            };
          }),
        );
        return {
          ...mod,
          items: enrichedItems,
        };
      }),
    );

    const announcements = memoryDb.lmsAnnouncements
      .filter(a => a.courseOfferingId === courseOfferingId)
      .filter(a => !isLearner || isContentVisibleToStudent({ status: a.status, publishAt: a.publishAt, now }))
      .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.createdAt.getTime() - a.createdAt.getTime())
      .map(a => {
        const author = memoryDb.users.find(u => u.id === a.authorUserId);
        return {
          ...a,
          authorName: author?.name ?? "Course Instructor",
        };
      });

    const categories = memoryDb.lmsGradeCategories
      .filter(c => c.courseOfferingId === courseOfferingId)
      .sort((a, b) => a.position - b.position);

    const activities = memoryDb.courseActivities.filter(a => a.courseOfferingId === courseOfferingId);
    const assignments = await Promise.all(
      activities
        .filter(a => a.type === "assignment" || a.type === "assessment")
        .map(async act => {
          const cfg = memoryDb.lmsAssignmentConfigs.find(c => c.activityId === act.id);
          const status: PublicationStatus = cfg?.status ?? (act.published ? "published" : "draft");
          if (
            isLearner &&
            !isContentVisibleToStudent({
              status,
              publishAt: cfg?.publishAt,
              availableFrom: cfg?.availableFrom,
              now,
            })
          ) {
            return null;
          }
          const extensions = memoryDb.lmsAssignmentExtensions.filter(e => e.activityId === act.id);
          const learnerExtension = viewer.enrollmentId
            ? extensions.find(e => e.enrollmentId === viewer.enrollmentId) ?? null
            : null;

          const allVersions = memoryDb.lmsSubmissionVersions
            .filter(v => v.activityId === act.id)
            .sort((a, b) => b.attemptNumber - a.attemptNumber);

          const visibleVersions = isLearner
            ? allVersions.filter(v => v.enrollmentId === viewer.enrollmentId)
            : allVersions;

          const enrichedVersions = await Promise.all(
            visibleVersions.map(async v => {
              const hideGrade = isLearner && v.gradeStatus !== "released";
              const enroll = memoryDb.enrollments.find(e => e.id === v.enrollmentId);
              const student = enroll ? memoryDb.students.find(s => s.id === enroll.studentId) : undefined;
              return {
                ...v,
                studentName: student ? `${student.legalFirstName} ${student.legalLastName}` : "Learner",
                studentNumber: student?.studentNumber ?? "",
                rawScore: hideGrade ? null : v.rawScore,
                finalScore: hideGrade ? null : v.finalScore,
                latePenaltyPoints: hideGrade ? 0 : v.latePenaltyPoints,
                feedback: hideGrade ? null : v.feedback,
                rubricScoresJson: hideGrade ? null : v.rubricScoresJson,
                attachmentUrl: v.attachmentKey ? await storageGetSignedUrl(v.attachmentKey) : null,
                annotatedFileUrl:
                  !hideGrade && v.annotatedFileKey ? await storageGetSignedUrl(v.annotatedFileKey) : null,
              };
            }),
          );

          const windowEval = evaluateAssignmentSubmissionWindow({
            now,
            status,
            publishAt: cfg?.publishAt,
            availableFrom: cfg?.availableFrom,
            dueAt: act.dueAt,
            lockAt: cfg?.lockAt,
            extensionDueAt: learnerExtension?.extendedDueAt,
            latePolicy: cfg?.latePolicy ?? "accept_with_penalty",
            maxAttempts: cfg?.maxAttempts ?? 3,
            currentAttempts: visibleVersions.filter(v => !v.isDraft).length,
            allowResubmission: cfg?.allowResubmission ?? true,
          });

          return {
            id: act.id,
            title: act.title,
            description: act.description,
            type: act.type,
            dueAt: act.dueAt,
            maxScore: act.maxScore ?? 100,
            status,
            config: cfg ?? null,
            attachmentUrl: cfg?.attachmentKey ? await storageGetSignedUrl(cfg.attachmentKey) : null,
            extensions: isLearner ? (learnerExtension ? [learnerExtension] : []) : extensions,
            submissions: enrichedVersions,
            windowEvaluation: windowEval,
          };
        }),
    );

    const questionBank = isLearner
      ? []
      : memoryDb.lmsQuestionBank.filter(q => q.courseOfferingId === courseOfferingId);

    const rawQuizzes = memoryDb.lmsQuizzes.filter(q => q.courseOfferingId === courseOfferingId);
    const quizzes = rawQuizzes
      .filter(
        q =>
          !isLearner ||
          isContentVisibleToStudent({
            status: q.status,
            publishAt: q.publishAt,
            availableFrom: q.availableFrom,
            now,
          }),
      )
      .map(q => {
        const links = memoryDb.lmsQuizQuestions
          .filter(link => link.quizId === q.id)
          .sort((a, b) => a.position - b.position);
        const questions = links
          .map(link => {
            const bankItem = memoryDb.lmsQuestionBank.find(b => b.id === link.questionBankId);
            if (!bankItem) return null;
            return {
              id: bankItem.id,
              topic: bankItem.topic,
              questionType: bankItem.questionType,
              prompt: bankItem.prompt,
              options: (bankItem.optionsJson as string[]) ?? [],
              correctAnswer: isLearner && !q.gradesReleased ? null : bankItem.correctAnswerJson,
              explanation: isLearner && !q.gradesReleased ? null : bankItem.explanation,
              points: link.pointsOverride ?? bankItem.defaultPoints,
            };
          })
          .filter((item): item is NonNullable<typeof item> => item !== null);

        const attempts = memoryDb.lmsQuizAttempts
          .filter(a => a.quizId === q.id && (!isLearner || a.enrollmentId === viewer.enrollmentId))
          .sort((a, b) => b.attemptNumber - a.attemptNumber)
          .map(a => {
            const enroll = memoryDb.enrollments.find(e => e.id === a.enrollmentId);
            const st = enroll ? memoryDb.students.find(s => s.id === enroll.studentId) : undefined;
            const canSeeScore =
              !isLearner ||
              q.reviewPolicy === "immediate" ||
              (q.reviewPolicy === "after_release" && (a.gradeReleased || q.gradesReleased)) ||
              (q.reviewPolicy === "after_due" && q.dueAt && now.getTime() > new Date(q.dueAt).getTime());
            return {
              ...a,
              studentName: st ? `${st.legalFirstName} ${st.legalLastName}` : "Learner",
              studentNumber: st?.studentNumber ?? "",
              autoScore: canSeeScore ? a.autoScore : null,
              manualScore: canSeeScore ? a.manualScore : null,
              totalScore: canSeeScore ? a.totalScore : null,
              passed: canSeeScore ? a.passed : null,
              instructorFeedback: canSeeScore ? a.instructorFeedback : null,
            };
          });

        return {
          ...q,
          questions,
          attempts,
        };
      });

    const roster = await misDb.getOfferingRoster(courseOfferingId);
    const allGradebookEntries = memoryDb.lmsGradebookEntries.filter(
      g => g.courseOfferingId === courseOfferingId,
    );

    const gradebookByStudent = roster
      .filter(r => !isLearner || r.enrollmentId === viewer.enrollmentId)
      .map(r => {
        const studentEntries = allGradebookEntries.filter(e => e.enrollmentId === r.enrollmentId);
        const calc = calculateWeightedCourseGrade(categories, studentEntries, { forStudentView: isLearner });
        return {
          ...r,
          calculation: calc,
        };
      });

    const topics = memoryDb.lmsDiscussionTopics
      .filter(t => t.courseOfferingId === courseOfferingId)
      .filter(t => !isLearner || t.moderationStatus !== "hidden")
      .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.createdAt.getTime() - a.createdAt.getTime())
      .map(t => {
        const author = memoryDb.users.find(u => u.id === t.authorUserId);
        const replies = memoryDb.lmsDiscussionReplies
          .filter(r => r.topicId === t.id && (!isLearner || r.moderationStatus !== "hidden"))
          .map(r => {
            const replyAuthor = memoryDb.users.find(u => u.id === r.authorUserId);
            return {
              ...r,
              authorName: replyAuthor?.name ?? "Participant",
              authorRole: replyAuthor?.role ?? "student",
            };
          });
        return {
          ...t,
          authorName: author?.name ?? "Participant",
          authorRole: author?.role ?? "student",
          replies,
        };
      });

    const messages = memoryDb.lmsCourseMessages
      .filter(
        m =>
          m.courseOfferingId === courseOfferingId &&
          (viewer.role === "admin" || m.senderUserId === viewer.userId || m.recipientUserId === viewer.userId),
      )
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .map(m => {
        const sender = memoryDb.users.find(u => u.id === m.senderUserId);
        const recipient = memoryDb.users.find(u => u.id === m.recipientUserId);
        return {
          ...m,
          senderName: sender?.name ?? "User",
          recipientName: recipient?.name ?? "User",
        };
      });

    // Participants list for messaging
    const messageRecipients = [
      ...instructors.map(i => ({ userId: i.id, name: i.name, role: "faculty" as const })),
      ...roster
        .map(r => {
          const st = memoryDb.students.find(s => s.id === r.studentId);
          return st?.userId
            ? { userId: st.userId, name: `${st.legalFirstName} ${st.legalLastName}`, role: "student" as const }
            : null;
        })
        .filter((p): p is NonNullable<typeof p> => p !== null),
    ].filter(p => p.userId !== viewer.userId);

    return {
      offering: {
        id: courseOfferingId,
        courseId: offering?.courseId ?? 1,
        courseCode: course?.code ?? "COURSE",
        courseTitle: course?.title ?? "Course",
        credits: course?.credits ?? 15,
        section: offering?.section ?? "A",
        termName: term?.name ?? "Academic Term",
        modality: offering?.modality ?? "in_person",
        meetingPattern: offering?.meetingPattern ?? null,
        room: offering?.room ?? null,
      },
      space,
      instructors,
      announcements,
      modules: modulesWithItems,
      assignments: assignments.filter((a): a is NonNullable<typeof a> => a !== null),
      questionBank,
      quizzes,
      categories,
      gradebook: gradebookByStudent,
      discussions: topics,
      messages,
      messageRecipients,
    };
  }

  // MySQL implementation via Drizzle
  const [offeringRow] = await db
    .select({
      id: courseOfferings.id,
      courseId: courses.id,
      courseCode: courses.code,
      courseTitle: courses.title,
      credits: courses.credits,
      section: courseOfferings.section,
      termName: academicTerms.name,
      modality: courseOfferings.modality,
      meetingPattern: courseOfferings.meetingPattern,
      room: courseOfferings.room,
    })
    .from(courseOfferings)
    .innerJoin(courses, eq(courseOfferings.courseId, courses.id))
    .innerJoin(academicTerms, eq(courseOfferings.termId, academicTerms.id))
    .where(eq(courseOfferings.id, courseOfferingId))
    .limit(1);

  const instructorRows = await db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(facultyAssignments)
    .innerJoin(users, eq(facultyAssignments.facultyUserId, users.id))
    .where(eq(facultyAssignments.courseOfferingId, courseOfferingId));

  const rawModules = await db
    .select()
    .from(lmsModules)
    .where(eq(lmsModules.courseOfferingId, courseOfferingId))
    .orderBy(asc(lmsModules.position));

  const visibleModules = isLearner
    ? rawModules.filter(m =>
        isContentVisibleToStudent({ status: m.status, publishAt: m.publishAt, availableFrom: m.unlockAt, now }),
      )
    : rawModules;

  const rawItems = await db
    .select()
    .from(lmsModuleItems)
    .where(eq(lmsModuleItems.courseOfferingId, courseOfferingId))
    .orderBy(asc(lmsModuleItems.position));

  const completions = viewer.enrollmentId
    ? await db
        .select()
        .from(lmsItemCompletions)
        .where(eq(lmsItemCompletions.enrollmentId, viewer.enrollmentId))
    : [];

  const modulesWithItems = await Promise.all(
    visibleModules.map(async mod => {
      const modItems = rawItems
        .filter(i => i.moduleId === mod.id)
        .filter(i => !isLearner || isContentVisibleToStudent({ status: i.status, publishAt: i.publishAt, now }));
      const items = await Promise.all(
        modItems.map(async item => ({
          ...item,
          completed: completions.some(c => c.moduleItemId === item.id),
          fileUrl: item.fileKey ? await storageGetSignedUrl(item.fileKey) : null,
        })),
      );
      return { ...mod, items };
    }),
  );

  const rawAnnouncements = await db
    .select({
      announcement: lmsAnnouncements,
      authorName: users.name,
    })
    .from(lmsAnnouncements)
    .leftJoin(users, eq(lmsAnnouncements.authorUserId, users.id))
    .where(eq(lmsAnnouncements.courseOfferingId, courseOfferingId))
    .orderBy(desc(lmsAnnouncements.pinned), desc(lmsAnnouncements.createdAt));

  const announcements = rawAnnouncements
    .filter(
      row =>
        !isLearner ||
        isContentVisibleToStudent({
          status: row.announcement.status,
          publishAt: row.announcement.publishAt,
          now,
        }),
    )
    .map(row => ({
      ...row.announcement,
      authorName: row.authorName ?? "Course Instructor",
    }));

  const categories = await db
    .select()
    .from(lmsGradeCategories)
    .where(eq(lmsGradeCategories.courseOfferingId, courseOfferingId))
    .orderBy(asc(lmsGradeCategories.position));

  const activities = await db
    .select()
    .from(courseActivities)
    .where(eq(courseActivities.courseOfferingId, courseOfferingId));

  const configs = await db
    .select()
    .from(lmsAssignmentConfigs)
    .where(eq(lmsAssignmentConfigs.courseOfferingId, courseOfferingId));

  const roster = await misDb.getOfferingRoster(courseOfferingId);

  const assignments = (
    await Promise.all(
      activities
        .filter(a => a.type === "assignment" || a.type === "assessment")
        .map(async act => {
          const cfg = configs.find(c => c.activityId === act.id) ?? null;
          const status: PublicationStatus = cfg?.status ?? (act.published ? "published" : "draft");
          if (
            isLearner &&
            !isContentVisibleToStudent({
              status,
              publishAt: cfg?.publishAt,
              availableFrom: cfg?.availableFrom,
              now,
            })
          ) {
            return null;
          }
          const extensions = await db
            .select()
            .from(lmsAssignmentExtensions)
            .where(eq(lmsAssignmentExtensions.activityId, act.id));
          const learnerExtension = viewer.enrollmentId
            ? extensions.find(e => e.enrollmentId === viewer.enrollmentId) ?? null
            : null;
          const allVersions = await db
            .select()
            .from(lmsSubmissionVersions)
            .where(eq(lmsSubmissionVersions.activityId, act.id))
            .orderBy(desc(lmsSubmissionVersions.attemptNumber));
          const visibleVersions = isLearner
            ? allVersions.filter(v => v.enrollmentId === viewer.enrollmentId)
            : allVersions;
          const enrichedVersions = await Promise.all(
            visibleVersions.map(async v => {
              const hideGrade = isLearner && v.gradeStatus !== "released";
              const r = roster.find(st => st.enrollmentId === v.enrollmentId);
              return {
                ...v,
                studentName: r ? `${r.legalFirstName} ${r.legalLastName}` : "Learner",
                studentNumber: r?.studentNumber ?? "",
                rawScore: hideGrade ? null : v.rawScore,
                finalScore: hideGrade ? null : v.finalScore,
                latePenaltyPoints: hideGrade ? 0 : v.latePenaltyPoints,
                feedback: hideGrade ? null : v.feedback,
                rubricScoresJson: hideGrade ? null : v.rubricScoresJson,
                attachmentUrl: v.attachmentKey ? await storageGetSignedUrl(v.attachmentKey) : null,
                annotatedFileUrl:
                  !hideGrade && v.annotatedFileKey ? await storageGetSignedUrl(v.annotatedFileKey) : null,
              };
            }),
          );
          const windowEvaluation = evaluateAssignmentSubmissionWindow({
            now,
            status,
            publishAt: cfg?.publishAt,
            availableFrom: cfg?.availableFrom,
            dueAt: act.dueAt,
            lockAt: cfg?.lockAt,
            extensionDueAt: learnerExtension?.extendedDueAt,
            latePolicy: cfg?.latePolicy ?? "accept_with_penalty",
            maxAttempts: cfg?.maxAttempts ?? 3,
            currentAttempts: visibleVersions.filter(v => !v.isDraft).length,
            allowResubmission: cfg?.allowResubmission ?? true,
          });
          return {
            id: act.id,
            title: act.title,
            description: act.description,
            type: act.type,
            dueAt: act.dueAt,
            maxScore: act.maxScore ?? 100,
            status,
            config: cfg,
            attachmentUrl: cfg?.attachmentKey ? await storageGetSignedUrl(cfg.attachmentKey) : null,
            extensions: isLearner ? (learnerExtension ? [learnerExtension] : []) : extensions,
            submissions: enrichedVersions,
            windowEvaluation,
          };
        }),
    )
  ).filter((a): a is NonNullable<typeof a> => a !== null);

  const bankRows = await db
    .select()
    .from(lmsQuestionBank)
    .where(eq(lmsQuestionBank.courseOfferingId, courseOfferingId));

  const rawQuizzes = await db
    .select()
    .from(lmsQuizzes)
    .where(eq(lmsQuizzes.courseOfferingId, courseOfferingId));

  const quizzes = await Promise.all(
    rawQuizzes
      .filter(
        q =>
          !isLearner ||
          isContentVisibleToStudent({
            status: q.status,
            publishAt: q.publishAt,
            availableFrom: q.availableFrom,
            now,
          }),
      )
      .map(async q => {
        const links = await db
          .select()
          .from(lmsQuizQuestions)
          .where(eq(lmsQuizQuestions.quizId, q.id))
          .orderBy(asc(lmsQuizQuestions.position));
        const questions = links
          .map(link => {
            const bankItem = bankRows.find(b => b.id === link.questionBankId);
            if (!bankItem) return null;
            return {
              id: bankItem.id,
              topic: bankItem.topic,
              questionType: bankItem.questionType,
              prompt: bankItem.prompt,
              options: (bankItem.optionsJson as string[]) ?? [],
              correctAnswer: isLearner && !q.gradesReleased ? null : bankItem.correctAnswerJson,
              explanation: isLearner && !q.gradesReleased ? null : bankItem.explanation,
              points: link.pointsOverride ?? bankItem.defaultPoints,
            };
          })
          .filter((item): item is NonNullable<typeof item> => item !== null);

        const rawAttempts = await db
          .select()
          .from(lmsQuizAttempts)
          .where(eq(lmsQuizAttempts.quizId, q.id))
          .orderBy(desc(lmsQuizAttempts.attemptNumber));

        const attempts = rawAttempts
          .filter(a => !isLearner || a.enrollmentId === viewer.enrollmentId)
          .map(a => {
            const r = roster.find(st => st.enrollmentId === a.enrollmentId);
            const canSeeScore =
              !isLearner ||
              q.reviewPolicy === "immediate" ||
              (q.reviewPolicy === "after_release" && (a.gradeReleased || q.gradesReleased)) ||
              (q.reviewPolicy === "after_due" && q.dueAt && now.getTime() > new Date(q.dueAt).getTime());
            return {
              ...a,
              studentName: r ? `${r.legalFirstName} ${r.legalLastName}` : "Learner",
              studentNumber: r?.studentNumber ?? "",
              autoScore: canSeeScore ? a.autoScore : null,
              manualScore: canSeeScore ? a.manualScore : null,
              totalScore: canSeeScore ? a.totalScore : null,
              passed: canSeeScore ? a.passed : null,
              instructorFeedback: canSeeScore ? a.instructorFeedback : null,
            };
          });

        return { ...q, questions, attempts };
      }),
  );

  const allGradebookEntries = await db
    .select()
    .from(lmsGradebookEntries)
    .where(eq(lmsGradebookEntries.courseOfferingId, courseOfferingId));

  const gradebook = roster
    .filter(r => !isLearner || r.enrollmentId === viewer.enrollmentId)
    .map(r => {
      const studentEntries = allGradebookEntries.filter(e => e.enrollmentId === r.enrollmentId);
      return {
        ...r,
        calculation: calculateWeightedCourseGrade(categories, studentEntries, { forStudentView: isLearner }),
      };
    });

  const rawTopics = await db
    .select({
      topic: lmsDiscussionTopics,
      authorName: users.name,
      authorRole: users.role,
    })
    .from(lmsDiscussionTopics)
    .leftJoin(users, eq(lmsDiscussionTopics.authorUserId, users.id))
    .where(eq(lmsDiscussionTopics.courseOfferingId, courseOfferingId))
    .orderBy(desc(lmsDiscussionTopics.pinned), desc(lmsDiscussionTopics.createdAt));

  const discussions = await Promise.all(
    rawTopics
      .filter(row => !isLearner || row.topic.moderationStatus !== "hidden")
      .map(async row => {
        const rawReplies = await db
          .select({
            reply: lmsDiscussionReplies,
            authorName: users.name,
            authorRole: users.role,
          })
          .from(lmsDiscussionReplies)
          .leftJoin(users, eq(lmsDiscussionReplies.authorUserId, users.id))
          .where(eq(lmsDiscussionReplies.topicId, row.topic.id))
          .orderBy(asc(lmsDiscussionReplies.createdAt));
        return {
          ...row.topic,
          authorName: row.authorName ?? "Participant",
          authorRole: row.authorRole ?? "student",
          replies: rawReplies
            .filter(r => !isLearner || r.reply.moderationStatus !== "hidden")
            .map(r => ({
              ...r.reply,
              authorName: r.authorName ?? "Participant",
              authorRole: r.authorRole ?? "student",
            })),
        };
      }),
  );

  const rawMessages = await db
    .select()
    .from(lmsCourseMessages)
    .where(eq(lmsCourseMessages.courseOfferingId, courseOfferingId))
    .orderBy(desc(lmsCourseMessages.createdAt));

  const messages = rawMessages
    .filter(
      m => viewer.role === "admin" || m.senderUserId === viewer.userId || m.recipientUserId === viewer.userId,
    )
    .map(m => ({
      ...m,
      senderName: m.senderUserId === viewer.userId ? "You" : "Course Participant",
      recipientName: m.recipientUserId === viewer.userId ? "You" : "Course Participant",
    }));

  return {
    offering: offeringRow ?? {
      id: courseOfferingId,
      courseId: 1,
      courseCode: "COURSE",
      courseTitle: "Course",
      credits: 15,
      section: "A",
      termName: "Term",
      modality: "in_person" as const,
      meetingPattern: null,
      room: null,
    },
    space,
    instructors: instructorRows.map(i => ({ id: i.id, name: i.name ?? "Instructor", email: i.email ?? "" })),
    announcements,
    modules: modulesWithItems,
    assignments,
    questionBank: isLearner ? [] : bankRows,
    quizzes,
    categories,
    gradebook,
    discussions,
    messages,
    messageRecipients: instructorRows
      .filter(i => i.id !== viewer.userId)
      .map(i => ({ userId: i.id, name: i.name ?? "Instructor", role: "faculty" as const })),
  };
}

export async function getLearnerLmsDashboard(userId: number) {
  const offerings = await listAccessibleOfferingsForUser(userId, "student");
  const db = await getDb();
  const now = new Date();

  const courseSummaries = await Promise.all(
    offerings.map(async off => {
      const enrollmentId = "enrollmentId" in off && typeof off.enrollmentId === "number" ? off.enrollmentId : null;
      const full = await getCourseSpaceFull(off.id, { userId, role: "student", enrollmentId });
      const allItems = full.modules.flatMap(m => m.items);
      const completedCount = allItems.filter(i => i.completed).length;
      const completionPercent = allItems.length > 0 ? Math.round((completedCount / allItems.length) * 100) : 0;
      const nextResumeItem = allItems.find(i => !i.completed) ?? allItems[0] ?? null;

      const upcomingAssignments = full.assignments.filter(a => {
        const hasSubmitted = a.submissions.some(s => !s.isDraft);
        if (hasSubmitted || !a.dueAt) return false;
        return new Date(a.dueAt).getTime() >= now.getTime();
      });

      const overdueAssignments = full.assignments.filter(a => {
        const hasSubmitted = a.submissions.some(s => !s.isDraft);
        if (hasSubmitted || !a.dueAt) return false;
        return new Date(a.dueAt).getTime() < now.getTime();
      });

      const myGradebook = full.gradebook[0]?.calculation ?? null;

      return {
        offeringId: off.id,
        enrollmentId,
        courseCode: off.courseCode,
        courseTitle: off.courseTitle,
        section: off.section,
        termName: off.termName,
        modality: off.modality,
        completionPercent,
        completedItems: completedCount,
        totalItems: allItems.length,
        nextResumeItem: nextResumeItem ? { id: nextResumeItem.id, title: nextResumeItem.title, itemType: nextResumeItem.itemType } : null,
        upcomingCount: upcomingAssignments.length,
        overdueCount: overdueAssignments.length,
        upcomingDeadlines: upcomingAssignments.slice(0, 3).map(a => ({
          id: a.id,
          title: a.title,
          dueAt: a.dueAt,
          courseCode: off.courseCode,
        })),
        overdueItems: overdueAssignments.map(a => ({
          id: a.id,
          title: a.title,
          dueAt: a.dueAt,
          courseCode: off.courseCode,
        })),
        latestAnnouncement: full.announcements[0] ?? null,
        currentOverallPercent: myGradebook?.overallPercent ?? null,
        currentLetterGrade: myGradebook?.letterGrade ?? null,
      };
    }),
  );

  const notifications = !db
    ? memoryDb.lmsNotifications.filter(n => n.userId === userId).slice(0, 25)
    : await db
        .select()
        .from(lmsNotifications)
        .where(eq(lmsNotifications.userId, userId))
        .orderBy(desc(lmsNotifications.createdAt))
        .limit(25);

  const prefs = !db
    ? memoryDb.lmsNotificationPreferences.find(p => p.userId === userId) ?? {
        announcements: true,
        dueDates: true,
        submissions: true,
        grades: true,
        discussions: true,
        messages: true,
      }
    : (
        await db
          .select()
          .from(lmsNotificationPreferences)
          .where(eq(lmsNotificationPreferences.userId, userId))
          .limit(1)
      )[0] ?? {
        announcements: true,
        dueDates: true,
        submissions: true,
        grades: true,
        discussions: true,
        messages: true,
      };

  return {
    courses: courseSummaries,
    notifications,
    unreadNotificationCount: notifications.filter(n => !n.readAt).length,
    preferences: prefs,
  };
}

export async function updateCourseSpaceSettings(input: {
  courseOfferingId: number;
  overview: string;
  learningOutcomes: string;
  instructorBio?: string;
  officeHours?: string;
  gradingPolicy?: string;
  latePenaltyPercentPerDay: number;
  allowDiscussions: boolean;
  allowPrivateMessages: boolean;
  retentionDays: number;
  updatedByUserId: number;
}) {
  await ensureDefaultCourseSpaceAndCategories(input.courseOfferingId);
  const db = await getDb();
  if (!db) {
    const space = memoryDb.lmsCourseSpaces.find(s => s.courseOfferingId === input.courseOfferingId)!;
    space.overview = input.overview;
    space.learningOutcomes = input.learningOutcomes;
    space.instructorBio = input.instructorBio ?? null;
    space.officeHours = input.officeHours ?? null;
    space.gradingPolicy = input.gradingPolicy ?? null;
    space.latePenaltyPercentPerDay = input.latePenaltyPercentPerDay;
    space.allowDiscussions = input.allowDiscussions;
    space.allowPrivateMessages = input.allowPrivateMessages;
    space.retentionDays = input.retentionDays;
    space.updatedByUserId = input.updatedByUserId;
    space.updatedAt = new Date();
    return space;
  }
  await db
    .update(lmsCourseSpaces)
    .set({
      overview: input.overview,
      learningOutcomes: input.learningOutcomes,
      instructorBio: input.instructorBio ?? null,
      officeHours: input.officeHours ?? null,
      gradingPolicy: input.gradingPolicy ?? null,
      latePenaltyPercentPerDay: input.latePenaltyPercentPerDay,
      allowDiscussions: input.allowDiscussions,
      allowPrivateMessages: input.allowPrivateMessages,
      retentionDays: input.retentionDays,
      updatedByUserId: input.updatedByUserId,
    })
    .where(eq(lmsCourseSpaces.courseOfferingId, input.courseOfferingId));
}

export async function createLmsModule(input: {
  courseOfferingId: number;
  title: string;
  description?: string;
  weekNumber?: number;
  status: PublicationStatus;
  publishAt?: Date;
  unlockAt?: Date;
  createdByUserId: number;
}) {
  const db = await getDb();
  if (!db) {
    const existing = memoryDb.lmsModules.filter(m => m.courseOfferingId === input.courseOfferingId);
    const position = existing.length + 1;
    const now = new Date();
    const id = memoryDb.lmsModules.length + 1;
    memoryDb.lmsModules.push({
      id,
      courseOfferingId: input.courseOfferingId,
      title: input.title,
      description: input.description ?? null,
      weekNumber: input.weekNumber ?? position,
      position,
      status: input.status,
      publishAt: input.publishAt ?? null,
      unlockAt: input.unlockAt ?? null,
      createdByUserId: input.createdByUserId,
      createdAt: now,
      updatedAt: now,
    });
    return id;
  }
  const existing = await db
    .select({ id: lmsModules.id })
    .from(lmsModules)
    .where(eq(lmsModules.courseOfferingId, input.courseOfferingId));
  const position = existing.length + 1;
  const result = await db.insert(lmsModules).values({
    ...input,
    weekNumber: input.weekNumber ?? position,
    position,
  });
  return Number(result[0].insertId);
}

export async function reorderLmsModule(input: { courseOfferingId: number; moduleId: number; direction: "up" | "down" }) {
  const db = await getDb();
  if (!db) {
    const mods = memoryDb.lmsModules
      .filter(m => m.courseOfferingId === input.courseOfferingId)
      .sort((a, b) => a.position - b.position);
    const idx = mods.findIndex(m => m.id === input.moduleId);
    if (idx === -1) return;
    const swapIdx = input.direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= mods.length) return;
    const temp = mods[idx].position;
    mods[idx].position = mods[swapIdx].position;
    mods[swapIdx].position = temp;
    return;
  }
  const mods = await db
    .select()
    .from(lmsModules)
    .where(eq(lmsModules.courseOfferingId, input.courseOfferingId))
    .orderBy(asc(lmsModules.position));
  const idx = mods.findIndex(m => m.id === input.moduleId);
  const swapIdx = input.direction === "up" ? idx - 1 : idx + 1;
  if (idx === -1 || swapIdx < 0 || swapIdx >= mods.length) return;
  await db.update(lmsModules).set({ position: mods[swapIdx].position }).where(eq(lmsModules.id, mods[idx].id));
  await db.update(lmsModules).set({ position: mods[idx].position }).where(eq(lmsModules.id, mods[swapIdx].id));
}

export async function createLmsModuleItem(input: {
  moduleId: number;
  courseOfferingId: number;
  itemType: "page" | "file" | "link" | "video" | "assignment" | "quiz" | "discussion";
  title: string;
  summary?: string;
  bodyHtml?: string;
  externalUrl?: string;
  fileKey?: string;
  fileName?: string;
  fileMimeType?: string;
  fileSizeBytes?: number;
  captionsUrl?: string;
  transcriptText?: string;
  linkedActivityId?: number;
  linkedQuizId?: number;
  estimatedMinutes?: number;
  status: PublicationStatus;
  publishAt?: Date;
  createdByUserId: number;
}) {
  const db = await getDb();
  if (!db) {
    const existing = memoryDb.lmsModuleItems.filter(i => i.moduleId === input.moduleId);
    const position = existing.length + 1;
    const now = new Date();
    const id = memoryDb.lmsModuleItems.length + 1;
    memoryDb.lmsModuleItems.push({
      id,
      moduleId: input.moduleId,
      courseOfferingId: input.courseOfferingId,
      itemType: input.itemType,
      title: input.title,
      summary: input.summary ?? null,
      bodyHtml: input.bodyHtml ?? null,
      externalUrl: input.externalUrl ?? null,
      fileKey: input.fileKey ?? null,
      fileName: input.fileName ?? null,
      fileMimeType: input.fileMimeType ?? null,
      fileSizeBytes: input.fileSizeBytes ?? null,
      captionsUrl: input.captionsUrl ?? null,
      transcriptText: input.transcriptText ?? null,
      linkedActivityId: input.linkedActivityId ?? null,
      linkedQuizId: input.linkedQuizId ?? null,
      position,
      estimatedMinutes: input.estimatedMinutes ?? 20,
      status: input.status,
      publishAt: input.publishAt ?? null,
      createdByUserId: input.createdByUserId,
      createdAt: now,
      updatedAt: now,
    });
    return id;
  }
  const existing = await db
    .select({ id: lmsModuleItems.id })
    .from(lmsModuleItems)
    .where(eq(lmsModuleItems.moduleId, input.moduleId));
  const position = existing.length + 1;
  const result = await db.insert(lmsModuleItems).values({
    ...input,
    estimatedMinutes: input.estimatedMinutes ?? 20,
    position,
  });
  return Number(result[0].insertId);
}

export async function toggleItemCompletion(input: {
  moduleItemId: number;
  enrollmentId: number;
  completed: boolean;
}) {
  const db = await getDb();
  if (!db) {
    const idx = memoryDb.lmsItemCompletions.findIndex(
      c => c.moduleItemId === input.moduleItemId && c.enrollmentId === input.enrollmentId,
    );
    if (input.completed && idx === -1) {
      memoryDb.lmsItemCompletions.push({
        id: memoryDb.lmsItemCompletions.length + 1,
        moduleItemId: input.moduleItemId,
        enrollmentId: input.enrollmentId,
        completedAt: new Date(),
      });
    } else if (!input.completed && idx !== -1) {
      memoryDb.lmsItemCompletions.splice(idx, 1);
    }
    return;
  }
  if (input.completed) {
    await db
      .insert(lmsItemCompletions)
      .values({ moduleItemId: input.moduleItemId, enrollmentId: input.enrollmentId })
      .onDuplicateKeyUpdate({ set: { completedAt: new Date() } });
  } else {
    await db
      .delete(lmsItemCompletions)
      .where(
        and(
          eq(lmsItemCompletions.moduleItemId, input.moduleItemId),
          eq(lmsItemCompletions.enrollmentId, input.enrollmentId),
        ),
      );
  }
}

export async function createConfiguredAssignment(input: {
  courseOfferingId: number;
  moduleId?: number;
  categoryId?: number;
  title: string;
  description?: string;
  dueAt?: Date;
  availableFrom?: Date;
  lockAt?: Date;
  maxScore: number;
  latePolicy: LateSubmissionPolicy;
  latePenaltyPercentPerDay: number;
  maxAttempts: number;
  allowResubmission: boolean;
  submissionMode: "individual" | "group";
  allowTextResponse: boolean;
  allowFileUpload: boolean;
  rubric?: Array<{ criterion: string; maxPoints: number; description?: string }>;
  attachmentKey?: string;
  attachmentName?: string;
  attachmentMimeType?: string;
  status: PublicationStatus;
  publishAt?: Date;
  createdByUserId: number;
}) {
  const activityId = await misDb.createCourseActivity({
    courseOfferingId: input.courseOfferingId,
    type: "assignment",
    title: input.title,
    description: input.description,
    dueAt: input.dueAt,
    maxScore: input.maxScore,
    createdByUserId: input.createdByUserId,
  });

  const db = await getDb();
  if (!db) {
    const act = memoryDb.courseActivities.find(a => a.id === activityId);
    if (act) act.published = input.status === "published";
    memoryDb.lmsAssignmentConfigs.push({
      id: memoryDb.lmsAssignmentConfigs.length + 1,
      activityId,
      courseOfferingId: input.courseOfferingId,
      moduleId: input.moduleId ?? null,
      categoryId: input.categoryId ?? null,
      availableFrom: input.availableFrom ?? null,
      lockAt: input.lockAt ?? null,
      latePolicy: input.latePolicy,
      latePenaltyPercentPerDay: input.latePenaltyPercentPerDay,
      maxAttempts: input.maxAttempts,
      allowResubmission: input.allowResubmission,
      submissionMode: input.submissionMode,
      allowTextResponse: input.allowTextResponse,
      allowFileUpload: input.allowFileUpload,
      rubricJson: input.rubric ?? [],
      attachmentKey: input.attachmentKey ?? null,
      attachmentName: input.attachmentName ?? null,
      attachmentMimeType: input.attachmentMimeType ?? null,
      status: input.status,
      publishAt: input.publishAt ?? null,
      gradesReleased: false,
      gradesReleasedAt: null,
      updatedAt: new Date(),
    });
  } else {
    await db.insert(lmsAssignmentConfigs).values({
      activityId,
      courseOfferingId: input.courseOfferingId,
      moduleId: input.moduleId ?? null,
      categoryId: input.categoryId ?? null,
      availableFrom: input.availableFrom ?? null,
      lockAt: input.lockAt ?? null,
      latePolicy: input.latePolicy,
      latePenaltyPercentPerDay: input.latePenaltyPercentPerDay,
      maxAttempts: input.maxAttempts,
      allowResubmission: input.allowResubmission,
      submissionMode: input.submissionMode,
      allowTextResponse: input.allowTextResponse,
      allowFileUpload: input.allowFileUpload,
      rubricJson: input.rubric ?? [],
      attachmentKey: input.attachmentKey ?? null,
      attachmentName: input.attachmentName ?? null,
      attachmentMimeType: input.attachmentMimeType ?? null,
      status: input.status,
      publishAt: input.publishAt ?? null,
    });
  }

  if (input.moduleId) {
    await createLmsModuleItem({
      moduleId: input.moduleId,
      courseOfferingId: input.courseOfferingId,
      itemType: "assignment",
      title: input.title,
      summary: input.description?.slice(0, 240),
      linkedActivityId: activityId,
      status: input.status,
      publishAt: input.publishAt,
      createdByUserId: input.createdByUserId,
    });
  }

  if (input.status === "published") {
    await notifyEnrolledStudents(input.courseOfferingId, {
      category: "due_date",
      title: `New Assignment: ${input.title}`,
      body: input.dueAt
        ? `Due ${input.dueAt.toLocaleDateString()} · Max score ${input.maxScore} pts`
        : `Published in course space · Max score ${input.maxScore} pts`,
    });
  }

  return activityId;
}

export async function grantAssignmentExtension(input: {
  activityId: number;
  enrollmentId: number;
  extendedDueAt: Date;
  reason: string;
  grantedByUserId: number;
}) {
  const db = await getDb();
  if (!db) {
    const existing = memoryDb.lmsAssignmentExtensions.find(
      e => e.activityId === input.activityId && e.enrollmentId === input.enrollmentId,
    );
    if (existing) {
      existing.extendedDueAt = input.extendedDueAt;
      existing.reason = input.reason;
      existing.grantedByUserId = input.grantedByUserId;
      return existing.id;
    }
    const id = memoryDb.lmsAssignmentExtensions.length + 1;
    memoryDb.lmsAssignmentExtensions.push({
      id,
      ...input,
      createdAt: new Date(),
    });
    return id;
  }
  const result = await db
    .insert(lmsAssignmentExtensions)
    .values(input)
    .onDuplicateKeyUpdate({
      set: {
        extendedDueAt: input.extendedDueAt,
        reason: input.reason,
        grantedByUserId: input.grantedByUserId,
      },
    });
  return Number(result[0].insertId);
}

export async function submitAssignmentVersion(input: {
  activityId: number;
  enrollmentId: number;
  isDraft: boolean;
  groupName?: string;
  responseText?: string;
  attachmentKey?: string;
  attachmentName?: string;
  attachmentMimeType?: string;
  attachmentSizeBytes?: number;
}) {
  const db = await getDb();
  const now = new Date();
  const receiptCode = `SUB-${nanoid(10).toUpperCase()}`;

  if (!db) {
    const act = memoryDb.courseActivities.find(a => a.id === input.activityId);
    if (!act) throw new Error("Assignment was not found.");
    const cfg = memoryDb.lmsAssignmentConfigs.find(c => c.activityId === input.activityId);
    const ext = memoryDb.lmsAssignmentExtensions.find(
      e => e.activityId === input.activityId && e.enrollmentId === input.enrollmentId,
    );
    const priorVersions = memoryDb.lmsSubmissionVersions.filter(
      v => v.activityId === input.activityId && v.enrollmentId === input.enrollmentId && !v.isDraft,
    );

    const evalWindow = evaluateAssignmentSubmissionWindow({
      now,
      status: cfg?.status ?? (act.published ? "published" : "draft"),
      publishAt: cfg?.publishAt,
      availableFrom: cfg?.availableFrom,
      dueAt: act.dueAt,
      lockAt: cfg?.lockAt,
      extensionDueAt: ext?.extendedDueAt,
      latePolicy: cfg?.latePolicy ?? "accept_with_penalty",
      maxAttempts: cfg?.maxAttempts ?? 3,
      currentAttempts: priorVersions.length,
      allowResubmission: cfg?.allowResubmission ?? true,
    });

    if (!input.isDraft && !evalWindow.allowed) {
      throw new Error(evalWindow.reason || "Submission is not permitted at this time.");
    }

    const attemptNumber = input.isDraft ? Math.max(1, priorVersions.length) : priorVersions.length + 1;
    const versionId = memoryDb.lmsSubmissionVersions.length + 1;
    memoryDb.lmsSubmissionVersions.push({
      id: versionId,
      activityId: input.activityId,
      enrollmentId: input.enrollmentId,
      attemptNumber,
      isDraft: input.isDraft,
      groupName: input.groupName ?? null,
      responseText: input.responseText ?? null,
      attachmentKey: input.attachmentKey ?? null,
      attachmentName: input.attachmentName ?? null,
      attachmentMimeType: input.attachmentMimeType ?? null,
      attachmentSizeBytes: input.attachmentSizeBytes ?? null,
      receiptCode,
      isLate: evalWindow.isLate,
      daysLate: evalWindow.daysLate,
      submittedAt: now,
      rawScore: null,
      latePenaltyPoints: 0,
      finalScore: null,
      rubricScoresJson: null,
      feedback: null,
      annotatedFileKey: null,
      annotatedFileName: null,
      gradeStatus: "draft",
      releasedAt: null,
      gradedByUserId: null,
      gradedAt: null,
    });

    if (!input.isDraft) {
      await misDb.submitCourseActivity({
        activityId: input.activityId,
        enrollmentId: input.enrollmentId,
        response: input.responseText || input.attachmentName || "Submitted file attachment",
      });
      // Sync gradebook entry as submitted
      const existingGb = memoryDb.lmsGradebookEntries.find(
        g =>
          g.enrollmentId === input.enrollmentId &&
          g.sourceType === "assignment" &&
          g.sourceId === input.activityId,
      );
      if (existingGb) {
        existingGb.status = "submitted";
        existingGb.updatedAt = now;
      } else {
        memoryDb.lmsGradebookEntries.push({
          id: memoryDb.lmsGradebookEntries.length + 1,
          courseOfferingId: act.courseOfferingId,
          enrollmentId: input.enrollmentId,
          categoryId: cfg?.categoryId ?? null,
          title: act.title,
          sourceType: "assignment",
          sourceId: act.id,
          score: null,
          maxScore: act.maxScore ?? 100,
          status: "submitted",
          feedback: null,
          releasedAt: null,
          updatedByUserId: null,
          updatedAt: now,
        });
      }
    }

    return {
      versionId,
      receiptCode,
      attemptNumber,
      isLate: evalWindow.isLate,
      daysLate: evalWindow.daysLate,
      submittedAt: now,
    };
  }

  // MySQL implementation
  const [act] = await db.select().from(courseActivities).where(eq(courseActivities.id, input.activityId)).limit(1);
  if (!act) throw new Error("Assignment was not found.");
  const [cfg] = await db
    .select()
    .from(lmsAssignmentConfigs)
    .where(eq(lmsAssignmentConfigs.activityId, input.activityId))
    .limit(1);
  const [ext] = await db
    .select()
    .from(lmsAssignmentExtensions)
    .where(
      and(
        eq(lmsAssignmentExtensions.activityId, input.activityId),
        eq(lmsAssignmentExtensions.enrollmentId, input.enrollmentId),
      ),
    )
    .limit(1);
  const priorVersions = await db
    .select()
    .from(lmsSubmissionVersions)
    .where(
      and(
        eq(lmsSubmissionVersions.activityId, input.activityId),
        eq(lmsSubmissionVersions.enrollmentId, input.enrollmentId),
        eq(lmsSubmissionVersions.isDraft, false),
      ),
    );

  const evalWindow = evaluateAssignmentSubmissionWindow({
    now,
    status: cfg?.status ?? (act.published ? "published" : "draft"),
    publishAt: cfg?.publishAt,
    availableFrom: cfg?.availableFrom,
    dueAt: act.dueAt,
    lockAt: cfg?.lockAt,
    extensionDueAt: ext?.extendedDueAt,
    latePolicy: cfg?.latePolicy ?? "accept_with_penalty",
    maxAttempts: cfg?.maxAttempts ?? 3,
    currentAttempts: priorVersions.length,
    allowResubmission: cfg?.allowResubmission ?? true,
  });

  if (!input.isDraft && !evalWindow.allowed) {
    throw new Error(evalWindow.reason || "Submission is not permitted at this time.");
  }

  const attemptNumber = input.isDraft ? Math.max(1, priorVersions.length) : priorVersions.length + 1;
  const result = await db.insert(lmsSubmissionVersions).values({
    activityId: input.activityId,
    enrollmentId: input.enrollmentId,
    attemptNumber,
    isDraft: input.isDraft,
    groupName: input.groupName ?? null,
    responseText: input.responseText ?? null,
    attachmentKey: input.attachmentKey ?? null,
    attachmentName: input.attachmentName ?? null,
    attachmentMimeType: input.attachmentMimeType ?? null,
    attachmentSizeBytes: input.attachmentSizeBytes ?? null,
    receiptCode,
    isLate: evalWindow.isLate,
    daysLate: evalWindow.daysLate,
    submittedAt: now,
  });

  if (!input.isDraft) {
    await misDb.submitCourseActivity({
      activityId: input.activityId,
      enrollmentId: input.enrollmentId,
      response: input.responseText || input.attachmentName || "Submitted file attachment",
    });
  }

  return {
    versionId: Number(result[0].insertId),
    receiptCode,
    attemptNumber,
    isLate: evalWindow.isLate,
    daysLate: evalWindow.daysLate,
    submittedAt: now,
  };
}

export async function gradeAssignmentSubmissionVersion(input: {
  courseOfferingId: number;
  activityId: number;
  enrollmentId: number;
  rawScore: number;
  feedback?: string;
  rubricScores?: Record<string, number>;
  annotatedFileKey?: string;
  annotatedFileName?: string;
  releaseGrade: boolean;
  gradedByUserId: number;
}) {
  const db = await getDb();
  const now = new Date();

  if (!db) {
    const act = memoryDb.courseActivities.find(a => a.id === input.activityId);
    if (!act) throw new Error("Assignment was not found.");
    const maxScore = act.maxScore ?? 100;
    if (input.rawScore < 0 || input.rawScore > maxScore) {
      throw new Error(`Raw score must be between 0 and ${maxScore}.`);
    }
    const cfg = memoryDb.lmsAssignmentConfigs.find(c => c.activityId === input.activityId);
    const versions = memoryDb.lmsSubmissionVersions
      .filter(v => v.activityId === input.activityId && v.enrollmentId === input.enrollmentId)
      .sort((a, b) => b.attemptNumber - a.attemptNumber);

    let latest = versions[0];
    if (!latest) {
      latest = {
        id: memoryDb.lmsSubmissionVersions.length + 1,
        activityId: input.activityId,
        enrollmentId: input.enrollmentId,
        attemptNumber: 1,
        isDraft: false,
        groupName: null,
        responseText: null,
        attachmentKey: null,
        attachmentName: null,
        attachmentMimeType: null,
        attachmentSizeBytes: null,
        receiptCode: `SUB-${nanoid(10).toUpperCase()}`,
        isLate: false,
        daysLate: 0,
        submittedAt: now,
        rawScore: null,
        latePenaltyPoints: 0,
        finalScore: null,
        rubricScoresJson: null,
        feedback: null,
        annotatedFileKey: null,
        annotatedFileName: null,
        gradeStatus: "draft",
        releasedAt: null,
        gradedByUserId: null,
        gradedAt: null,
      };
      memoryDb.lmsSubmissionVersions.push(latest);
    }

    const penaltyCalc = computeAssignmentPenaltyScore({
      rawScore: input.rawScore,
      maxScore,
      isLate: latest.isLate,
      daysLate: latest.daysLate,
      latePolicy: cfg?.latePolicy ?? "accept_with_penalty",
      latePenaltyPercentPerDay: cfg?.latePenaltyPercentPerDay ?? 10,
    });

    latest.rawScore = input.rawScore;
    latest.latePenaltyPoints = penaltyCalc.penaltyPoints;
    latest.finalScore = penaltyCalc.finalScore;
    latest.feedback = input.feedback ?? null;
    latest.rubricScoresJson = input.rubricScores ?? null;
    if (input.annotatedFileKey) latest.annotatedFileKey = input.annotatedFileKey;
    if (input.annotatedFileName) latest.annotatedFileName = input.annotatedFileName;
    latest.gradeStatus = input.releaseGrade ? "released" : "draft";
    latest.releasedAt = input.releaseGrade ? now : null;
    latest.gradedByUserId = input.gradedByUserId;
    latest.gradedAt = now;

    await misDb.gradeCourseActivity({
      activityId: input.activityId,
      enrollmentId: input.enrollmentId,
      score: penaltyCalc.finalScore,
      feedback: input.feedback,
      gradedByUserId: input.gradedByUserId,
    });

    const gbStatus: GradeItemStatus = input.releaseGrade ? "released" : "draft_grade";
    const existingGb = memoryDb.lmsGradebookEntries.find(
      g =>
        g.enrollmentId === input.enrollmentId &&
        g.sourceType === "assignment" &&
        g.sourceId === input.activityId,
    );
    if (existingGb) {
      existingGb.score = penaltyCalc.finalScore;
      existingGb.maxScore = maxScore;
      existingGb.status = gbStatus;
      existingGb.feedback = input.feedback ?? null;
      existingGb.releasedAt = input.releaseGrade ? now : null;
      existingGb.updatedByUserId = input.gradedByUserId;
      existingGb.updatedAt = now;
    } else {
      memoryDb.lmsGradebookEntries.push({
        id: memoryDb.lmsGradebookEntries.length + 1,
        courseOfferingId: input.courseOfferingId,
        enrollmentId: input.enrollmentId,
        categoryId: cfg?.categoryId ?? null,
        title: act.title,
        sourceType: "assignment",
        sourceId: act.id,
        score: penaltyCalc.finalScore,
        maxScore,
        status: gbStatus,
        feedback: input.feedback ?? null,
        releasedAt: input.releaseGrade ? now : null,
        updatedByUserId: input.gradedByUserId,
        updatedAt: now,
      });
    }

    if (input.releaseGrade) {
      const enroll = memoryDb.enrollments.find(e => e.id === input.enrollmentId);
      const st = enroll ? memoryDb.students.find(s => s.id === enroll.studentId) : undefined;
      if (st?.userId) {
        await createNotification({
          userId: st.userId,
          courseOfferingId: input.courseOfferingId,
          category: "grade_released",
          title: `Grade Released: ${act.title}`,
          body: `Your submission was graded (${penaltyCalc.finalScore}/${maxScore}).`,
        });
      }
    }

    return {
      finalScore: penaltyCalc.finalScore,
      penaltyPoints: penaltyCalc.penaltyPoints,
      gradeStatus: latest.gradeStatus,
    };
  }

  // MySQL implementation
  const [act] = await db.select().from(courseActivities).where(eq(courseActivities.id, input.activityId)).limit(1);
  if (!act) throw new Error("Assignment was not found.");
  const maxScore = act.maxScore ?? 100;
  const [cfg] = await db
    .select()
    .from(lmsAssignmentConfigs)
    .where(eq(lmsAssignmentConfigs.activityId, input.activityId))
    .limit(1);
  const versions = await db
    .select()
    .from(lmsSubmissionVersions)
    .where(
      and(
        eq(lmsSubmissionVersions.activityId, input.activityId),
        eq(lmsSubmissionVersions.enrollmentId, input.enrollmentId),
      ),
    )
    .orderBy(desc(lmsSubmissionVersions.attemptNumber));
  const latest = versions[0];
  const penaltyCalc = computeAssignmentPenaltyScore({
    rawScore: input.rawScore,
    maxScore,
    isLate: latest?.isLate ?? false,
    daysLate: latest?.daysLate ?? 0,
    latePolicy: cfg?.latePolicy ?? "accept_with_penalty",
    latePenaltyPercentPerDay: cfg?.latePenaltyPercentPerDay ?? 10,
  });

  if (latest) {
    await db
      .update(lmsSubmissionVersions)
      .set({
        rawScore: input.rawScore,
        latePenaltyPoints: penaltyCalc.penaltyPoints,
        finalScore: penaltyCalc.finalScore,
        feedback: input.feedback ?? null,
        rubricScoresJson: input.rubricScores ?? null,
        gradeStatus: input.releaseGrade ? "released" : "draft",
        releasedAt: input.releaseGrade ? now : null,
        gradedByUserId: input.gradedByUserId,
        gradedAt: now,
      })
      .where(eq(lmsSubmissionVersions.id, latest.id));
  }

  await misDb.gradeCourseActivity({
    activityId: input.activityId,
    enrollmentId: input.enrollmentId,
    score: penaltyCalc.finalScore,
    feedback: input.feedback,
    gradedByUserId: input.gradedByUserId,
  });

  return {
    finalScore: penaltyCalc.finalScore,
    penaltyPoints: penaltyCalc.penaltyPoints,
    gradeStatus: input.releaseGrade ? ("released" as const) : ("draft" as const),
  };
}

export async function createQuestionBankEntry(input: {
  courseOfferingId: number;
  topic: string;
  questionType: QuizQuestionType;
  prompt: string;
  options: string[];
  correctAnswer: string | string[];
  explanation?: string;
  defaultPoints: number;
  createdByUserId: number;
}) {
  const db = await getDb();
  if (!db) {
    const offering = memoryDb.offerings.find(o => o.id === input.courseOfferingId);
    const id = memoryDb.lmsQuestionBank.length + 1;
    memoryDb.lmsQuestionBank.push({
      id,
      courseId: offering?.courseId ?? null,
      courseOfferingId: input.courseOfferingId,
      topic: input.topic,
      questionType: input.questionType,
      prompt: input.prompt,
      optionsJson: input.options,
      correctAnswerJson: input.correctAnswer,
      explanation: input.explanation ?? null,
      defaultPoints: input.defaultPoints,
      createdByUserId: input.createdByUserId,
      createdAt: new Date(),
    });
    return id;
  }
  const result = await db.insert(lmsQuestionBank).values({
    courseOfferingId: input.courseOfferingId,
    topic: input.topic,
    questionType: input.questionType,
    prompt: input.prompt,
    optionsJson: input.options,
    correctAnswerJson: input.correctAnswer,
    explanation: input.explanation ?? null,
    defaultPoints: input.defaultPoints,
    createdByUserId: input.createdByUserId,
  });
  return Number(result[0].insertId);
}

export async function createQuizWithQuestions(input: {
  courseOfferingId: number;
  moduleId?: number;
  categoryId?: number;
  title: string;
  instructions?: string;
  status: PublicationStatus;
  publishAt?: Date;
  availableFrom?: Date;
  dueAt?: Date;
  timeLimitMinutes: number;
  maxAttempts: number;
  passMarkPercent: number;
  randomizeQuestions: boolean;
  randomizeOptions: boolean;
  reviewPolicy: QuizReviewPolicy;
  questionBankIds: number[];
  createdByUserId: number;
}) {
  const db = await getDb();
  const now = new Date();
  let quizId: number;

  if (!db) {
    quizId = memoryDb.lmsQuizzes.length + 1;
    memoryDb.lmsQuizzes.push({
      id: quizId,
      courseOfferingId: input.courseOfferingId,
      moduleId: input.moduleId ?? null,
      categoryId: input.categoryId ?? null,
      title: input.title,
      instructions: input.instructions ?? null,
      status: input.status,
      publishAt: input.publishAt ?? null,
      availableFrom: input.availableFrom ?? null,
      dueAt: input.dueAt ?? null,
      timeLimitMinutes: input.timeLimitMinutes,
      maxAttempts: input.maxAttempts,
      passMarkPercent: input.passMarkPercent,
      randomizeQuestions: input.randomizeQuestions,
      randomizeOptions: input.randomizeOptions,
      reviewPolicy: input.reviewPolicy,
      gradesReleased: input.reviewPolicy === "immediate",
      createdByUserId: input.createdByUserId,
      createdAt: now,
      updatedAt: now,
    });
    input.questionBankIds.forEach((qid, index) => {
      memoryDb.lmsQuizQuestions.push({
        id: memoryDb.lmsQuizQuestions.length + 1,
        quizId,
        questionBankId: qid,
        position: index + 1,
        pointsOverride: null,
      });
    });
  } else {
    const result = await db.insert(lmsQuizzes).values({
      courseOfferingId: input.courseOfferingId,
      moduleId: input.moduleId ?? null,
      categoryId: input.categoryId ?? null,
      title: input.title,
      instructions: input.instructions ?? null,
      status: input.status,
      publishAt: input.publishAt ?? null,
      availableFrom: input.availableFrom ?? null,
      dueAt: input.dueAt ?? null,
      timeLimitMinutes: input.timeLimitMinutes,
      maxAttempts: input.maxAttempts,
      passMarkPercent: input.passMarkPercent,
      randomizeQuestions: input.randomizeQuestions,
      randomizeOptions: input.randomizeOptions,
      reviewPolicy: input.reviewPolicy,
      gradesReleased: input.reviewPolicy === "immediate",
      createdByUserId: input.createdByUserId,
    });
    quizId = Number(result[0].insertId);
    for (let i = 0; i < input.questionBankIds.length; i++) {
      await db.insert(lmsQuizQuestions).values({
        quizId,
        questionBankId: input.questionBankIds[i],
        position: i + 1,
      });
    }
  }

  if (input.moduleId) {
    await createLmsModuleItem({
      moduleId: input.moduleId,
      courseOfferingId: input.courseOfferingId,
      itemType: "quiz",
      title: input.title,
      summary: input.instructions?.slice(0, 240),
      linkedQuizId: quizId,
      estimatedMinutes: input.timeLimitMinutes,
      status: input.status,
      publishAt: input.publishAt,
      createdByUserId: input.createdByUserId,
    });
  }

  return quizId;
}

export async function startOrResumeQuizAttempt(input: { quizId: number; enrollmentId: number }) {
  const db = await getDb();
  const now = new Date();

  if (!db) {
    const quiz = memoryDb.lmsQuizzes.find(q => q.id === input.quizId);
    if (!quiz) throw new Error("Quiz was not found.");

    const existingAttempts = memoryDb.lmsQuizAttempts.filter(
      a => a.quizId === input.quizId && a.enrollmentId === input.enrollmentId,
    );
    const activeAttempt = existingAttempts.find(a => a.status === "in_progress");
    if (activeAttempt) {
      if (
        isQuizAttemptWithinTimeLimit({
          startedAt: activeAttempt.startedAt,
          timeLimitMinutes: quiz.timeLimitMinutes,
          now,
        })
      ) {
        return activeAttempt;
      }
      activeAttempt.status = "expired";
    }

    const completedCount = existingAttempts.filter(a => a.status !== "in_progress").length;
    const windowCheck = evaluateQuizAttemptWindow({
      now,
      status: quiz.status,
      publishAt: quiz.publishAt,
      availableFrom: quiz.availableFrom,
      dueAt: quiz.dueAt,
      maxAttempts: quiz.maxAttempts,
      completedAttempts: completedCount,
      timeLimitMinutes: quiz.timeLimitMinutes,
    });

    if (!windowCheck.allowed) {
      throw new Error(windowCheck.reason || "Cannot start quiz attempt.");
    }

    const qLinks = memoryDb.lmsQuizQuestions
      .filter(l => l.quizId === quiz.id)
      .sort((a, b) => a.position - b.position)
      .map(l => l.questionBankId);
    const orderedIds = quiz.randomizeQuestions ? [...qLinks].sort(() => Math.random() - 0.5) : qLinks;

    const attempt = {
      id: memoryDb.lmsQuizAttempts.length + 1,
      quizId: quiz.id,
      enrollmentId: input.enrollmentId,
      attemptNumber: completedCount + 1,
      status: "in_progress" as const,
      startedAt: now,
      expiresAt: windowCheck.expiresAt,
      lastSavedAt: now,
      submittedAt: null,
      answersJson: {} as Record<string, string | string[]>,
      questionOrderJson: orderedIds,
      autoScore: 0,
      manualScore: 0,
      totalScore: 0,
      maxScore: 0,
      passed: null,
      instructorFeedback: null,
      gradeReleased: quiz.reviewPolicy === "immediate",
      gradedByUserId: null,
      gradedAt: null,
    };
    memoryDb.lmsQuizAttempts.push(attempt);
    return attempt;
  }

  const [quiz] = await db.select().from(lmsQuizzes).where(eq(lmsQuizzes.id, input.quizId)).limit(1);
  if (!quiz) throw new Error("Quiz was not found.");
  const existingAttempts = await db
    .select()
    .from(lmsQuizAttempts)
    .where(and(eq(lmsQuizAttempts.quizId, input.quizId), eq(lmsQuizAttempts.enrollmentId, input.enrollmentId)));

  const activeAttempt = existingAttempts.find(a => a.status === "in_progress");
  if (activeAttempt) {
    if (
      isQuizAttemptWithinTimeLimit({
        startedAt: activeAttempt.startedAt,
        timeLimitMinutes: quiz.timeLimitMinutes,
        now,
      })
    ) {
      return activeAttempt;
    }
    await db.update(lmsQuizAttempts).set({ status: "expired" }).where(eq(lmsQuizAttempts.id, activeAttempt.id));
  }

  const completedCount = existingAttempts.filter(a => a.status !== "in_progress").length;
  const windowCheck = evaluateQuizAttemptWindow({
    now,
    status: quiz.status,
    publishAt: quiz.publishAt,
    availableFrom: quiz.availableFrom,
    dueAt: quiz.dueAt,
    maxAttempts: quiz.maxAttempts,
    completedAttempts: completedCount,
    timeLimitMinutes: quiz.timeLimitMinutes,
  });

  if (!windowCheck.allowed) {
    throw new Error(windowCheck.reason || "Cannot start quiz attempt.");
  }

  const qLinks = await db
    .select()
    .from(lmsQuizQuestions)
    .where(eq(lmsQuizQuestions.quizId, quiz.id))
    .orderBy(asc(lmsQuizQuestions.position));
  const ids = qLinks.map(l => l.questionBankId);
  const orderedIds = quiz.randomizeQuestions ? [...ids].sort(() => Math.random() - 0.5) : ids;

  const result = await db.insert(lmsQuizAttempts).values({
    quizId: quiz.id,
    enrollmentId: input.enrollmentId,
    attemptNumber: completedCount + 1,
    status: "in_progress",
    startedAt: now,
    expiresAt: windowCheck.expiresAt,
    lastSavedAt: now,
    answersJson: {},
    questionOrderJson: orderedIds,
    gradeReleased: quiz.reviewPolicy === "immediate",
  });
  const [created] = await db
    .select()
    .from(lmsQuizAttempts)
    .where(eq(lmsQuizAttempts.id, Number(result[0].insertId)))
    .limit(1);
  return created!;
}

export async function autosaveQuizAttempt(input: {
  attemptId: number;
  enrollmentId: number;
  answers: Record<string, string | string[]>;
}) {
  const db = await getDb();
  const now = new Date();
  if (!db) {
    const attempt = memoryDb.lmsQuizAttempts.find(
      a => a.id === input.attemptId && a.enrollmentId === input.enrollmentId,
    );
    if (!attempt || attempt.status !== "in_progress") {
      throw new Error("Active quiz attempt was not found.");
    }
    const quiz = memoryDb.lmsQuizzes.find(q => q.id === attempt.quizId)!;
    if (
      !isQuizAttemptWithinTimeLimit({
        startedAt: attempt.startedAt,
        timeLimitMinutes: quiz.timeLimitMinutes,
        now,
      })
    ) {
      attempt.status = "expired";
      throw new Error("Quiz time limit has expired.");
    }
    attempt.answersJson = input.answers;
    attempt.lastSavedAt = now;
    return { lastSavedAt: now };
  }
  const [attempt] = await db
    .select()
    .from(lmsQuizAttempts)
    .where(and(eq(lmsQuizAttempts.id, input.attemptId), eq(lmsQuizAttempts.enrollmentId, input.enrollmentId)))
    .limit(1);
  if (!attempt || attempt.status !== "in_progress") {
    throw new Error("Active quiz attempt was not found.");
  }
  await db
    .update(lmsQuizAttempts)
    .set({ answersJson: input.answers, lastSavedAt: now })
    .where(eq(lmsQuizAttempts.id, attempt.id));
  return { lastSavedAt: now };
}

export async function submitQuizAttempt(input: {
  attemptId: number;
  enrollmentId: number;
  answers: Record<string, string | string[]>;
}) {
  const db = await getDb();
  const now = new Date();

  if (!db) {
    const attempt = memoryDb.lmsQuizAttempts.find(
      a => a.id === input.attemptId && a.enrollmentId === input.enrollmentId,
    );
    if (!attempt) throw new Error("Quiz attempt was not found.");
    if (attempt.status !== "in_progress") {
      throw new Error("This quiz attempt has already been submitted.");
    }
    const quiz = memoryDb.lmsQuizzes.find(q => q.id === attempt.quizId)!;
    if (
      !isQuizAttemptWithinTimeLimit({
        startedAt: attempt.startedAt,
        timeLimitMinutes: quiz.timeLimitMinutes,
        now,
      })
    ) {
      attempt.status = "expired";
      throw new Error("Quiz attempt exceeded the allowed time limit.");
    }

    const qLinks = memoryDb.lmsQuizQuestions.filter(l => l.quizId === quiz.id);
    const definitions: QuizQuestionDefinition[] = qLinks
      .map(l => {
        const bank = memoryDb.lmsQuestionBank.find(b => b.id === l.questionBankId);
        if (!bank) return null;
        return {
          id: bank.id,
          questionType: bank.questionType,
          prompt: bank.prompt,
          options: (bank.optionsJson as string[]) ?? [],
          correctAnswer: bank.correctAnswerJson as string | string[],
          points: l.pointsOverride ?? bank.defaultPoints,
        };
      })
      .filter((d): d is NonNullable<typeof d> => d !== null);

    const graded = gradeQuizQuestions(definitions, input.answers, quiz.passMarkPercent);
    attempt.answersJson = input.answers;
    attempt.submittedAt = now;
    attempt.lastSavedAt = now;
    attempt.autoScore = graded.autoScore;
    attempt.totalScore = graded.totalScore;
    attempt.maxScore = graded.maxScore;
    attempt.passed = graded.passed;
    attempt.status = graded.requiresManualGrading ? "submitted" : "auto_graded";
    attempt.gradeReleased = !graded.requiresManualGrading && (quiz.reviewPolicy === "immediate" || quiz.gradesReleased);

    // Sync to gradebook
    const gbStatus: GradeItemStatus = attempt.gradeReleased
      ? "released"
      : graded.requiresManualGrading
        ? "submitted"
        : "draft_grade";
    const existingGb = memoryDb.lmsGradebookEntries.find(
      g => g.enrollmentId === input.enrollmentId && g.sourceType === "quiz" && g.sourceId === quiz.id,
    );
    if (existingGb) {
      if (attempt.totalScore >= (existingGb.score ?? 0)) {
        existingGb.score = attempt.totalScore;
        existingGb.maxScore = attempt.maxScore;
        existingGb.status = gbStatus;
        existingGb.releasedAt = attempt.gradeReleased ? now : null;
        existingGb.updatedAt = now;
      }
    } else {
      memoryDb.lmsGradebookEntries.push({
        id: memoryDb.lmsGradebookEntries.length + 1,
        courseOfferingId: quiz.courseOfferingId,
        enrollmentId: input.enrollmentId,
        categoryId: quiz.categoryId ?? null,
        title: quiz.title,
        sourceType: "quiz",
        sourceId: quiz.id,
        score: attempt.totalScore,
        maxScore: attempt.maxScore || 100,
        status: gbStatus,
        feedback: null,
        releasedAt: attempt.gradeReleased ? now : null,
        updatedByUserId: null,
        updatedAt: now,
      });
    }

    return {
      attemptId: attempt.id,
      status: attempt.status,
      autoScore: attempt.gradeReleased ? graded.autoScore : null,
      maxScore: graded.maxScore,
      passed: attempt.gradeReleased ? graded.passed : null,
      requiresManualGrading: graded.requiresManualGrading,
    };
  }

  // MySQL implementation
  const [attempt] = await db
    .select()
    .from(lmsQuizAttempts)
    .where(and(eq(lmsQuizAttempts.id, input.attemptId), eq(lmsQuizAttempts.enrollmentId, input.enrollmentId)))
    .limit(1);
  if (!attempt || attempt.status !== "in_progress") {
    throw new Error("Active quiz attempt was not found.");
  }
  const [quiz] = await db.select().from(lmsQuizzes).where(eq(lmsQuizzes.id, attempt.quizId)).limit(1);
  if (!quiz) throw new Error("Quiz was not found.");
  if (
    !isQuizAttemptWithinTimeLimit({
      startedAt: attempt.startedAt,
      timeLimitMinutes: quiz.timeLimitMinutes,
      now,
    })
  ) {
    await db.update(lmsQuizAttempts).set({ status: "expired" }).where(eq(lmsQuizAttempts.id, attempt.id));
    throw new Error("Quiz attempt exceeded the allowed time limit.");
  }

  const qLinks = await db.select().from(lmsQuizQuestions).where(eq(lmsQuizQuestions.quizId, quiz.id));
  const bankRows = await db
    .select()
    .from(lmsQuestionBank)
    .where(eq(lmsQuestionBank.courseOfferingId, quiz.courseOfferingId));
  const definitions: QuizQuestionDefinition[] = qLinks
    .map(l => {
      const bank = bankRows.find(b => b.id === l.questionBankId);
      if (!bank) return null;
      return {
        id: bank.id,
        questionType: bank.questionType,
        prompt: bank.prompt,
        options: (bank.optionsJson as string[]) ?? [],
        correctAnswer: bank.correctAnswerJson as string | string[],
        points: l.pointsOverride ?? bank.defaultPoints,
      };
    })
    .filter((d): d is NonNullable<typeof d> => d !== null);

  const graded = gradeQuizQuestions(definitions, input.answers, quiz.passMarkPercent);
  const status = graded.requiresManualGrading ? ("submitted" as const) : ("auto_graded" as const);
  const gradeReleased = !graded.requiresManualGrading && (quiz.reviewPolicy === "immediate" || quiz.gradesReleased);

  await db
    .update(lmsQuizAttempts)
    .set({
      answersJson: input.answers,
      submittedAt: now,
      lastSavedAt: now,
      autoScore: graded.autoScore,
      totalScore: graded.totalScore,
      maxScore: graded.maxScore,
      passed: graded.passed,
      status,
      gradeReleased,
    })
    .where(eq(lmsQuizAttempts.id, attempt.id));

  return {
    attemptId: attempt.id,
    status,
    autoScore: gradeReleased ? graded.autoScore : null,
    maxScore: graded.maxScore,
    passed: gradeReleased ? graded.passed : null,
    requiresManualGrading: graded.requiresManualGrading,
  };
}

export async function gradeQuizAttemptInstructor(input: {
  attemptId: number;
  courseOfferingId: number;
  manualScore: number;
  instructorFeedback?: string;
  releaseGrade: boolean;
  gradedByUserId: number;
}) {
  const db = await getDb();
  const now = new Date();
  if (!db) {
    const attempt = memoryDb.lmsQuizAttempts.find(a => a.id === input.attemptId);
    if (!attempt) throw new Error("Quiz attempt was not found.");
    const quiz = memoryDb.lmsQuizzes.find(q => q.id === attempt.quizId);
    if (!quiz || quiz.courseOfferingId !== input.courseOfferingId) {
      throw new Error("Quiz attempt does not belong to this course offering.");
    }
    const totalScore = Math.min(attempt.maxScore, Math.max(0, attempt.autoScore + input.manualScore));
    const percent = attempt.maxScore > 0 ? (totalScore / attempt.maxScore) * 100 : 0;
    attempt.manualScore = input.manualScore;
    attempt.totalScore = totalScore;
    attempt.passed = percent >= quiz.passMarkPercent;
    attempt.instructorFeedback = input.instructorFeedback ?? null;
    attempt.status = "graded";
    attempt.gradeReleased = input.releaseGrade;
    attempt.gradedByUserId = input.gradedByUserId;
    attempt.gradedAt = now;

    const existingGb = memoryDb.lmsGradebookEntries.find(
      g => g.enrollmentId === attempt.enrollmentId && g.sourceType === "quiz" && g.sourceId === quiz.id,
    );
    if (existingGb) {
      existingGb.score = totalScore;
      existingGb.status = input.releaseGrade ? "released" : "draft_grade";
      existingGb.feedback = input.instructorFeedback ?? null;
      existingGb.releasedAt = input.releaseGrade ? now : null;
      existingGb.updatedByUserId = input.gradedByUserId;
      existingGb.updatedAt = now;
    }
    return attempt;
  }
  const [attempt] = await db.select().from(lmsQuizAttempts).where(eq(lmsQuizAttempts.id, input.attemptId)).limit(1);
  if (!attempt) throw new Error("Quiz attempt was not found.");
  const totalScore = Math.min(attempt.maxScore, Math.max(0, attempt.autoScore + input.manualScore));
  await db
    .update(lmsQuizAttempts)
    .set({
      manualScore: input.manualScore,
      totalScore,
      instructorFeedback: input.instructorFeedback ?? null,
      status: "graded",
      gradeReleased: input.releaseGrade,
      gradedByUserId: input.gradedByUserId,
      gradedAt: now,
    })
    .where(eq(lmsQuizAttempts.id, attempt.id));
  return attempt;
}

export async function upsertManualGradebookItem(input: {
  courseOfferingId: number;
  enrollmentId: number;
  categoryId?: number;
  title: string;
  score: number | null;
  maxScore: number;
  status: GradeItemStatus;
  feedback?: string;
  changeReason?: string;
  actorUserId: number;
}) {
  const db = await getDb();
  const now = new Date();
  if (!db) {
    const existing = memoryDb.lmsGradebookEntries.find(
      e =>
        e.courseOfferingId === input.courseOfferingId &&
        e.enrollmentId === input.enrollmentId &&
        e.title.toLowerCase() === input.title.toLowerCase(),
    );
    if (existing && existing.status === "released" && !input.changeReason?.trim()) {
      throw new Error(
        "Changing a previously released grade requires an explicit audit reason so affected learners are notified.",
      );
    }
    const wasReleased = existing?.status === "released";
    const previousScore = existing?.score ?? null;

    if (existing) {
      existing.categoryId = input.categoryId ?? existing.categoryId;
      existing.score = input.score;
      existing.maxScore = input.maxScore;
      existing.status = input.status;
      existing.feedback = input.feedback ?? null;
      existing.releasedAt = input.status === "released" ? now : existing.releasedAt;
      existing.updatedByUserId = input.actorUserId;
      existing.updatedAt = now;
    } else {
      memoryDb.lmsGradebookEntries.push({
        id: memoryDb.lmsGradebookEntries.length + 1,
        courseOfferingId: input.courseOfferingId,
        enrollmentId: input.enrollmentId,
        categoryId: input.categoryId ?? null,
        title: input.title,
        sourceType: "manual",
        sourceId: null,
        score: input.score,
        maxScore: input.maxScore,
        status: input.status,
        feedback: input.feedback ?? null,
        releasedAt: input.status === "released" ? now : null,
        updatedByUserId: input.actorUserId,
        updatedAt: now,
      });
    }

    if (input.status === "released" || wasReleased) {
      const enroll = memoryDb.enrollments.find(e => e.id === input.enrollmentId);
      const st = enroll ? memoryDb.students.find(s => s.id === enroll.studentId) : undefined;
      if (st?.userId) {
        await createNotification({
          userId: st.userId,
          courseOfferingId: input.courseOfferingId,
          category: "grade_released",
          title: wasReleased ? `Released Grade Updated: ${input.title}` : `Grade Released: ${input.title}`,
          body: wasReleased
            ? `Updated from ${previousScore ?? "—"} to ${input.score ?? "—"}/${input.maxScore}. Reason: ${input.changeReason}`
            : `Score: ${input.score ?? "—"}/${input.maxScore}.`,
        });
      }
    }

    return { wasReleased, previousScore };
  }

  await db.insert(lmsGradebookEntries).values({
    courseOfferingId: input.courseOfferingId,
    enrollmentId: input.enrollmentId,
    categoryId: input.categoryId ?? null,
    title: input.title,
    sourceType: "manual",
    score: input.score,
    maxScore: input.maxScore,
    status: input.status,
    feedback: input.feedback ?? null,
    releasedAt: input.status === "released" ? now : null,
    updatedByUserId: input.actorUserId,
  });
  return { wasReleased: false, previousScore: null };
}

export async function publishCourseGradeToOfficialRecord(input: {
  courseOfferingId: number;
  enrollmentId: number;
  actorUserId: number;
}) {
  const full = await getCourseSpaceFull(input.courseOfferingId, {
    userId: input.actorUserId,
    role: "admin",
    enrollmentId: null,
  });
  const studentRow = full.gradebook.find(g => g.enrollmentId === input.enrollmentId);
  if (!studentRow || studentRow.calculation.roundedInstitutionalScore === null) {
    throw new Error("Cannot publish official result: learner does not have graded items to compute a final score.");
  }
  const score = studentRow.calculation.roundedInstitutionalScore;
  const officialGrade = await misDb.upsertGrade({
    enrollmentId: input.enrollmentId,
    score,
    status: "published",
    enteredByUserId: input.actorUserId,
  });
  return {
    score,
    letterGrade: officialGrade.letterGrade,
    explanation: studentRow.calculation.explanation,
  };
}

export async function createAnnouncement(input: {
  courseOfferingId: number;
  title: string;
  body: string;
  status: PublicationStatus;
  publishAt?: Date;
  pinned: boolean;
  authorUserId: number;
}) {
  const db = await getDb();
  const now = new Date();
  let id: number;
  if (!db) {
    id = memoryDb.lmsAnnouncements.length + 1;
    memoryDb.lmsAnnouncements.push({
      id,
      courseOfferingId: input.courseOfferingId,
      title: input.title,
      body: input.body,
      status: input.status,
      publishAt: input.publishAt ?? null,
      pinned: input.pinned,
      authorUserId: input.authorUserId,
      createdAt: now,
      updatedAt: now,
    });
  } else {
    const result = await db.insert(lmsAnnouncements).values({
      ...input,
      publishAt: input.publishAt ?? null,
    });
    id = Number(result[0].insertId);
  }

  if (input.status === "published") {
    await notifyEnrolledStudents(input.courseOfferingId, {
      category: "announcement",
      title: `Announcement: ${input.title}`,
      body: input.body.slice(0, 180),
    });
  }
  return id;
}

export async function createDiscussionTopic(input: {
  courseOfferingId: number;
  moduleId?: number;
  title: string;
  body: string;
  pinned?: boolean;
  authorUserId: number;
}) {
  const db = await getDb();
  const now = new Date();
  if (!db) {
    const id = memoryDb.lmsDiscussionTopics.length + 1;
    memoryDb.lmsDiscussionTopics.push({
      id,
      courseOfferingId: input.courseOfferingId,
      moduleId: input.moduleId ?? null,
      title: input.title,
      body: input.body,
      pinned: Boolean(input.pinned),
      locked: false,
      moderationStatus: "active",
      flagReason: null,
      authorUserId: input.authorUserId,
      createdAt: now,
      updatedAt: now,
    });
    return id;
  }
  const result = await db.insert(lmsDiscussionTopics).values({
    courseOfferingId: input.courseOfferingId,
    moduleId: input.moduleId ?? null,
    title: input.title,
    body: input.body,
    pinned: Boolean(input.pinned),
    authorUserId: input.authorUserId,
  });
  return Number(result[0].insertId);
}

export async function createDiscussionReply(input: {
  topicId: number;
  courseOfferingId: number;
  body: string;
  authorUserId: number;
}) {
  const db = await getDb();
  const now = new Date();
  if (!db) {
    const topic = memoryDb.lmsDiscussionTopics.find(t => t.id === input.topicId);
    if (!topic || topic.courseOfferingId !== input.courseOfferingId) {
      throw new Error("Discussion topic was not found in this course.");
    }
    if (topic.locked) {
      throw new Error("This discussion topic is locked by the instructor.");
    }
    const id = memoryDb.lmsDiscussionReplies.length + 1;
    memoryDb.lmsDiscussionReplies.push({
      id,
      topicId: input.topicId,
      authorUserId: input.authorUserId,
      body: input.body,
      moderationStatus: "active",
      flagReason: null,
      createdAt: now,
      updatedAt: now,
    });
    if (topic.authorUserId !== input.authorUserId) {
      await createNotification({
        userId: topic.authorUserId,
        courseOfferingId: input.courseOfferingId,
        category: "discussion_reply",
        title: `New Reply: ${topic.title}`,
        body: input.body.slice(0, 160),
      });
    }
    return id;
  }
  const [topic] = await db
    .select()
    .from(lmsDiscussionTopics)
    .where(eq(lmsDiscussionTopics.id, input.topicId))
    .limit(1);
  if (!topic || topic.locked) {
    throw new Error("Discussion topic is unavailable or locked.");
  }
  const result = await db.insert(lmsDiscussionReplies).values({
    topicId: input.topicId,
    authorUserId: input.authorUserId,
    body: input.body,
  });
  return Number(result[0].insertId);
}

export async function moderateDiscussionItem(input: {
  courseOfferingId: number;
  targetType: "topic" | "reply";
  targetId: number;
  moderationStatus: "active" | "flagged" | "hidden";
  locked?: boolean;
  flagReason?: string;
}) {
  const db = await getDb();
  if (!db) {
    if (input.targetType === "topic") {
      const topic = memoryDb.lmsDiscussionTopics.find(
        t => t.id === input.targetId && t.courseOfferingId === input.courseOfferingId,
      );
      if (!topic) throw new Error("Discussion topic not found.");
      topic.moderationStatus = input.moderationStatus;
      if (input.locked !== undefined) topic.locked = input.locked;
      if (input.flagReason !== undefined) topic.flagReason = input.flagReason || null;
      topic.updatedAt = new Date();
      return;
    }
    const reply = memoryDb.lmsDiscussionReplies.find(r => r.id === input.targetId);
    if (!reply) throw new Error("Discussion reply not found.");
    reply.moderationStatus = input.moderationStatus;
    if (input.flagReason !== undefined) reply.flagReason = input.flagReason || null;
    reply.updatedAt = new Date();
    return;
  }
  if (input.targetType === "topic") {
    await db
      .update(lmsDiscussionTopics)
      .set({
        moderationStatus: input.moderationStatus,
        ...(input.locked !== undefined ? { locked: input.locked } : {}),
        ...(input.flagReason !== undefined ? { flagReason: input.flagReason || null } : {}),
      })
      .where(eq(lmsDiscussionTopics.id, input.targetId));
  } else {
    await db
      .update(lmsDiscussionReplies)
      .set({
        moderationStatus: input.moderationStatus,
        ...(input.flagReason !== undefined ? { flagReason: input.flagReason || null } : {}),
      })
      .where(eq(lmsDiscussionReplies.id, input.targetId));
  }
}

export async function sendCourseMessage(input: {
  courseOfferingId: number;
  senderUserId: number;
  recipientUserId: number;
  subject: string;
  body: string;
}) {
  const db = await getDb();
  const now = new Date();
  let id: number;
  if (!db) {
    id = memoryDb.lmsCourseMessages.length + 1;
    memoryDb.lmsCourseMessages.push({
      id,
      courseOfferingId: input.courseOfferingId,
      senderUserId: input.senderUserId,
      recipientUserId: input.recipientUserId,
      subject: input.subject,
      body: input.body,
      readAt: null,
      createdAt: now,
    });
  } else {
    const result = await db.insert(lmsCourseMessages).values(input);
    id = Number(result[0].insertId);
  }
  await createNotification({
    userId: input.recipientUserId,
    courseOfferingId: input.courseOfferingId,
    category: "message",
    title: `Course Message: ${input.subject}`,
    body: input.body.slice(0, 160),
  });
  return id;
}

export async function markNotificationRead(input: { notificationId: number; userId: number }) {
  const db = await getDb();
  if (!db) {
    const n = memoryDb.lmsNotifications.find(item => item.id === input.notificationId && item.userId === input.userId);
    if (n) n.readAt = new Date();
    return;
  }
  await db
    .update(lmsNotifications)
    .set({ readAt: new Date() })
    .where(and(eq(lmsNotifications.id, input.notificationId), eq(lmsNotifications.userId, input.userId)));
}

export async function updateNotificationPreferences(input: {
  userId: number;
  announcements: boolean;
  dueDates: boolean;
  submissions: boolean;
  grades: boolean;
  discussions: boolean;
  messages: boolean;
}) {
  const db = await getDb();
  if (!db) {
    const existing = memoryDb.lmsNotificationPreferences.find(p => p.userId === input.userId);
    if (existing) {
      Object.assign(existing, input, { updatedAt: new Date() });
    } else {
      memoryDb.lmsNotificationPreferences.push({
        id: memoryDb.lmsNotificationPreferences.length + 1,
        ...input,
        updatedAt: new Date(),
      });
    }
    return;
  }
  await db
    .insert(lmsNotificationPreferences)
    .values(input)
    .onDuplicateKeyUpdate({ set: { ...input, updatedAt: new Date() } });
}

export async function previewCourseCopy(input: { sourceOfferingId: number; targetOfferingId: number }) {
  if (input.sourceOfferingId === input.targetOfferingId) {
    throw new Error("Source and destination course offerings must be different.");
  }
  const sourceFull = await getCourseSpaceFull(input.sourceOfferingId, {
    userId: 0,
    role: "admin",
    enrollmentId: null,
  });
  return {
    sourceOffering: sourceFull.offering,
    modulesCount: sourceFull.modules.length,
    moduleItemsCount: sourceFull.modules.reduce((sum, m) => sum + m.items.length, 0),
    assignmentsCount: sourceFull.assignments.length,
    questionBankCount: sourceFull.questionBank.length,
    quizzesCount: sourceFull.quizzes.length,
    categoriesCount: sourceFull.categories.length,
    excludedPrivateDataNotice:
      "Enrolments, learner submissions, quiz attempts, grades, announcements, discussions, and private messages are strictly excluded from course copy.",
  };
}

export async function executeCourseCopy(input: {
  sourceOfferingId: number;
  targetOfferingId: number;
  actorUserId: number;
}) {
  const preview = await previewCourseCopy(input);
  const sourceFull = await getCourseSpaceFull(input.sourceOfferingId, {
    userId: input.actorUserId,
    role: "admin",
    enrollmentId: null,
  });

  await updateCourseSpaceSettings({
    courseOfferingId: input.targetOfferingId,
    overview: sourceFull.space.overview ?? "",
    learningOutcomes: sourceFull.space.learningOutcomes ?? "",
    instructorBio: sourceFull.space.instructorBio ?? undefined,
    officeHours: sourceFull.space.officeHours ?? undefined,
    gradingPolicy: sourceFull.space.gradingPolicy ?? undefined,
    latePenaltyPercentPerDay: sourceFull.space.latePenaltyPercentPerDay,
    allowDiscussions: sourceFull.space.allowDiscussions,
    allowPrivateMessages: sourceFull.space.allowPrivateMessages,
    retentionDays: sourceFull.space.retentionDays,
    updatedByUserId: input.actorUserId,
  });

  for (const mod of sourceFull.modules) {
    const newModId = await createLmsModule({
      courseOfferingId: input.targetOfferingId,
      title: mod.title,
      description: mod.description ?? undefined,
      weekNumber: mod.weekNumber ?? undefined,
      status: "draft",
      createdByUserId: input.actorUserId,
    });
    for (const item of mod.items) {
      await createLmsModuleItem({
        moduleId: newModId,
        courseOfferingId: input.targetOfferingId,
        itemType: item.itemType,
        title: item.title,
        summary: item.summary ?? undefined,
        bodyHtml: item.bodyHtml ?? undefined,
        externalUrl: item.externalUrl ?? undefined,
        fileKey: item.fileKey ?? undefined,
        fileName: item.fileName ?? undefined,
        fileMimeType: item.fileMimeType ?? undefined,
        fileSizeBytes: item.fileSizeBytes ?? undefined,
        captionsUrl: item.captionsUrl ?? undefined,
        transcriptText: item.transcriptText ?? undefined,
        estimatedMinutes: item.estimatedMinutes,
        status: "draft",
        createdByUserId: input.actorUserId,
      });
    }
  }

  const questionIdMap = new Map<number, number>();
  for (const q of sourceFull.questionBank) {
    const newQId = await createQuestionBankEntry({
      courseOfferingId: input.targetOfferingId,
      topic: q.topic,
      questionType: q.questionType,
      prompt: q.prompt,
      options: (q.optionsJson as string[]) ?? [],
      correctAnswer: q.correctAnswerJson as string | string[],
      explanation: q.explanation ?? undefined,
      defaultPoints: q.defaultPoints,
      createdByUserId: input.actorUserId,
    });
    questionIdMap.set(q.id, newQId);
  }

  for (const quiz of sourceFull.quizzes) {
    const mappedBankIds = quiz.questions
      .map(q => questionIdMap.get(q.id))
      .filter((id): id is number => id !== undefined);
    await createQuizWithQuestions({
      courseOfferingId: input.targetOfferingId,
      title: `${quiz.title} (Copied)`,
      instructions: quiz.instructions ?? undefined,
      status: "draft",
      timeLimitMinutes: quiz.timeLimitMinutes,
      maxAttempts: quiz.maxAttempts,
      passMarkPercent: quiz.passMarkPercent,
      randomizeQuestions: quiz.randomizeQuestions,
      randomizeOptions: quiz.randomizeOptions,
      reviewPolicy: quiz.reviewPolicy,
      questionBankIds: mappedBankIds,
      createdByUserId: input.actorUserId,
    });
  }

  return preview;
}

export async function getAdminLmsOperationalReport(courseOfferingId?: number) {
  const offerings = await misDb.getTeachingOfferings(0, "admin");
  const filteredOfferings = courseOfferingId
    ? offerings.filter(o => o.id === courseOfferingId)
    : offerings;

  const rows = await Promise.all(
    filteredOfferings.map(async off => {
      const full = await getCourseSpaceFull(off.id, { userId: 0, role: "admin", enrollmentId: null });
      const totalItems = full.modules.reduce((sum, m) => sum + m.items.length, 0);
      const enrolledCount = full.gradebook.length;
      const submissionsCount = full.assignments.reduce((sum, a) => sum + a.submissions.filter(s => !s.isDraft).length, 0);
      const quizAttemptsCount = full.quizzes.reduce((sum, q) => sum + q.attempts.length, 0);
      const avgCoursePercent =
        full.gradebook.filter(g => g.calculation.overallPercent !== null).length > 0
          ? Number(
              (
                full.gradebook.reduce((sum, g) => sum + (g.calculation.overallPercent ?? 0), 0) /
                full.gradebook.filter(g => g.calculation.overallPercent !== null).length
              ).toFixed(1),
            )
          : null;

      return {
        offeringId: off.id,
        courseCode: off.courseCode,
        courseTitle: off.courseTitle,
        section: off.section,
        termName: off.termName,
        modality: off.modality,
        enrolledStudents: enrolledCount,
        publishedModules: full.modules.filter(m => m.status === "published").length,
        learningItemsCount: totalItems,
        assignmentsCount: full.assignments.length,
        submissionsCount,
        quizzesCount: full.quizzes.length,
        quizAttemptsCount,
        discussionTopicsCount: full.discussions.length,
        averageCourseGradePercent: avgCoursePercent,
        retentionDays: full.space.retentionDays,
      };
    }),
  );

  return rows;
}

export async function exportAdminLmsReportCsv(courseOfferingId?: number) {
  const rows = await getAdminLmsOperationalReport(courseOfferingId);
  const headers = [
    "Offering ID",
    "Course Code",
    "Course Title",
    "Section",
    "Term",
    "Modality",
    "Enrolled Learners",
    "Published Modules",
    "Learning Items",
    "Assignments",
    "Assignment Submissions",
    "Quizzes",
    "Quiz Attempts",
    "Discussion Topics",
    "Average Course Grade (%)",
    "Retention Policy (Days)",
  ];
  const escapeCsv = (val: unknown) => {
    const str = val === null || val === undefined ? "" : String(val);
    return `"${str.replace(/"/g, '""')}"`;
  };
  const csvLines = [
    headers.map(escapeCsv).join(","),
    ...rows.map(r =>
      [
        r.offeringId,
        r.courseCode,
        r.courseTitle,
        r.section,
        r.termName,
        r.modality,
        r.enrolledStudents,
        r.publishedModules,
        r.learningItemsCount,
        r.assignmentsCount,
        r.submissionsCount,
        r.quizzesCount,
        r.quizAttemptsCount,
        r.discussionTopicsCount,
        r.averageCourseGradePercent ?? "N/A",
        r.retentionDays,
      ]
        .map(escapeCsv)
        .join(","),
    ),
  ];
  return csvLines.join("\n");
}

export async function reorderLmsModuleItem(input: {
  courseOfferingId: number;
  moduleId: number;
  itemId: number;
  direction: "up" | "down";
}) {
  const db = await getDb();
  if (!db) {
    const items = memoryDb.lmsModuleItems
      .filter(i => i.moduleId === input.moduleId && i.courseOfferingId === input.courseOfferingId)
      .sort((a, b) => a.position - b.position);
    const idx = items.findIndex(i => i.id === input.itemId);
    const swapIdx = input.direction === "up" ? idx - 1 : idx + 1;
    if (idx === -1 || swapIdx < 0 || swapIdx >= items.length) return;
    const temp = items[idx].position;
    items[idx].position = items[swapIdx].position;
    items[swapIdx].position = temp;
    return;
  }
  const items = await db
    .select()
    .from(lmsModuleItems)
    .where(and(eq(lmsModuleItems.moduleId, input.moduleId), eq(lmsModuleItems.courseOfferingId, input.courseOfferingId)))
    .orderBy(asc(lmsModuleItems.position));
  const idx = items.findIndex(i => i.id === input.itemId);
  const swapIdx = input.direction === "up" ? idx - 1 : idx + 1;
  if (idx === -1 || swapIdx < 0 || swapIdx >= items.length) return;
  await db.update(lmsModuleItems).set({ position: items[swapIdx].position }).where(eq(lmsModuleItems.id, items[idx].id));
  await db.update(lmsModuleItems).set({ position: items[idx].position }).where(eq(lmsModuleItems.id, items[swapIdx].id));
}

export async function updateLmsContentPublication(input: {
  courseOfferingId: number;
  targetType: "module" | "item";
  targetId: number;
  status: PublicationStatus;
  publishAt?: Date;
}) {
  const db = await getDb();
  if (!db) {
    if (input.targetType === "module") {
      const mod = memoryDb.lmsModules.find(
        m => m.id === input.targetId && m.courseOfferingId === input.courseOfferingId,
      );
      if (!mod) throw new Error("Module was not found.");
      mod.status = input.status;
      mod.publishAt = input.publishAt ?? null;
      mod.updatedAt = new Date();
      return;
    }
    const item = memoryDb.lmsModuleItems.find(
      i => i.id === input.targetId && i.courseOfferingId === input.courseOfferingId,
    );
    if (!item) throw new Error("Module item was not found.");
    item.status = input.status;
    item.publishAt = input.publishAt ?? null;
    item.updatedAt = new Date();
    return;
  }
  if (input.targetType === "module") {
    await db
      .update(lmsModules)
      .set({ status: input.status, publishAt: input.publishAt ?? null })
      .where(and(eq(lmsModules.id, input.targetId), eq(lmsModules.courseOfferingId, input.courseOfferingId)));
  } else {
    await db
      .update(lmsModuleItems)
      .set({ status: input.status, publishAt: input.publishAt ?? null })
      .where(and(eq(lmsModuleItems.id, input.targetId), eq(lmsModuleItems.courseOfferingId, input.courseOfferingId)));
  }
}

export async function seedLocalDemoCourse(actorUserId: number) {
  const { getOrCreateLocalUser } = await import("../db");
  const facultyUser = await getOrCreateLocalUser("faculty");
  const studentUser = await getOrCreateLocalUser("student");

  const cat = await misDb.getAcademicCatalogue();
  let deptId = cat.departments[0]?.id;
  if (!deptId) {
    deptId = await misDb.createDepartment({
      code: "COMP",
      name: "School of Computing & Information Systems",
    });
  }

  let progId = cat.programmes[0]?.id;
  if (!progId) {
    progId = await misDb.createProgramme({
      departmentId: deptId,
      code: "BSC-SE",
      name: "BSc (Hons) Software Engineering",
      awardType: "degree",
      durationTerms: 6,
    });
  }

  let termId = cat.terms[0]?.id;
  if (!termId) {
    termId = await misDb.createTerm({
      code: "2026-AUT",
      name: "Autumn Semester 2026",
      startsAt: new Date(Date.now() - 14 * 86_400_000),
      endsAt: new Date(Date.now() + 90 * 86_400_000),
      status: "active",
    });
  }

  let courseId = cat.courses.find(c => c.code === "CS204")?.id;
  if (!courseId) {
    courseId = await misDb.createCourse({
      departmentId: deptId,
      code: "CS204",
      title: "Distributed Systems & Cloud Architecture",
      description:
        "Covers consensus protocols, fault-tolerant service design, relational data modeling, and observability in modern cloud systems.",
      credits: 15,
      level: 5,
    });
  }

  let offeringId = cat.offerings.find(o => o.courseCode === "CS204" && o.section === "A")?.id;
  if (!offeringId) {
    offeringId = await misDb.createOffering({
      courseId,
      termId,
      section: "A",
      modality: "hybrid",
      meetingPattern: "Tue/Thu 10:00–11:30",
      room: "Turing Hall 2.04",
      capacity: 60,
      status: "open",
    });
  }

  let archiveOfferingId = cat.offerings.find(o => o.courseCode === "CS204" && o.section === "B")?.id;
  if (!archiveOfferingId) {
    archiveOfferingId = await misDb.createOffering({
      courseId,
      termId,
      section: "B",
      modality: "online",
      meetingPattern: "Wed 14:00–16:00",
      room: "Online Cohort",
      capacity: 60,
      status: "open",
    });
  }

  await misDb.assignFaculty({ courseOfferingId: offeringId, facultyUserId: facultyUser.id });
  await misDb.assignFaculty({ courseOfferingId: archiveOfferingId, facultyUserId: facultyUser.id });

  const existingStudentId = await misDb.getStudentIdForUser(studentUser.id);
  let studentId = existingStudentId;
  if (!studentId) {
    const db = await getDb();
    if (!db) {
      studentId = await misDb.createStudent({
        studentNumber: "STU-2026-0104",
        legalFirstName: "Amara",
        legalLastName: "Okafor",
        preferredName: "Amara",
        institutionalEmail: "amara.okafor@college.edu",
        programmeId: progId,
        admissionTermId: termId,
        status: "active",
      });
      const st = memoryDb.students.find(s => s.id === studentId);
      if (st) st.userId = studentUser.id;
    } else {
      studentId = await misDb.createStudent({
        studentNumber: "STU-2026-0104",
        legalFirstName: "Amara",
        legalLastName: "Okafor",
        preferredName: "Amara",
        institutionalEmail: "amara.okafor@college.edu",
        programmeId: progId,
        admissionTermId: termId,
        status: "active",
      });
      await db.update(students).set({ userId: studentUser.id }).where(eq(students.id, studentId));
    }
  }

  const existingEnrollments = await listAccessibleOfferingsForUser(studentUser.id, "student");
  if (!existingEnrollments.some(e => e.id === offeringId)) {
    await misDb.enrollStudent({ studentId, courseOfferingId: offeringId });
  }

  const full = await getCourseSpaceFull(offeringId, {
    userId: actorUserId,
    role: "admin",
    enrollmentId: null,
  });

  if (full.modules.length === 0) {
    const mod1 = await createLmsModule({
      courseOfferingId: offeringId,
      title: "Week 1: Foundations of Replicated State & Consensus",
      description: "Core invariants of distributed state machines, idempotency keys, and read/write quorum trade-offs.",
      weekNumber: 1,
      status: "published",
      createdByUserId: facultyUser.id,
    });

    await createLmsModuleItem({
      moduleId: mod1,
      courseOfferingId: offeringId,
      itemType: "page",
      title: "Lecture Notes: Linearizability vs. Serializability",
      summary: "Structured reading on real-time ordering guarantees and transaction isolation levels.",
      bodyHtml:
        "<h3>1. Linearizability (Single-Object Real-Time Order)</h3><p>Linearizability guarantees that every operation appears to take effect atomically at some point between its invocation and completion.</p><h3>2. Serializability (Multi-Object Transaction Isolation)</h3><p>Serializability guarantees that a schedule of concurrent transactions is equivalent to some serial execution order, without requiring real-time ordering.</p>",
      estimatedMinutes: 25,
      status: "published",
      createdByUserId: facultyUser.id,
    });

    await createLmsModuleItem({
      moduleId: mod1,
      courseOfferingId: offeringId,
      itemType: "video",
      title: "Recorded Seminar: Raft Leader Election Walkthrough",
      summary: "Step-by-step analysis of split votes, randomized election timeouts, and log replication safety.",
      externalUrl: "https://raft.github.io",
      captionsUrl: "/captions/cs204-week1-raft.vtt",
      transcriptText:
        "In Raft, time is divided into arbitrary-length terms numbered with consecutive integers. Each term begins with an election in which one or more candidates attempt to become leader...",
      estimatedMinutes: 35,
      status: "published",
      createdByUserId: facultyUser.id,
    });

    const courseworkCat = full.categories.find(c => c.name === "Coursework & Assignments")?.id;
    const quizCat = full.categories.find(c => c.name === "Quizzes & Online Tests")?.id;

    await createConfiguredAssignment({
      courseOfferingId: offeringId,
      moduleId: mod1,
      categoryId: courseworkCat,
      title: "Lab 1: Idempotent Payment Ledger & Write-Ahead Log Design",
      description:
        "Submit your technical architecture brief explaining how your ledger prevents duplicate settlement during network retries. Include recovery steps after an ungraceful node restart.",
      dueAt: new Date(Date.now() + 7 * 86_400_000),
      maxScore: 100,
      latePolicy: "accept_with_penalty",
      latePenaltyPercentPerDay: 10,
      maxAttempts: 3,
      allowResubmission: true,
      submissionMode: "individual",
      allowTextResponse: true,
      allowFileUpload: true,
      rubric: [
        { criterion: "Idempotency & Safety Guarantees", maxPoints: 40, description: "Clear invariant definition and deduplication key lifecycle." },
        { criterion: "Failure Recovery & WAL Durability", maxPoints: 35, description: "Handles crash recovery without state corruption." },
        { criterion: "Verification & Edge Cases", maxPoints: 25, description: "Addresses clock skew and concurrent duplicate requests." },
      ],
      status: "published",
      createdByUserId: facultyUser.id,
    });

    const q1 = await createQuestionBankEntry({
      courseOfferingId: offeringId,
      topic: "Consensus & Replication",
      questionType: "multiple_choice",
      prompt: "In a 5-node Raft cluster, what is the minimum quorum size required to commit a log entry?",
      options: ["2 nodes", "3 nodes", "4 nodes", "5 nodes"],
      correctAnswer: "3 nodes",
      explanation: "A majority quorum of N=5 is floor(5/2) + 1 = 3 nodes.",
      defaultPoints: 10,
      createdByUserId: facultyUser.id,
    });

    const q2 = await createQuestionBankEntry({
      courseOfferingId: offeringId,
      topic: "Consensus & Replication",
      questionType: "true_false",
      prompt: "Strict serializability combines serializability with linearizability's real-time ordering constraint.",
      options: ["True", "False"],
      correctAnswer: "True",
      explanation: "Strict serializability (external consistency) enforces both transaction isolation and real-time order.",
      defaultPoints: 10,
      createdByUserId: facultyUser.id,
    });

    const q3 = await createQuestionBankEntry({
      courseOfferingId: offeringId,
      topic: "Fault Tolerance",
      questionType: "multiple_select",
      prompt: "Which of the following mechanisms help prevent cascading retry storms in distributed services?",
      options: ["Exponential backoff with jitter", "Circuit breakers", "Unbounded synchronous retries", "Idempotency keys"],
      correctAnswer: ["Exponential backoff with jitter", "Circuit breakers"],
      explanation: "Backoff with jitter and circuit breakers shed load during downstream degradation.",
      defaultPoints: 10,
      createdByUserId: facultyUser.id,
    });

    await createQuizWithQuestions({
      courseOfferingId: offeringId,
      moduleId: mod1,
      categoryId: quizCat,
      title: "Week 1 Checkpoint Quiz: Replication & Quorum Invariants",
      instructions: "Complete all 3 questions within 25 minutes. Your answers are autosaved as you progress.",
      status: "published",
      dueAt: new Date(Date.now() + 10 * 86_400_000),
      timeLimitMinutes: 25,
      maxAttempts: 2,
      passMarkPercent: 60,
      randomizeQuestions: false,
      randomizeOptions: false,
      reviewPolicy: "immediate",
      questionBankIds: [q1, q2, q3],
      createdByUserId: facultyUser.id,
    });

    await createAnnouncement({
      courseOfferingId: offeringId,
      title: "Welcome to CS204 Distributed Systems — Autumn 2026",
      body: "Week 1 lecture notes, seminar recording, Lab 1 specification, and Checkpoint Quiz 1 are now published. Office hours are Tuesdays 14:00–16:00 in Turing Hall 2.04.",
      status: "published",
      pinned: true,
      authorUserId: facultyUser.id,
    });

    const topicId = await createDiscussionTopic({
      courseOfferingId: offeringId,
      moduleId: mod1,
      title: "Week 1 Seminar Thread: Quorum Read/Write Trade-offs (R + W > N)",
      body: "Share an example of a real-world workload where you would favour W=N, R=1 over W=majority, R=majority, and explain why.",
      pinned: true,
      authorUserId: facultyUser.id,
    });

    await createDiscussionReply({
      topicId,
      courseOfferingId: offeringId,
      body: "Configuration metadata services (like feature flags or routing tables) read thousands of times per second but updated rarely benefit from fast local reads with W=N, R=1.",
      authorUserId: studentUser.id,
    });
  }

  return { offeringId, archiveOfferingId, courseCode: "CS204" };
}

