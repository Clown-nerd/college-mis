import { and, count, desc, eq, or } from "drizzle-orm";
import {
  academicTerms,
  activitySubmissions,
  applicantPayments,
  applicants,
  attendanceRecords,
  auditEvents,
  classMeetings,
  coursePrerequisites,
  courseActivities,
  courses,
  courseOfferings,
  departments,
  documents,
  enrollments,
  facultyAssignments,
  gradeRecords,
  invoices,
  paymentTransactions,
  programmes,
  scholarships,
  staffProfiles,
  students,
  studentRequests,
  users,
} from "../../drizzle/schema";
import { calculateGpa, gradeFromScore } from "../../shared/academic";
import { preparedInvitationState, simulatedInvitationDeliveryState } from "../../shared/staffInvitation";
import { nanoid } from "nanoid";
import { canActivateApplicant } from "../../shared/lifecycle";
import { aggregateTermProgression } from "../../shared/progression";
import { remainingInvoiceBalance } from "../../shared/payments";
import { timeRangesOverlap } from "../../shared/schedule";
import { staffProvisioningState } from "../../shared/staff";
import type { UserRole } from "../../drizzle/schema";
import { getDb } from "../db";

type AuditInput = {
  actorUserId: number | null;
  action: string;
  entityType: string;
  entityId?: string;
  summary: string;
  metadata?: Record<string, unknown>;
};
type DatabaseConnection = NonNullable<Awaited<ReturnType<typeof getDb>>>;

export async function writeAuditEvent(input: AuditInput) {
  const db = await getDb();
  if (!db) return;

  await db.insert(auditEvents).values({
    actorUserId: input.actorUserId,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    summary: input.summary,
    metadata: input.metadata,
  });
}

export async function getDashboardMetrics() {
  const db = await getDb();
  if (!db) {
    return {
      isConfigured: false,
      activeStudents: 0,
      completedEnrollments: 0,
      attendanceExceptions: 0,
      pendingGrades: 0,
      atRiskStudents: 0,
      outstandingInvoices: 0,
      applicationsInReview: 0,
      recentActivity: [],
    };
  }

  const [
    activeStudents,
    completedEnrollments,
    attendanceExceptions,
    pendingGrades,
    outstandingInvoices,
    applicationsInReview,
    failingResults,
    absences,
    recentActivity,
  ] = await Promise.all([
    db.select({ value: count() }).from(students).where(eq(students.status, "active")),
    db.select({ value: count() }).from(enrollments).where(eq(enrollments.status, "completed")),
    db.select({ value: count() }).from(attendanceRecords).where(eq(attendanceRecords.status, "absent")),
    db.select({ value: count() }).from(gradeRecords).where(eq(gradeRecords.status, "draft")),
    db
      .select({ value: count() })
      .from(invoices)
      .where(or(eq(invoices.status, "issued"), eq(invoices.status, "part_paid"), eq(invoices.status, "overdue"))),
    db.select({ value: count() }).from(applicants).where(eq(applicants.status, "under_review")),
    db
      .select({ studentId: enrollments.studentId })
      .from(gradeRecords)
      .innerJoin(enrollments, eq(gradeRecords.enrollmentId, enrollments.id))
      .where(and(eq(gradeRecords.status, "published"), eq(gradeRecords.letterGrade, "F"))),
    db
      .select({ studentId: enrollments.studentId })
      .from(attendanceRecords)
      .innerJoin(enrollments, eq(attendanceRecords.enrollmentId, enrollments.id))
      .where(eq(attendanceRecords.status, "absent")),
    db
      .select({
        id: auditEvents.id,
        action: auditEvents.action,
        entityType: auditEvents.entityType,
        summary: auditEvents.summary,
        occurredAt: auditEvents.occurredAt,
      })
      .from(auditEvents)
      .orderBy(desc(auditEvents.occurredAt))
      .limit(5),
  ]);

  const atRiskIds = new Set(
    [...failingResults, ...absences]
      .map(item => item.studentId)
      .filter((studentId): studentId is number => studentId !== null),
  );

  return {
    isConfigured: true,
    activeStudents: activeStudents[0]?.value ?? 0,
    completedEnrollments: completedEnrollments[0]?.value ?? 0,
    attendanceExceptions: attendanceExceptions[0]?.value ?? 0,
    pendingGrades: pendingGrades[0]?.value ?? 0,
    atRiskStudents: atRiskIds.size,
    outstandingInvoices: outstandingInvoices[0]?.value ?? 0,
    applicationsInReview: applicationsInReview[0]?.value ?? 0,
    recentActivity,
  };
}

export async function listStudents() {
  const db = await getDb();
  if (!db) return [];

  return db
    .select({
      id: students.id,
      studentNumber: students.studentNumber,
      legalFirstName: students.legalFirstName,
      legalLastName: students.legalLastName,
      preferredName: students.preferredName,
      institutionalEmail: students.institutionalEmail,
      phone: students.phone,
      status: students.status,
      programmeName: programmes.name,
      programmeCode: programmes.code,
      departmentName: departments.name,
      updatedAt: students.updatedAt,
    })
    .from(students)
    .leftJoin(programmes, eq(students.programmeId, programmes.id))
    .leftJoin(departments, eq(programmes.departmentId, departments.id))
    .orderBy(desc(students.updatedAt))
    .limit(75);
}

export async function createStudent(input: {
  studentNumber: string;
  legalFirstName: string;
  legalLastName: string;
  preferredName?: string;
  institutionalEmail?: string;
  phone?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  programmeId?: number;
  admissionTermId?: number;
  status: "applicant" | "active" | "leave" | "graduated" | "withdrawn";
}) {
  const db = await getDb();
  if (!db) throw new Error("The institutional database is not available.");

  const result = await db.insert(students).values(input);
  return Number(result[0].insertId);
}

export async function listApplicants() {
  const db = await getDb();
  if (!db) return [];

  return db
    .select({
      id: applicants.id,
      applicantNumber: applicants.applicantNumber,
      firstName: applicants.firstName,
      lastName: applicants.lastName,
      email: applicants.email,
      phone: applicants.phone,
      status: applicants.status,
      applicationFeeStatus: applicants.applicationFeeStatus,
      detailsVerifiedAt: applicants.detailsVerifiedAt,
      userId: applicants.userId,
      programmeName: programmes.name,
      intakeTermName: academicTerms.name,
      updatedAt: applicants.updatedAt,
    })
    .from(applicants)
    .leftJoin(programmes, eq(applicants.programmeId, programmes.id))
    .leftJoin(academicTerms, eq(applicants.intakeTermId, academicTerms.id))
    .orderBy(desc(applicants.updatedAt));
}

export async function createApplicant(input: {
  userId?: number;
  applicantNumber: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  programmeId?: number;
  intakeTermId?: number;
  status: "inquiry" | "submitted" | "under_review";
}) {
  const db = await getDb();
  if (!db) throw new Error("The institutional database is not available.");
  const result = await db.insert(applicants).values(input);
  return Number(result[0].insertId);
}

export async function getApplicantForUser(userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(applicants).where(eq(applicants.userId, userId)).limit(1);
  return result[0];
}

export async function createSelfApplicant(input: { userId: number; applicantNumber: string; firstName: string; lastName: string; email: string; phone?: string; programmeId?: number; intakeTermId?: number }) {
  const db = await getDb();
  if (!db) throw new Error("The institutional database is not available.");
  const result = await db.insert(applicants).values({ ...input, status: "submitted", applicationFeeStatus: "pending" });
  return Number(result[0].insertId);
}

export async function simulateApplicantFeePayment(input: { applicantId: number; amountCents: number }) {
  const db = await getDb();
  if (!db) throw new Error("The institutional database is not available.");
  const gatewayReference = `APP-${crypto.randomUUID().replace(/-/g, "").slice(0, 16).toUpperCase()}`;
  const paymentId = await db.transaction(async tx => {
    const result = await tx.insert(applicantPayments).values({ applicantId: input.applicantId, amountCents: input.amountCents, gatewayReference, gatewayStatus: "settled" });
    await tx.update(applicants).set({ applicationFeeStatus: "settled" }).where(eq(applicants.id, input.applicantId));
    return Number(result[0].insertId);
  });
  return { paymentId, gatewayReference };
}

export async function activateApplicant(input: { applicantId: number; studentNumber: string; activatedByUserId: number }) {
  const db = await getDb();
  if (!db) throw new Error("The institutional database is not available.");
  return db.transaction(async tx => {
    const [applicant] = await tx.select().from(applicants).where(eq(applicants.id, input.applicantId)).limit(1);
    if (!applicant) throw new Error("Applicant record was not found.");
    if (!canActivateApplicant(applicant.status, applicant.applicationFeeStatus, Boolean(applicant.detailsVerifiedAt))) throw new Error("Application cannot be activated until its submitted details and fee condition are confirmed.");
    const result = await tx.insert(students).values({ userId: applicant.userId, studentNumber: input.studentNumber, legalFirstName: applicant.firstName, legalLastName: applicant.lastName, institutionalEmail: applicant.email, phone: applicant.phone, programmeId: applicant.programmeId, admissionTermId: applicant.intakeTermId, status: "active" });
    await tx.update(applicants).set({ status: "converted", decidedByUserId: input.activatedByUserId, decisionAt: new Date() }).where(eq(applicants.id, input.applicantId));
    if (applicant.userId) await tx.update(users).set({ role: "student" }).where(eq(users.id, applicant.userId));
    return Number(result[0].insertId);
  });
}

export async function verifyApplicantDetails(input: { applicantId: number; verifiedByUserId: number }) {
  const db = await getDb();
  if (!db) throw new Error("The institutional database is not available.");
  await db.update(applicants).set({ detailsVerifiedAt: new Date(), detailsVerifiedByUserId: input.verifiedByUserId, status: "under_review" }).where(eq(applicants.id, input.applicantId));
}

export async function decideApplicant(input: {
  applicantId: number;
  status: "admitted" | "declined";
  decidedByUserId: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("The institutional database is not available.");
  await db.update(applicants).set({ status: input.status, decidedByUserId: input.decidedByUserId, decisionAt: new Date() }).where(eq(applicants.id, input.applicantId));
}

export async function convertApplicant(input: { applicantId: number; studentNumber: string }) {
  const db = await getDb();
  if (!db) throw new Error("The institutional database is not available.");

  return db.transaction(async tx => {
    const [applicant] = await tx.select().from(applicants).where(eq(applicants.id, input.applicantId)).limit(1);
    if (!applicant) throw new Error("Applicant record was not found.");
    if (applicant.status !== "admitted") throw new Error("Only an admitted applicant can be converted into a student record.");
    const result = await tx.insert(students).values({ studentNumber: input.studentNumber, legalFirstName: applicant.firstName, legalLastName: applicant.lastName, institutionalEmail: applicant.email, phone: applicant.phone, programmeId: applicant.programmeId, admissionTermId: applicant.intakeTermId, status: "active" });
    await tx.update(applicants).set({ status: "converted" }).where(eq(applicants.id, input.applicantId));
    return Number(result[0].insertId);
  });
}

export async function listStaffProfiles() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(staffProfiles).orderBy(desc(staffProfiles.createdAt));
}

export async function createStaffProfile(input: { fullName: string; email: string; staffNumber: string; staffCategory: "teaching" | "technical" | "finance" | "registry" | "administration"; accessRole: "faculty" | "non_teaching" | "finance" | "registrar" | "admin"; provisionedByUserId: number }) {
  const db = await getDb();
  if (!db) throw new Error("The institutional database is not available.");
  const [matchingUser] = await db.select({ id: users.id }).from(users).where(eq(users.email, input.email)).limit(1);
  const result = await db.insert(staffProfiles).values({ ...input, invitationToken: nanoid(24), userId: matchingUser?.id, status: staffProvisioningState(Boolean(matchingUser)) });
  if (matchingUser) await db.update(users).set({ role: input.accessRole }).where(eq(users.id, matchingUser.id));
  return Number(result[0].insertId);
}

export async function prepareStaffInvitation(input: { staffProfileId: number; preparedByUserId: number }, databaseOverride?: DatabaseConnection) {
  const db = databaseOverride ?? await getDb();
  if (!db) throw new Error("The institutional database is not available.");
  const [profile] = await db.select().from(staffProfiles).where(eq(staffProfiles.id, input.staffProfileId)).limit(1);
  if (!profile) throw new Error("Staff profile was not found.");
  await db.update(staffProfiles).set({ invitationPreparedAt: new Date(), invitationPreparedByUserId: input.preparedByUserId, ...preparedInvitationState() }).where(eq(staffProfiles.id, input.staffProfileId));
  return profile;
}

export async function recordStaffInvitationDelivery(input: { staffProfileId: number; deliveryStatus: "sent" | "failed"; actorUserId: number; failureReason?: string }, databaseOverride?: DatabaseConnection) {
  const db = databaseOverride ?? await getDb();
  if (!db) throw new Error("The institutional database is not available.");
  const [profile] = await db.select().from(staffProfiles).where(eq(staffProfiles.id, input.staffProfileId)).limit(1);
  if (!profile) throw new Error("Staff profile was not found.");
  await db.update(staffProfiles).set({ ...simulatedInvitationDeliveryState(input.deliveryStatus), invitationFailureReason: input.deliveryStatus === "failed" ? input.failureReason || "Simulated email delivery failure" : null, invitationPreparedByUserId: input.actorUserId }).where(eq(staffProfiles.id, input.staffProfileId));
  return profile;
}

export async function getAcademicCatalogue() {
  const db = await getDb();
  if (!db) return { departments: [], programmes: [], terms: [], courses: [], offerings: [] };

  const [departmentRows, programmeRows, termRows, courseRows, offeringRows] = await Promise.all([
    db.select().from(departments).orderBy(departments.name),
    db
      .select({
        id: programmes.id,
        code: programmes.code,
        name: programmes.name,
        awardType: programmes.awardType,
        durationTerms: programmes.durationTerms,
        active: programmes.active,
        departmentName: departments.name,
      })
      .from(programmes)
      .innerJoin(departments, eq(programmes.departmentId, departments.id))
      .orderBy(programmes.name),
    db.select().from(academicTerms).orderBy(desc(academicTerms.startsAt)),
    db
      .select({
        id: courses.id,
        code: courses.code,
        title: courses.title,
        credits: courses.credits,
        level: courses.level,
        active: courses.active,
        departmentName: departments.name,
      })
      .from(courses)
      .innerJoin(departments, eq(courses.departmentId, departments.id))
      .orderBy(courses.code),
    db
      .select({
        id: courseOfferings.id,
        section: courseOfferings.section,
        capacity: courseOfferings.capacity,
        modality: courseOfferings.modality,
        meetingPattern: courseOfferings.meetingPattern,
        room: courseOfferings.room,
        status: courseOfferings.status,
        courseCode: courses.code,
        courseTitle: courses.title,
        termName: academicTerms.name,
      })
      .from(courseOfferings)
      .innerJoin(courses, eq(courseOfferings.courseId, courses.id))
      .innerJoin(academicTerms, eq(courseOfferings.termId, academicTerms.id))
      .orderBy(desc(academicTerms.startsAt), courses.code),
  ]);

  return {
    departments: departmentRows,
    programmes: programmeRows,
    terms: termRows,
    courses: courseRows,
    offerings: offeringRows,
  };
}

export async function createDepartment(input: { code: string; name: string }) {
  const db = await getDb();
  if (!db) throw new Error("The institutional database is not available.");
  const result = await db.insert(departments).values(input);
  return Number(result[0].insertId);
}

export async function createProgramme(input: {
  departmentId: number;
  code: string;
  name: string;
  awardType: "certificate" | "diploma" | "degree" | "postgraduate";
  durationTerms: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("The institutional database is not available.");
  const result = await db.insert(programmes).values(input);
  return Number(result[0].insertId);
}

export async function createTerm(input: {
  code: string;
  name: string;
  startsAt: Date;
  endsAt: Date;
  status: "planned" | "active" | "closed";
}) {
  const db = await getDb();
  if (!db) throw new Error("The institutional database is not available.");
  const result = await db.insert(academicTerms).values(input);
  return Number(result[0].insertId);
}

export async function createCourse(input: {
  departmentId: number;
  code: string;
  title: string;
  description?: string;
  credits: number;
  level: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("The institutional database is not available.");
  const result = await db.insert(courses).values(input);
  return Number(result[0].insertId);
}

export async function createOffering(input: {
  courseId: number;
  termId: number;
  section: string;
  modality: "in_person" | "online" | "hybrid";
  meetingPattern?: string;
  room?: string;
  capacity: number;
  status: "draft" | "open" | "closed" | "cancelled";
}) {
  const db = await getDb();
  if (!db) throw new Error("The institutional database is not available.");
  const result = await db.insert(courseOfferings).values(input);
  return Number(result[0].insertId);
}

export async function enrollStudent(input: { studentId: number; courseOfferingId: number }) {
  const db = await getDb();
  if (!db) throw new Error("The institutional database is not available.");
  const result = await db.insert(enrollments).values({ ...input, status: "registered" });
  return Number(result[0].insertId);
}

export async function canManageOffering(userId: number, role: UserRole, courseOfferingId: number) {
  if (role === "admin" || role === "registrar") return true;
  if (role !== "faculty") return false;

  const db = await getDb();
  if (!db) return false;
  const assignment = await db
    .select({ id: facultyAssignments.id })
    .from(facultyAssignments)
    .where(
      and(
        eq(facultyAssignments.facultyUserId, userId),
        eq(facultyAssignments.courseOfferingId, courseOfferingId),
      ),
    )
    .limit(1);

  return assignment.length > 0;
}

export async function getTeachingOfferings(userId: number, role: UserRole) {
  const db = await getDb();
  if (!db) return [];

  if (role === "faculty") {
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
      })
      .from(facultyAssignments)
      .innerJoin(courseOfferings, eq(facultyAssignments.courseOfferingId, courseOfferings.id))
      .innerJoin(courses, eq(courseOfferings.courseId, courses.id))
      .innerJoin(academicTerms, eq(courseOfferings.termId, academicTerms.id))
      .where(eq(facultyAssignments.facultyUserId, userId))
      .orderBy(desc(academicTerms.startsAt), courses.code);
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
    })
    .from(courseOfferings)
    .innerJoin(courses, eq(courseOfferings.courseId, courses.id))
    .innerJoin(academicTerms, eq(courseOfferings.termId, academicTerms.id))
    .orderBy(desc(academicTerms.startsAt), courses.code);
}

export async function getTimetable() {
  const db = await getDb();
  if (!db) return [];

  return db
    .select({
      id: classMeetings.id,
      weekday: classMeetings.weekday,
      startsAt: classMeetings.startsAt,
      endsAt: classMeetings.endsAt,
      room: classMeetings.room,
      courseOfferingId: courseOfferings.id,
      section: courseOfferings.section,
      courseCode: courses.code,
      courseTitle: courses.title,
      termName: academicTerms.name,
    })
    .from(classMeetings)
    .innerJoin(courseOfferings, eq(classMeetings.courseOfferingId, courseOfferings.id))
    .innerJoin(courses, eq(courseOfferings.courseId, courses.id))
    .innerJoin(academicTerms, eq(courseOfferings.termId, academicTerms.id))
    .orderBy(academicTerms.name, classMeetings.weekday, classMeetings.startsAt);
}

export async function getStudentSchedule(studentId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      meetingId: classMeetings.id,
      weekday: classMeetings.weekday,
      startsAt: classMeetings.startsAt,
      endsAt: classMeetings.endsAt,
      room: classMeetings.room,
      courseOfferingId: courseOfferings.id,
      section: courseOfferings.section,
      courseCode: courses.code,
      courseTitle: courses.title,
      termName: academicTerms.name,
      termStartsAt: academicTerms.startsAt,
      termEndsAt: academicTerms.endsAt,
    })
    .from(enrollments)
    .innerJoin(courseOfferings, eq(enrollments.courseOfferingId, courseOfferings.id))
    .innerJoin(courses, eq(courseOfferings.courseId, courses.id))
    .innerJoin(academicTerms, eq(courseOfferings.termId, academicTerms.id))
    .innerJoin(classMeetings, eq(classMeetings.courseOfferingId, courseOfferings.id))
    .where(and(eq(enrollments.studentId, studentId), eq(enrollments.status, "registered")))
    .orderBy(academicTerms.startsAt, classMeetings.weekday, classMeetings.startsAt);
}

export async function findTimetableClashes(studentId: number, courseOfferingId: number) {
  const db = await getDb();
  if (!db) return [];
  const target = await db
    .select({ termId: courseOfferings.termId, weekday: classMeetings.weekday, startsAt: classMeetings.startsAt, endsAt: classMeetings.endsAt })
    .from(courseOfferings)
    .innerJoin(classMeetings, eq(classMeetings.courseOfferingId, courseOfferings.id))
    .where(eq(courseOfferings.id, courseOfferingId));
  if (!target.length) return [];
  const enrolledMeetings = await db
    .select({ courseCode: courses.code, courseTitle: courses.title, section: courseOfferings.section, weekday: classMeetings.weekday, startsAt: classMeetings.startsAt, endsAt: classMeetings.endsAt, termId: courseOfferings.termId })
    .from(enrollments)
    .innerJoin(courseOfferings, eq(enrollments.courseOfferingId, courseOfferings.id))
    .innerJoin(courses, eq(courseOfferings.courseId, courses.id))
    .innerJoin(classMeetings, eq(classMeetings.courseOfferingId, courseOfferings.id))
    .where(and(eq(enrollments.studentId, studentId), eq(enrollments.status, "registered")));
  return enrolledMeetings.filter(existing => target.some(candidate => candidate.termId === existing.termId && candidate.weekday === existing.weekday && timeRangesOverlap(candidate.startsAt, candidate.endsAt, existing.startsAt, existing.endsAt)));
}

export async function createClassMeeting(input: {
  courseOfferingId: number;
  weekday: "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday";
  startsAt: string;
  endsAt: string;
  room?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("The institutional database is not available.");
  const result = await db.insert(classMeetings).values(input);
  return Number(result[0].insertId);
}

export async function getOfferingRoster(courseOfferingId: number) {
  const db = await getDb();
  if (!db) return [];

  return db
    .select({
      enrollmentId: enrollments.id,
      enrollmentStatus: enrollments.status,
      studentId: students.id,
      studentNumber: students.studentNumber,
      legalFirstName: students.legalFirstName,
      legalLastName: students.legalLastName,
      gradeId: gradeRecords.id,
      score: gradeRecords.score,
      letterGrade: gradeRecords.letterGrade,
      gradeStatus: gradeRecords.status,
    })
    .from(enrollments)
    .innerJoin(students, eq(enrollments.studentId, students.id))
    .leftJoin(gradeRecords, eq(gradeRecords.enrollmentId, enrollments.id))
    .where(eq(enrollments.courseOfferingId, courseOfferingId))
    .orderBy(students.legalLastName, students.legalFirstName);
}

export async function upsertAttendance(input: {
  enrollmentId: number;
  classDate: string;
  status: "present" | "late" | "absent" | "excused";
  capturedByUserId: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("The institutional database is not available.");
  await db.insert(attendanceRecords).values(input).onDuplicateKeyUpdate({
    set: {
      status: input.status,
      capturedByUserId: input.capturedByUserId,
      capturedAt: new Date(),
    },
  });
}

export async function upsertGrade(input: {
  enrollmentId: number;
  score: number;
  status: "draft" | "published";
  enteredByUserId: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("The institutional database is not available.");
  const grade = gradeFromScore(input.score);
  const publishedAt = input.status === "published" ? new Date() : null;

  await db.insert(gradeRecords).values({
    enrollmentId: input.enrollmentId,
    score: input.score,
    letterGrade: grade.letterGrade,
    gradePointsTimes100: grade.gradePointsTimes100,
    status: input.status,
    enteredByUserId: input.enteredByUserId,
    publishedAt,
  }).onDuplicateKeyUpdate({
    set: {
      score: input.score,
      letterGrade: grade.letterGrade,
      gradePointsTimes100: grade.gradePointsTimes100,
      status: input.status,
      enteredByUserId: input.enteredByUserId,
      enteredAt: new Date(),
      publishedAt,
    },
  });

  return grade;
}

export async function getStudentIdForUser(userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select({ id: students.id }).from(students).where(eq(students.userId, userId)).limit(1);
  return result[0]?.id;
}

export async function getAcademicRecord(studentId: number, includeDrafts: boolean) {
  const db = await getDb();
  if (!db) return { student: undefined, results: [], gpa: null };

  const [student] = await db
    .select({
      id: students.id,
      studentNumber: students.studentNumber,
      legalFirstName: students.legalFirstName,
      legalLastName: students.legalLastName,
      preferredName: students.preferredName,
      status: students.status,
      programmeName: programmes.name,
      departmentName: departments.name,
    })
    .from(students)
    .leftJoin(programmes, eq(students.programmeId, programmes.id))
    .leftJoin(departments, eq(programmes.departmentId, departments.id))
    .where(eq(students.id, studentId))
    .limit(1);

  const results = await db
    .select({
      enrollmentId: enrollments.id,
      enrollmentStatus: enrollments.status,
      courseCode: courses.code,
      courseTitle: courses.title,
      credits: courses.credits,
      termName: academicTerms.name,
      score: gradeRecords.score,
      letterGrade: gradeRecords.letterGrade,
      gradePointsTimes100: gradeRecords.gradePointsTimes100,
      gradeStatus: gradeRecords.status,
      publishedAt: gradeRecords.publishedAt,
    })
    .from(enrollments)
    .innerJoin(courseOfferings, eq(enrollments.courseOfferingId, courseOfferings.id))
    .innerJoin(courses, eq(courseOfferings.courseId, courses.id))
    .innerJoin(academicTerms, eq(courseOfferings.termId, academicTerms.id))
    .leftJoin(gradeRecords, eq(gradeRecords.enrollmentId, enrollments.id))
    .where(eq(enrollments.studentId, studentId))
    .orderBy(desc(academicTerms.startsAt), courses.code);

  const visibleResults = includeDrafts
    ? results
    : results.filter(result => result.gradeStatus === "published");
  const gpaCourses = visibleResults
    .filter(
      (result): result is typeof result & { gradePointsTimes100: number } =>
        result.gradePointsTimes100 !== null && result.enrollmentStatus === "completed",
    )
    .map(result => ({ credits: result.credits, gradePointsTimes100: result.gradePointsTimes100 }));

  return { student, results: visibleResults, gpa: calculateGpa(gpaCourses) };
}

export async function getStudentProgression(studentId: number) {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select({
      termId: academicTerms.id,
      termName: academicTerms.name,
      termCode: academicTerms.code,
      startsAt: academicTerms.startsAt,
      courseCode: courses.code,
      courseTitle: courses.title,
      credits: courses.credits,
      letterGrade: gradeRecords.letterGrade,
      gradePointsTimes100: gradeRecords.gradePointsTimes100,
    })
    .from(enrollments)
    .innerJoin(courseOfferings, eq(enrollments.courseOfferingId, courseOfferings.id))
    .innerJoin(academicTerms, eq(courseOfferings.termId, academicTerms.id))
    .innerJoin(courses, eq(courseOfferings.courseId, courses.id))
    .innerJoin(gradeRecords, eq(gradeRecords.enrollmentId, enrollments.id))
    .where(and(eq(enrollments.studentId, studentId), eq(gradeRecords.status, "published")))
    .orderBy(desc(academicTerms.startsAt), courses.code);
  return aggregateTermProgression(rows);
}

export async function getStudentInvoices(studentId: number) {
  const db = await getDb();
  if (!db) return [];

  return db
    .select({
      id: invoices.id,
      invoiceNumber: invoices.invoiceNumber,
      amountCents: invoices.amountCents,
      balanceCents: invoices.balanceCents,
      dueAt: invoices.dueAt,
      status: invoices.status,
      termName: academicTerms.name,
    })
    .from(invoices)
    .leftJoin(academicTerms, eq(invoices.termId, academicTerms.id))
    .where(eq(invoices.studentId, studentId))
    .orderBy(desc(invoices.createdAt));
}

export async function listInvoices() {
  const db = await getDb();
  if (!db) return [];

  return db
    .select({
      id: invoices.id,
      invoiceNumber: invoices.invoiceNumber,
      amountCents: invoices.amountCents,
      balanceCents: invoices.balanceCents,
      dueAt: invoices.dueAt,
      status: invoices.status,
      studentId: students.id,
      studentNumber: students.studentNumber,
      legalFirstName: students.legalFirstName,
      legalLastName: students.legalLastName,
      termName: academicTerms.name,
    })
    .from(invoices)
    .innerJoin(students, eq(invoices.studentId, students.id))
    .leftJoin(academicTerms, eq(invoices.termId, academicTerms.id))
    .orderBy(desc(invoices.createdAt))
    .limit(100);
}

export async function createInvoice(input: {
  studentId: number;
  termId?: number;
  invoiceNumber: string;
  amountCents: number;
  dueAt?: Date;
  createdByUserId: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("The institutional database is not available.");
  const result = await db.insert(invoices).values({
    ...input,
    balanceCents: input.amountCents,
    status: "issued",
  });
  return Number(result[0].insertId);
}

export async function listScholarships() {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      id: scholarships.id,
      name: scholarships.name,
      amountCents: scholarships.amountCents,
      status: scholarships.status,
      studentNumber: students.studentNumber,
      legalFirstName: students.legalFirstName,
      legalLastName: students.legalLastName,
      termName: academicTerms.name,
    })
    .from(scholarships)
    .innerJoin(students, eq(scholarships.studentId, students.id))
    .leftJoin(academicTerms, eq(scholarships.termId, academicTerms.id))
    .orderBy(desc(scholarships.createdAt));
}

export async function createScholarship(input: {
  studentId: number;
  termId?: number;
  name: string;
  amountCents: number;
  approvedByUserId: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("The institutional database is not available.");
  const result = await db.insert(scholarships).values({ ...input, status: "approved" });
  return Number(result[0].insertId);
}

export async function waiveInvoice(invoiceId: number) {
  const db = await getDb();
  if (!db) throw new Error("The institutional database is not available.");
  await db.update(invoices).set({ status: "waived", balanceCents: 0 }).where(eq(invoices.id, invoiceId));
}

export async function getInvoiceForPayment(invoiceId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select({ id: invoices.id, studentId: invoices.studentId, invoiceNumber: invoices.invoiceNumber, balanceCents: invoices.balanceCents, status: invoices.status })
    .from(invoices)
    .where(eq(invoices.id, invoiceId))
    .limit(1);
  return result[0];
}

export async function simulateInvoicePayment(input: { invoiceId: number; studentId: number; amountCents: number }) {
  const db = await getDb();
  if (!db) throw new Error("The institutional database is not available.");
  const invoice = await getInvoiceForPayment(input.invoiceId);
  if (!invoice || invoice.studentId !== input.studentId) throw new Error("Invoice was not found for this student record.");
  if (!["issued", "part_paid", "overdue"].includes(invoice.status) || invoice.balanceCents <= 0) throw new Error("This invoice is not eligible for a payment simulation.");
  const remainingBalance = remainingInvoiceBalance(invoice.balanceCents, input.amountCents);
  const gatewayReference = `SIM-${crypto.randomUUID().replace(/-/g, "").slice(0, 16).toUpperCase()}`;
  const paymentId = await db.transaction(async tx => {
    const result = await tx.insert(paymentTransactions).values({
      invoiceId: invoice.id,
      studentId: input.studentId,
      amountCents: input.amountCents,
      currency: "USD",
      gateway: "simulated",
      gatewayReference,
      gatewayStatus: "settled",
      reconciliationStatus: "pending",
      paidAt: new Date(),
    });
    await tx.update(invoices).set({ balanceCents: remainingBalance, status: remainingBalance === 0 ? "paid" : "part_paid" }).where(eq(invoices.id, invoice.id));
    return Number(result[0].insertId);
  });
  return { paymentId, gatewayReference };
}

export async function listPayments(studentId?: number) {
  const db = await getDb();
  if (!db) return [];
  const query = db
    .select({
      id: paymentTransactions.id,
      invoiceId: invoices.id,
      invoiceNumber: invoices.invoiceNumber,
      amountCents: paymentTransactions.amountCents,
      currency: paymentTransactions.currency,
      gateway: paymentTransactions.gateway,
      gatewayReference: paymentTransactions.gatewayReference,
      gatewayStatus: paymentTransactions.gatewayStatus,
      reconciliationStatus: paymentTransactions.reconciliationStatus,
      paidAt: paymentTransactions.paidAt,
      reconciledAt: paymentTransactions.reconciledAt,
      studentId: students.id,
      studentNumber: students.studentNumber,
      legalFirstName: students.legalFirstName,
      legalLastName: students.legalLastName,
    })
    .from(paymentTransactions)
    .innerJoin(invoices, eq(paymentTransactions.invoiceId, invoices.id))
    .innerJoin(students, eq(paymentTransactions.studentId, students.id));
  return studentId
    ? query.where(eq(paymentTransactions.studentId, studentId)).orderBy(desc(paymentTransactions.createdAt))
    : query.orderBy(desc(paymentTransactions.createdAt));
}

export async function reconcilePayment(input: { paymentId: number; status: "reconciled" | "exception"; userId: number }) {
  const db = await getDb();
  if (!db) throw new Error("The institutional database is not available.");
  await db.update(paymentTransactions).set({ reconciliationStatus: input.status, reconciledAt: new Date(), reconciledByUserId: input.userId }).where(eq(paymentTransactions.id, input.paymentId));
}

export async function getPaymentReportingMetrics() {
  const db = await getDb();
  if (!db) return { pendingCount: 0, reconciledCount: 0, exceptionCount: 0, settledCents: 0 };
  const payments = await db.select({ amountCents: paymentTransactions.amountCents, status: paymentTransactions.reconciliationStatus }).from(paymentTransactions);
  return payments.reduce((metrics, payment) => ({
    pendingCount: metrics.pendingCount + (payment.status === "pending" ? 1 : 0),
    reconciledCount: metrics.reconciledCount + (payment.status === "reconciled" ? 1 : 0),
    exceptionCount: metrics.exceptionCount + (payment.status === "exception" ? 1 : 0),
    settledCents: metrics.settledCents + payment.amountCents,
  }), { pendingCount: 0, reconciledCount: 0, exceptionCount: 0, settledCents: 0 });
}

export async function listStudentRequestsForUser(userId: number, role: UserRole) {
  const db = await getDb();
  if (!db) return [];

  const baseQuery = db
    .select({
      id: studentRequests.id,
      type: studentRequests.type,
      title: studentRequests.title,
      detail: studentRequests.detail,
      status: studentRequests.status,
      createdAt: studentRequests.createdAt,
      updatedAt: studentRequests.updatedAt,
      studentId: students.id,
      studentNumber: students.studentNumber,
      legalFirstName: students.legalFirstName,
      legalLastName: students.legalLastName,
    })
    .from(studentRequests)
    .innerJoin(students, eq(studentRequests.studentId, students.id));

  if (role === "student" || role === "user") {
    const studentId = await getStudentIdForUser(userId);
    if (!studentId) return [];
    return baseQuery.where(eq(studentRequests.studentId, studentId)).orderBy(desc(studentRequests.updatedAt));
  }

  return baseQuery.orderBy(desc(studentRequests.updatedAt));
}

export async function createStudentRequest(input: {
  studentId: number;
  type: "document" | "registration" | "finance" | "personal_details" | "other";
  title: string;
  detail?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("The institutional database is not available.");
  const result = await db.insert(studentRequests).values(input);
  return Number(result[0].insertId);
}

export async function updateStudentRequestStatus(input: {
  requestId: number;
  status: "submitted" | "in_review" | "approved" | "rejected" | "completed";
  assigneeUserId: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("The institutional database is not available.");
  await db
    .update(studentRequests)
    .set({ status: input.status, assigneeUserId: input.assigneeUserId })
    .where(eq(studentRequests.id, input.requestId));
}

export async function getStudentRequest(requestId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select({ id: studentRequests.id, studentId: studentRequests.studentId })
    .from(studentRequests)
    .where(eq(studentRequests.id, requestId))
    .limit(1);
  return result[0];
}

export async function createDocumentMetadata(input: {
  studentId: number;
  requestId: number;
  name: string;
  fileKey: string;
  mimeType: string;
  retentionCategory: string;
  uploadedByUserId: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("The institutional database is not available.");
  const result = await db.insert(documents).values(input);
  return Number(result[0].insertId);
}

export async function listDocumentsForRequest(requestId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      id: documents.id,
      name: documents.name,
      fileKey: documents.fileKey,
      mimeType: documents.mimeType,
      retentionCategory: documents.retentionCategory,
      createdAt: documents.createdAt,
    })
    .from(documents)
    .where(eq(documents.requestId, requestId))
    .orderBy(desc(documents.createdAt));
}

export async function listAuditEvents() {
  const db = await getDb();
  if (!db) return [];

  return db
    .select({
      id: auditEvents.id,
      action: auditEvents.action,
      entityType: auditEvents.entityType,
      entityId: auditEvents.entityId,
      summary: auditEvents.summary,
      occurredAt: auditEvents.occurredAt,
    })
    .from(auditEvents)
    .orderBy(desc(auditEvents.occurredAt))
    .limit(100);
}

export async function listInstitutionalUsers() {
  const db = await getDb();
  if (!db) return [];

  return db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      lastSignedIn: users.lastSignedIn,
    })
    .from(users)
    .orderBy(users.name);
}

export async function updateInstitutionalUserRole(userId: number, role: UserRole) {
  const db = await getDb();
  if (!db) throw new Error("The institutional database is not available.");
  await db.update(users).set({ role }).where(eq(users.id, userId));
}

export async function createCoursePrerequisite(input: {
  courseId: number;
  prerequisiteCourseId: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("The institutional database is not available.");
  const result = await db.insert(coursePrerequisites).values(input);
  return Number(result[0].insertId);
}

export async function listFacultyUsers() {
  const db = await getDb();
  if (!db) return [];

  return db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .where(eq(users.role, "faculty"))
    .orderBy(users.name);
}

export async function assignFaculty(input: { courseOfferingId: number; facultyUserId: number }) {
  const db = await getDb();
  if (!db) throw new Error("The institutional database is not available.");
  const result = await db.insert(facultyAssignments).values(input).onDuplicateKeyUpdate({
    set: { assignmentRole: "instructor" },
  });
  return Number(result[0].insertId);
}

export async function createCourseActivity(input: { courseOfferingId: number; type: "assessment" | "assignment" | "note"; title: string; description?: string; dueAt?: Date; maxScore?: number; createdByUserId: number }) {
  const db = await getDb();
  if (!db) throw new Error("The institutional database is not available.");
  const result = await db.insert(courseActivities).values(input);
  return Number(result[0].insertId);
}

export async function getOfferingLearningProgress(courseOfferingId: number) {
  const db = await getDb();
  if (!db) return { activities: [], students: [] };
  const [activities, studentsInCourse] = await Promise.all([
    db.select({ id: courseActivities.id, type: courseActivities.type, title: courseActivities.title, description: courseActivities.description, dueAt: courseActivities.dueAt, maxScore: courseActivities.maxScore, createdAt: courseActivities.createdAt })
      .from(courseActivities).where(and(eq(courseActivities.courseOfferingId, courseOfferingId), eq(courseActivities.published, true))).orderBy(courseActivities.dueAt, courseActivities.createdAt),
    getOfferingRoster(courseOfferingId),
  ]);
  const submissions = activities.length ? await db.select({ activityId: activitySubmissions.activityId, enrollmentId: activitySubmissions.enrollmentId, score: activitySubmissions.score, status: activitySubmissions.status, submittedAt: activitySubmissions.submittedAt })
    .from(activitySubmissions).innerJoin(courseActivities, eq(activitySubmissions.activityId, courseActivities.id)).where(eq(courseActivities.courseOfferingId, courseOfferingId)) : [];
  const attendance = await db.select({ enrollmentId: attendanceRecords.enrollmentId, status: attendanceRecords.status })
    .from(attendanceRecords).innerJoin(enrollments, eq(attendanceRecords.enrollmentId, enrollments.id)).where(eq(enrollments.courseOfferingId, courseOfferingId));
  return {
    activities,
    students: studentsInCourse.map(student => {
      const attended = attendance.filter(row => row.enrollmentId === student.enrollmentId && row.status !== "excused");
      const present = attended.filter(row => row.status === "present" || row.status === "late").length;
      return { ...student, attendanceCount: attended.length, attendanceRate: attended.length ? Math.round((present / attended.length) * 100) : null,
        submissions: submissions.filter(row => row.enrollmentId === student.enrollmentId) };
    }),
  };
}

export async function getStudentLearningProgress(studentId: number) {
  const db = await getDb();
  if (!db) return [];
  const enrolled = await db.select({ enrollmentId: enrollments.id, offeringId: courseOfferings.id, section: courseOfferings.section, courseCode: courses.code, courseTitle: courses.title, termName: academicTerms.name })
    .from(enrollments).innerJoin(courseOfferings, eq(enrollments.courseOfferingId, courseOfferings.id)).innerJoin(courses, eq(courseOfferings.courseId, courses.id)).innerJoin(academicTerms, eq(courseOfferings.termId, academicTerms.id))
    .where(and(eq(enrollments.studentId, studentId), eq(enrollments.status, "registered")));
  return Promise.all(enrolled.map(async course => {
    const activities = await db.select({ id: courseActivities.id, type: courseActivities.type, title: courseActivities.title, description: courseActivities.description, dueAt: courseActivities.dueAt, maxScore: courseActivities.maxScore, submissionId: activitySubmissions.id, response: activitySubmissions.response, score: activitySubmissions.score, feedback: activitySubmissions.feedback, submissionStatus: activitySubmissions.status, submittedAt: activitySubmissions.submittedAt })
      .from(courseActivities).leftJoin(activitySubmissions, and(eq(activitySubmissions.activityId, courseActivities.id), eq(activitySubmissions.enrollmentId, course.enrollmentId)))
      .where(and(eq(courseActivities.courseOfferingId, course.offeringId), eq(courseActivities.published, true))).orderBy(courseActivities.dueAt, courseActivities.createdAt);
    const attendance = await db.select({ status: attendanceRecords.status, classDate: attendanceRecords.classDate }).from(attendanceRecords).where(eq(attendanceRecords.enrollmentId, course.enrollmentId)).orderBy(desc(attendanceRecords.classDate));
    const countedAttendance = attendance.filter(row => row.status !== "excused");
    return { ...course, activities, attendance, attendanceRate: countedAttendance.length ? Math.round((countedAttendance.filter(row => row.status === "present" || row.status === "late").length / countedAttendance.length) * 100) : null };
  }));
}

export async function submitCourseActivity(input: { activityId: number; enrollmentId: number; response: string; }) {
  const db = await getDb();
  if (!db) throw new Error("The institutional database is not available.");
  await db.insert(activitySubmissions).values({ ...input, status: "submitted", submittedAt: new Date() }).onDuplicateKeyUpdate({ set: { response: input.response, status: "submitted", submittedAt: new Date(), score: null, feedback: null, gradedAt: null, gradedByUserId: null } });
}

export async function getActivityEnrollment(activityId: number, studentId: number) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select({ enrollmentId: enrollments.id }).from(enrollments)
    .innerJoin(courseActivities, eq(courseActivities.courseOfferingId, enrollments.courseOfferingId))
    .where(and(eq(courseActivities.id, activityId), eq(enrollments.studentId, studentId), eq(enrollments.status, "registered"), eq(courseActivities.published, true))).limit(1);
  return rows[0]?.enrollmentId ?? null;
}

export async function getActivityMaxScore(activityId: number, courseOfferingId: number) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select({ maxScore: courseActivities.maxScore }).from(courseActivities)
    .where(and(eq(courseActivities.id, activityId), eq(courseActivities.courseOfferingId, courseOfferingId), eq(courseActivities.published, true))).limit(1);
  return rows[0]?.maxScore ?? null;
}

export async function isEnrollmentInActivity(activityId: number, enrollmentId: number) {
  const db = await getDb();
  if (!db) return false;
  const rows = await db.select({ id: enrollments.id }).from(enrollments)
    .innerJoin(courseActivities, eq(courseActivities.courseOfferingId, enrollments.courseOfferingId))
    .where(and(eq(courseActivities.id, activityId), eq(enrollments.id, enrollmentId))).limit(1);
  return rows.length > 0;
}

export async function gradeCourseActivity(input: { activityId: number; enrollmentId: number; score: number; feedback?: string; gradedByUserId: number; }) {
  const db = await getDb();
  if (!db) throw new Error("The institutional database is not available.");
  await db.insert(activitySubmissions).values({ ...input, status: "graded", gradedAt: new Date() }).onDuplicateKeyUpdate({ set: { score: input.score, feedback: input.feedback, status: "graded", gradedAt: new Date(), gradedByUserId: input.gradedByUserId } });
}
