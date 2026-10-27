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
import { getDb, memoryDb } from "../db";

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
  if (!db) {
    memoryDb.auditEvents.unshift({
      id: memoryDb.auditEvents.length + 1,
      actorUserId: input.actorUserId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      summary: input.summary,
      metadata: input.metadata ?? null,
      occurredAt: new Date(),
    });
    return;
  }

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
    const activeStudents = memoryDb.students.filter(s => s.status === "active").length;
    const completedEnrollments = memoryDb.enrollments.filter(e => e.status === "completed").length;
    const attendanceExceptions = memoryDb.attendanceRecords.filter(a => a.status === "absent").length;
    const pendingGrades = memoryDb.gradeRecords.filter(g => g.status === "draft").length;
    const outstandingInvoices = memoryDb.invoices.filter(i => ["issued", "part_paid", "overdue"].includes(i.status)).length;
    const applicationsInReview = memoryDb.applicants.filter(a => a.status === "under_review").length;
    const failingStudentIds = memoryDb.gradeRecords
      .filter(g => g.status === "published" && g.letterGrade === "F")
      .map(g => memoryDb.enrollments.find(e => e.id === g.enrollmentId)?.studentId)
      .filter((id): id is number => id !== undefined);
    const absentStudentIds = memoryDb.attendanceRecords
      .filter(a => a.status === "absent")
      .map(a => memoryDb.enrollments.find(e => e.id === a.enrollmentId)?.studentId)
      .filter((id): id is number => id !== undefined);
    const atRiskIds = new Set([...failingStudentIds, ...absentStudentIds]);

    return {
      isConfigured: true,
      activeStudents,
      completedEnrollments,
      attendanceExceptions,
      pendingGrades,
      atRiskStudents: atRiskIds.size,
      outstandingInvoices,
      applicationsInReview,
      recentActivity: memoryDb.auditEvents.slice(0, 5).map(e => ({
        id: e.id,
        action: e.action,
        entityType: e.entityType,
        summary: e.summary,
        occurredAt: e.occurredAt,
      })),
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
  if (!db) {
    return memoryDb.students.map(s => {
      const prog = memoryDb.programmes.find(p => p.id === s.programmeId);
      const dept = prog ? memoryDb.departments.find(d => d.id === prog.departmentId) : undefined;
      return {
        id: s.id,
        studentNumber: s.studentNumber,
        legalFirstName: s.legalFirstName,
        legalLastName: s.legalLastName,
        preferredName: s.preferredName,
        institutionalEmail: s.institutionalEmail,
        phone: s.phone,
        status: s.status,
        programmeName: prog?.name ?? null,
        programmeCode: prog?.code ?? null,
        departmentName: dept?.name ?? null,
        updatedAt: s.updatedAt,
      };
    });
  }

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
  if (!db) {
    const now = new Date();
    const id = memoryDb.students.length + 1;
    memoryDb.students.push({
      id,
      userId: null,
      studentNumber: input.studentNumber,
      legalFirstName: input.legalFirstName,
      legalLastName: input.legalLastName,
      preferredName: input.preferredName ?? null,
      institutionalEmail: input.institutionalEmail ?? null,
      phone: input.phone ?? null,
      emergencyContactName: input.emergencyContactName ?? null,
      emergencyContactPhone: input.emergencyContactPhone ?? null,
      programmeId: input.programmeId ?? null,
      admissionTermId: input.admissionTermId ?? null,
      status: input.status,
      createdAt: now,
      updatedAt: now,
    });
    return id;
  }

  const result = await db.insert(students).values(input);
  return Number(result[0].insertId);
}

export async function listApplicants() {
  const db = await getDb();
  if (!db) {
    return memoryDb.applicants.map(a => {
      const prog = memoryDb.programmes.find(p => p.id === a.programmeId);
      const term = memoryDb.terms.find(t => t.id === a.intakeTermId);
      return {
        id: a.id,
        applicantNumber: a.applicantNumber,
        firstName: a.firstName,
        lastName: a.lastName,
        email: a.email,
        phone: a.phone,
        status: a.status,
        applicationFeeStatus: a.applicationFeeStatus,
        detailsVerifiedAt: a.detailsVerifiedAt,
        userId: a.userId,
        programmeName: prog?.name ?? null,
        intakeTermName: term?.name ?? null,
        updatedAt: a.updatedAt,
      };
    });
  }

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
  if (!db) {
    const now = new Date();
    const id = memoryDb.applicants.length + 1;
    memoryDb.applicants.push({
      id,
      userId: input.userId ?? null,
      applicantNumber: input.applicantNumber,
      firstName: input.firstName,
      lastName: input.lastName,
      email: input.email,
      phone: input.phone ?? null,
      programmeId: input.programmeId ?? null,
      intakeTermId: input.intakeTermId ?? null,
      status: input.status,
      applicationFeeStatus: "pending",
      detailsVerifiedAt: null,
      detailsVerifiedByUserId: null,
      decisionAt: null,
      decidedByUserId: null,
      createdAt: now,
      updatedAt: now,
    });
    return id;
  }
  const result = await db.insert(applicants).values(input);
  return Number(result[0].insertId);
}

export async function getApplicantForUser(userId: number) {
  const db = await getDb();
  if (!db) return memoryDb.applicants.find(a => a.userId === userId);
  const result = await db.select().from(applicants).where(eq(applicants.userId, userId)).limit(1);
  return result[0];
}

export async function createSelfApplicant(input: { userId: number; applicantNumber: string; firstName: string; lastName: string; email: string; phone?: string; programmeId?: number; intakeTermId?: number }) {
  const db = await getDb();
  if (!db) {
    return createApplicant({ ...input, status: "submitted" });
  }
  const result = await db.insert(applicants).values({ ...input, status: "submitted", applicationFeeStatus: "pending" });
  return Number(result[0].insertId);
}

export async function simulateApplicantFeePayment(input: { applicantId: number; amountCents: number }) {
  const db = await getDb();
  const gatewayReference = `APP-${crypto.randomUUID().replace(/-/g, "").slice(0, 16).toUpperCase()}`;
  if (!db) {
    const applicant = memoryDb.applicants.find(a => a.id === input.applicantId);
    if (!applicant) throw new Error("Applicant record was not found.");
    const paymentId = memoryDb.applicantPayments.length + 1;
    memoryDb.applicantPayments.push({
      id: paymentId,
      applicantId: input.applicantId,
      amountCents: input.amountCents,
      currency: "USD",
      gatewayReference,
      gatewayStatus: "settled",
      reviewedAt: null,
      reviewedByUserId: null,
      createdAt: new Date(),
    });
    applicant.applicationFeeStatus = "settled";
    applicant.updatedAt = new Date();
    return { paymentId, gatewayReference };
  }
  const paymentId = await db.transaction(async tx => {
    const result = await tx.insert(applicantPayments).values({ applicantId: input.applicantId, amountCents: input.amountCents, gatewayReference, gatewayStatus: "settled" });
    await tx.update(applicants).set({ applicationFeeStatus: "settled" }).where(eq(applicants.id, input.applicantId));
    return Number(result[0].insertId);
  });
  return { paymentId, gatewayReference };
}

export async function activateApplicant(input: { applicantId: number; studentNumber: string; activatedByUserId: number }) {
  const db = await getDb();
  if (!db) {
    const applicant = memoryDb.applicants.find(a => a.id === input.applicantId);
    if (!applicant) throw new Error("Applicant record was not found.");
    if (!canActivateApplicant(applicant.status, applicant.applicationFeeStatus, Boolean(applicant.detailsVerifiedAt))) {
      throw new Error("Application cannot be activated until its submitted details and fee condition are confirmed.");
    }
    const now = new Date();
    const studentId = memoryDb.students.length + 1;
    memoryDb.students.push({
      id: studentId,
      userId: applicant.userId,
      studentNumber: input.studentNumber,
      legalFirstName: applicant.firstName,
      legalLastName: applicant.lastName,
      preferredName: null,
      institutionalEmail: applicant.email,
      phone: applicant.phone,
      emergencyContactName: null,
      emergencyContactPhone: null,
      programmeId: applicant.programmeId,
      admissionTermId: applicant.intakeTermId,
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
    applicant.status = "converted";
    applicant.decidedByUserId = input.activatedByUserId;
    applicant.decisionAt = now;
    applicant.updatedAt = now;
    if (applicant.userId) {
      const user = memoryDb.users.find(u => u.id === applicant.userId);
      if (user) user.role = "student";
    }
    return studentId;
  }
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
  if (!db) {
    const applicant = memoryDb.applicants.find(a => a.id === input.applicantId);
    if (!applicant) throw new Error("Applicant record was not found.");
    applicant.detailsVerifiedAt = new Date();
    applicant.detailsVerifiedByUserId = input.verifiedByUserId;
    applicant.status = "under_review";
    applicant.updatedAt = new Date();
    return;
  }
  await db.update(applicants).set({ detailsVerifiedAt: new Date(), detailsVerifiedByUserId: input.verifiedByUserId, status: "under_review" }).where(eq(applicants.id, input.applicantId));
}

export async function decideApplicant(input: {
  applicantId: number;
  status: "admitted" | "declined";
  decidedByUserId: number;
}) {
  const db = await getDb();
  if (!db) {
    const applicant = memoryDb.applicants.find(a => a.id === input.applicantId);
    if (!applicant) throw new Error("Applicant record was not found.");
    applicant.status = input.status;
    applicant.decidedByUserId = input.decidedByUserId;
    applicant.decisionAt = new Date();
    applicant.updatedAt = new Date();
    return;
  }
  await db.update(applicants).set({ status: input.status, decidedByUserId: input.decidedByUserId, decisionAt: new Date() }).where(eq(applicants.id, input.applicantId));
}

export async function convertApplicant(input: { applicantId: number; studentNumber: string }) {
  const db = await getDb();
  if (!db) {
    const applicant = memoryDb.applicants.find(a => a.id === input.applicantId);
    if (!applicant) throw new Error("Applicant record was not found.");
    if (applicant.status !== "admitted") throw new Error("Only an admitted applicant can be converted into a student record.");
    const now = new Date();
    const studentId = memoryDb.students.length + 1;
    memoryDb.students.push({
      id: studentId,
      userId: applicant.userId,
      studentNumber: input.studentNumber,
      legalFirstName: applicant.firstName,
      legalLastName: applicant.lastName,
      preferredName: null,
      institutionalEmail: applicant.email,
      phone: applicant.phone,
      emergencyContactName: null,
      emergencyContactPhone: null,
      programmeId: applicant.programmeId,
      admissionTermId: applicant.intakeTermId,
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
    applicant.status = "converted";
    applicant.updatedAt = now;
    return studentId;
  }

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
  if (!db) return memoryDb.staffProfiles;
  return db.select().from(staffProfiles).orderBy(desc(staffProfiles.createdAt));
}

export async function createStaffProfile(input: { fullName: string; email: string; staffNumber: string; staffCategory: "teaching" | "technical" | "finance" | "registry" | "administration"; accessRole: "faculty" | "non_teaching" | "finance" | "registrar" | "admin"; provisionedByUserId: number }) {
  const db = await getDb();
  if (!db) {
    const matchingUser = memoryDb.users.find(u => u.email === input.email);
    const now = new Date();
    const id = memoryDb.staffProfiles.length + 1;
    memoryDb.staffProfiles.push({
      id,
      userId: matchingUser?.id ?? null,
      fullName: input.fullName,
      email: input.email,
      staffNumber: input.staffNumber,
      staffCategory: input.staffCategory,
      accessRole: input.accessRole,
      status: staffProvisioningState(Boolean(matchingUser)),
      invitationToken: nanoid(24),
      invitationPreparedAt: null,
      invitationPreparedByUserId: null,
      invitationDeliveryStatus: "not_sent",
      invitationSentAt: null,
      invitationFailureReason: null,
      provisionedByUserId: input.provisionedByUserId,
      createdAt: now,
      updatedAt: now,
    });
    if (matchingUser) matchingUser.role = input.accessRole;
    return id;
  }
  const [matchingUser] = await db.select({ id: users.id }).from(users).where(eq(users.email, input.email)).limit(1);
  const result = await db.insert(staffProfiles).values({ ...input, invitationToken: nanoid(24), userId: matchingUser?.id, status: staffProvisioningState(Boolean(matchingUser)) });
  if (matchingUser) await db.update(users).set({ role: input.accessRole }).where(eq(users.id, matchingUser.id));
  return Number(result[0].insertId);
}

export async function prepareStaffInvitation(input: { staffProfileId: number; preparedByUserId: number }, databaseOverride?: DatabaseConnection) {
  const db = databaseOverride ?? await getDb();
  if (!db) {
    const profile = memoryDb.staffProfiles.find(p => p.id === input.staffProfileId);
    if (!profile) throw new Error("Staff profile was not found.");
    Object.assign(profile, { invitationPreparedAt: new Date(), invitationPreparedByUserId: input.preparedByUserId, ...preparedInvitationState() });
    return profile;
  }
  const [profile] = await db.select().from(staffProfiles).where(eq(staffProfiles.id, input.staffProfileId)).limit(1);
  if (!profile) throw new Error("Staff profile was not found.");
  await db.update(staffProfiles).set({ invitationPreparedAt: new Date(), invitationPreparedByUserId: input.preparedByUserId, ...preparedInvitationState() }).where(eq(staffProfiles.id, input.staffProfileId));
  return profile;
}

export async function recordStaffInvitationDelivery(input: { staffProfileId: number; deliveryStatus: "sent" | "failed"; actorUserId: number; failureReason?: string }, databaseOverride?: DatabaseConnection) {
  const db = databaseOverride ?? await getDb();
  if (!db) {
    const profile = memoryDb.staffProfiles.find(p => p.id === input.staffProfileId);
    if (!profile) throw new Error("Staff profile was not found.");
    Object.assign(profile, { ...simulatedInvitationDeliveryState(input.deliveryStatus), invitationFailureReason: input.deliveryStatus === "failed" ? input.failureReason || "Simulated email delivery failure" : null, invitationPreparedByUserId: input.actorUserId });
    return profile;
  }
  const [profile] = await db.select().from(staffProfiles).where(eq(staffProfiles.id, input.staffProfileId)).limit(1);
  if (!profile) throw new Error("Staff profile was not found.");
  await db.update(staffProfiles).set({ ...simulatedInvitationDeliveryState(input.deliveryStatus), invitationFailureReason: input.deliveryStatus === "failed" ? input.failureReason || "Simulated email delivery failure" : null, invitationPreparedByUserId: input.actorUserId }).where(eq(staffProfiles.id, input.staffProfileId));
  return profile;
}

export async function getAcademicCatalogue() {
  const db = await getDb();
  if (!db) {
    return {
      departments: memoryDb.departments,
      programmes: memoryDb.programmes.map(p => ({
        ...p,
        departmentName: memoryDb.departments.find(d => d.id === p.departmentId)?.name ?? "General",
      })),
      terms: memoryDb.terms,
      courses: memoryDb.courses.map(c => ({
        ...c,
        departmentName: memoryDb.departments.find(d => d.id === c.departmentId)?.name ?? "General",
      })),
      offerings: memoryDb.offerings.map(o => {
        const course = memoryDb.courses.find(c => c.id === o.courseId);
        const term = memoryDb.terms.find(t => t.id === o.termId);
        return {
          ...o,
          courseCode: course?.code ?? "COURSE",
          courseTitle: course?.title ?? "Course",
          termName: term?.name ?? "Term",
        };
      }),
    };
  }

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
  if (!db) {
    const id = memoryDb.departments.length + 1;
    memoryDb.departments.push({ id, code: input.code, name: input.name, active: true, createdAt: new Date(), updatedAt: new Date() });
    return id;
  }
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
  if (!db) {
    const id = memoryDb.programmes.length + 1;
    memoryDb.programmes.push({ id, ...input, active: true, createdAt: new Date(), updatedAt: new Date() });
    return id;
  }
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
  if (!db) {
    const id = memoryDb.terms.length + 1;
    memoryDb.terms.push({ id, ...input, createdAt: new Date(), updatedAt: new Date() });
    return id;
  }
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
  if (!db) {
    const id = memoryDb.courses.length + 1;
    memoryDb.courses.push({ id, ...input, description: input.description ?? null, active: true, createdAt: new Date(), updatedAt: new Date() });
    return id;
  }
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
  if (!db) {
    const id = memoryDb.offerings.length + 1;
    memoryDb.offerings.push({ id, ...input, meetingPattern: input.meetingPattern ?? null, room: input.room ?? null, createdAt: new Date(), updatedAt: new Date() });
    return id;
  }
  const result = await db.insert(courseOfferings).values(input);
  return Number(result[0].insertId);
}

export async function enrollStudent(input: { studentId: number; courseOfferingId: number }) {
  const db = await getDb();
  if (!db) {
    const id = memoryDb.enrollments.length + 1;
    memoryDb.enrollments.push({ id, ...input, status: "registered", registeredAt: new Date(), updatedAt: new Date() });
    return id;
  }
  const result = await db.insert(enrollments).values({ ...input, status: "registered" });
  return Number(result[0].insertId);
}

export async function canManageOffering(userId: number, role: UserRole, courseOfferingId: number) {
  if (role === "admin" || role === "registrar") return true;
  if (role !== "faculty") return false;

  const db = await getDb();
  if (!db) {
    return memoryDb.facultyAssignments.some(a => a.facultyUserId === userId && a.courseOfferingId === courseOfferingId);
  }
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
  if (!db) {
    const allowedOfferings = role === "faculty"
      ? memoryDb.offerings.filter(o => memoryDb.facultyAssignments.some(a => a.facultyUserId === userId && a.courseOfferingId === o.id))
      : memoryDb.offerings;
    return allowedOfferings.map(o => {
      const course = memoryDb.courses.find(c => c.id === o.courseId);
      const term = memoryDb.terms.find(t => t.id === o.termId);
      return {
        id: o.id,
        section: o.section,
        meetingPattern: o.meetingPattern,
        room: o.room,
        modality: o.modality,
        status: o.status,
        courseCode: course?.code ?? "COURSE",
        courseTitle: course?.title ?? "Course",
        termName: term?.name ?? "Term",
      };
    });
  }

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
  if (!db) {
    return memoryDb.classMeetings.map(m => {
      const offering = memoryDb.offerings.find(o => o.id === m.courseOfferingId);
      const course = offering ? memoryDb.courses.find(c => c.id === offering.courseId) : undefined;
      const term = offering ? memoryDb.terms.find(t => t.id === offering.termId) : undefined;
      return {
        id: m.id,
        weekday: m.weekday,
        startsAt: m.startsAt,
        endsAt: m.endsAt,
        room: m.room,
        courseOfferingId: m.courseOfferingId,
        section: offering?.section ?? "A",
        courseCode: course?.code ?? "COURSE",
        courseTitle: course?.title ?? "Course",
        termName: term?.name ?? "Term",
      };
    });
  }

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
  if (!db) {
    const registeredOfferingIds = memoryDb.enrollments
      .filter(e => e.studentId === studentId && e.status === "registered")
      .map(e => e.courseOfferingId);
    return memoryDb.classMeetings
      .filter(m => registeredOfferingIds.includes(m.courseOfferingId))
      .map(m => {
        const offering = memoryDb.offerings.find(o => o.id === m.courseOfferingId)!;
        const course = memoryDb.courses.find(c => c.id === offering.courseId)!;
        const term = memoryDb.terms.find(t => t.id === offering.termId)!;
        return {
          meetingId: m.id,
          weekday: m.weekday,
          startsAt: m.startsAt,
          endsAt: m.endsAt,
          room: m.room,
          courseOfferingId: offering.id,
          section: offering.section,
          courseCode: course.code,
          courseTitle: course.title,
          termName: term.name,
          termStartsAt: term.startsAt,
          termEndsAt: term.endsAt,
        };
      });
  }
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
  if (!db) {
    const id = memoryDb.classMeetings.length + 1;
    memoryDb.classMeetings.push({ id, ...input, room: input.room ?? null, createdAt: new Date() });
    return id;
  }
  const result = await db.insert(classMeetings).values(input);
  return Number(result[0].insertId);
}

export async function getOfferingRoster(courseOfferingId: number) {
  const db = await getDb();
  if (!db) {
    return memoryDb.enrollments
      .filter(e => e.courseOfferingId === courseOfferingId)
      .map(e => {
        const student = memoryDb.students.find(s => s.id === e.studentId)!;
        const grade = memoryDb.gradeRecords.find(g => g.enrollmentId === e.id);
        return {
          enrollmentId: e.id,
          enrollmentStatus: e.status,
          studentId: student.id,
          studentNumber: student.studentNumber,
          legalFirstName: student.legalFirstName,
          legalLastName: student.legalLastName,
          gradeId: grade?.id ?? null,
          score: grade?.score ?? null,
          letterGrade: grade?.letterGrade ?? null,
          gradeStatus: grade?.status ?? null,
        };
      });
  }

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
  if (!db) {
    const existing = memoryDb.attendanceRecords.find(a => a.enrollmentId === input.enrollmentId && a.classDate === input.classDate);
    if (existing) {
      existing.status = input.status;
      existing.capturedByUserId = input.capturedByUserId;
      existing.capturedAt = new Date();
    } else {
      memoryDb.attendanceRecords.push({
        id: memoryDb.attendanceRecords.length + 1,
        ...input,
        capturedAt: new Date(),
      });
    }
    return;
  }
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
  const grade = gradeFromScore(input.score);
  const publishedAt = input.status === "published" ? new Date() : null;
  if (!db) {
    const existing = memoryDb.gradeRecords.find(g => g.enrollmentId === input.enrollmentId);
    if (existing) {
      existing.score = input.score;
      existing.letterGrade = grade.letterGrade;
      existing.gradePointsTimes100 = grade.gradePointsTimes100;
      existing.status = input.status;
      existing.enteredByUserId = input.enteredByUserId;
      existing.enteredAt = new Date();
      existing.publishedAt = publishedAt;
    } else {
      memoryDb.gradeRecords.push({
        id: memoryDb.gradeRecords.length + 1,
        enrollmentId: input.enrollmentId,
        score: input.score,
        letterGrade: grade.letterGrade,
        gradePointsTimes100: grade.gradePointsTimes100,
        status: input.status,
        enteredByUserId: input.enteredByUserId,
        enteredAt: new Date(),
        publishedAt,
      });
    }
    if (input.status === "published") {
      const enrollment = memoryDb.enrollments.find(e => e.id === input.enrollmentId);
      if (enrollment) enrollment.status = "completed";
    }
    return grade;
  }

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
  if (!db) return memoryDb.students.find(s => s.userId === userId)?.id;
  const result = await db.select({ id: students.id }).from(students).where(eq(students.userId, userId)).limit(1);
  return result[0]?.id;
}

export async function getAcademicRecord(studentId: number, includeDrafts: boolean) {
  const db = await getDb();
  if (!db) {
    const s = memoryDb.students.find(st => st.id === studentId);
    if (!s) return { student: undefined, results: [], gpa: null };
    const prog = memoryDb.programmes.find(p => p.id === s.programmeId);
    const dept = prog ? memoryDb.departments.find(d => d.id === prog.departmentId) : undefined;
    const student = {
      id: s.id,
      studentNumber: s.studentNumber,
      legalFirstName: s.legalFirstName,
      legalLastName: s.legalLastName,
      preferredName: s.preferredName,
      status: s.status,
      programmeName: prog?.name ?? null,
      departmentName: dept?.name ?? null,
    };
    const results = memoryDb.enrollments
      .filter(e => e.studentId === studentId)
      .map(e => {
        const offering = memoryDb.offerings.find(o => o.id === e.courseOfferingId)!;
        const course = memoryDb.courses.find(c => c.id === offering.courseId)!;
        const term = memoryDb.terms.find(t => t.id === offering.termId)!;
        const grade = memoryDb.gradeRecords.find(g => g.enrollmentId === e.id);
        return {
          enrollmentId: e.id,
          enrollmentStatus: e.status,
          courseCode: course.code,
          courseTitle: course.title,
          credits: course.credits,
          termName: term.name,
          score: grade?.score ?? null,
          letterGrade: grade?.letterGrade ?? null,
          gradePointsTimes100: grade?.gradePointsTimes100 ?? null,
          gradeStatus: grade?.status ?? null,
          publishedAt: grade?.publishedAt ?? null,
        };
      });
    const visibleResults = includeDrafts ? results : results.filter(r => r.gradeStatus === "published");
    const gpaCourses = visibleResults
      .filter((r): r is typeof r & { gradePointsTimes100: number } => r.gradePointsTimes100 !== null && r.enrollmentStatus === "completed")
      .map(r => ({ credits: r.credits, gradePointsTimes100: r.gradePointsTimes100 }));
    return { student, results: visibleResults, gpa: calculateGpa(gpaCourses) };
  }

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
  if (!db) {
    const rows = memoryDb.enrollments
      .filter(e => e.studentId === studentId)
      .map(e => {
        const grade = memoryDb.gradeRecords.find(g => g.enrollmentId === e.id && g.status === "published");
        if (!grade) return null;
        const offering = memoryDb.offerings.find(o => o.id === e.courseOfferingId)!;
        const term = memoryDb.terms.find(t => t.id === offering.termId)!;
        const course = memoryDb.courses.find(c => c.id === offering.courseId)!;
        return {
          termId: term.id,
          termName: term.name,
          termCode: term.code,
          startsAt: term.startsAt,
          courseCode: course.code,
          courseTitle: course.title,
          credits: course.credits,
          letterGrade: grade.letterGrade,
          gradePointsTimes100: grade.gradePointsTimes100,
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);
    return aggregateTermProgression(rows);
  }
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
  if (!db) {
    return memoryDb.invoices
      .filter(i => i.studentId === studentId)
      .map(i => ({
        id: i.id,
        invoiceNumber: i.invoiceNumber,
        amountCents: i.amountCents,
        balanceCents: i.balanceCents,
        dueAt: i.dueAt,
        status: i.status,
        termName: memoryDb.terms.find(t => t.id === i.termId)?.name ?? null,
      }));
  }

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
  if (!db) {
    return memoryDb.invoices.map(i => {
      const student = memoryDb.students.find(s => s.id === i.studentId)!;
      const term = memoryDb.terms.find(t => t.id === i.termId);
      return {
        id: i.id,
        invoiceNumber: i.invoiceNumber,
        amountCents: i.amountCents,
        balanceCents: i.balanceCents,
        dueAt: i.dueAt,
        status: i.status,
        studentId: student.id,
        studentNumber: student.studentNumber,
        legalFirstName: student.legalFirstName,
        legalLastName: student.legalLastName,
        termName: term?.name ?? null,
      };
    });
  }

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
  if (!db) {
    const id = memoryDb.invoices.length + 1;
    const now = new Date();
    memoryDb.invoices.push({
      id,
      studentId: input.studentId,
      termId: input.termId ?? null,
      invoiceNumber: input.invoiceNumber,
      amountCents: input.amountCents,
      balanceCents: input.amountCents,
      dueAt: input.dueAt ?? null,
      status: "issued",
      createdByUserId: input.createdByUserId,
      createdAt: now,
      updatedAt: now,
    });
    return id;
  }
  const result = await db.insert(invoices).values({
    ...input,
    balanceCents: input.amountCents,
    status: "issued",
  });
  return Number(result[0].insertId);
}

export async function listScholarships() {
  const db = await getDb();
  if (!db) {
    return memoryDb.scholarships.map(sc => {
      const student = memoryDb.students.find(s => s.id === sc.studentId)!;
      const term = memoryDb.terms.find(t => t.id === sc.termId);
      return {
        id: sc.id,
        name: sc.name,
        amountCents: sc.amountCents,
        status: sc.status,
        studentNumber: student.studentNumber,
        legalFirstName: student.legalFirstName,
        legalLastName: student.legalLastName,
        termName: term?.name ?? null,
      };
    });
  }
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
  if (!db) {
    const id = memoryDb.scholarships.length + 1;
    memoryDb.scholarships.push({
      id,
      studentId: input.studentId,
      termId: input.termId ?? null,
      name: input.name,
      amountCents: input.amountCents,
      status: "approved",
      approvedByUserId: input.approvedByUserId,
      createdAt: new Date(),
    });
    return id;
  }
  const result = await db.insert(scholarships).values({ ...input, status: "approved" });
  return Number(result[0].insertId);
}

export async function waiveInvoice(invoiceId: number) {
  const db = await getDb();
  if (!db) {
    const inv = memoryDb.invoices.find(i => i.id === invoiceId);
    if (inv) {
      inv.status = "waived";
      inv.balanceCents = 0;
      inv.updatedAt = new Date();
    }
    return;
  }
  await db.update(invoices).set({ status: "waived", balanceCents: 0 }).where(eq(invoices.id, invoiceId));
}

export async function getInvoiceForPayment(invoiceId: number) {
  const db = await getDb();
  if (!db) return memoryDb.invoices.find(i => i.id === invoiceId);
  const result = await db
    .select({ id: invoices.id, studentId: invoices.studentId, invoiceNumber: invoices.invoiceNumber, balanceCents: invoices.balanceCents, status: invoices.status })
    .from(invoices)
    .where(eq(invoices.id, invoiceId))
    .limit(1);
  return result[0];
}

export async function simulateInvoicePayment(input: { invoiceId: number; studentId: number; amountCents: number }) {
  const db = await getDb();
  const invoice = await getInvoiceForPayment(input.invoiceId);
  if (!invoice || invoice.studentId !== input.studentId) throw new Error("Invoice was not found for this student record.");
  if (!["issued", "part_paid", "overdue"].includes(invoice.status) || invoice.balanceCents <= 0) throw new Error("This invoice is not eligible for a payment simulation.");
  const remainingBalance = remainingInvoiceBalance(invoice.balanceCents, input.amountCents);
  const gatewayReference = `SIM-${crypto.randomUUID().replace(/-/g, "").slice(0, 16).toUpperCase()}`;
  if (!db) {
    const paymentId = memoryDb.paymentTransactions.length + 1;
    const now = new Date();
    memoryDb.paymentTransactions.push({
      id: paymentId,
      invoiceId: invoice.id,
      studentId: input.studentId,
      amountCents: input.amountCents,
      currency: "USD",
      gateway: "simulated",
      gatewayReference,
      gatewayStatus: "settled",
      reconciliationStatus: "pending",
      paidAt: now,
      reconciledAt: null,
      reconciledByUserId: null,
      createdAt: now,
      updatedAt: now,
    });
    const memInvoice = memoryDb.invoices.find(i => i.id === invoice.id)!;
    memInvoice.balanceCents = remainingBalance;
    memInvoice.status = remainingBalance === 0 ? "paid" : "part_paid";
    memInvoice.updatedAt = now;
    return { paymentId, gatewayReference };
  }
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
  if (!db) {
    return memoryDb.paymentTransactions
      .filter(p => !studentId || p.studentId === studentId)
      .map(p => {
        const inv = memoryDb.invoices.find(i => i.id === p.invoiceId)!;
        const student = memoryDb.students.find(s => s.id === p.studentId)!;
        return {
          id: p.id,
          invoiceId: inv.id,
          invoiceNumber: inv.invoiceNumber,
          amountCents: p.amountCents,
          currency: p.currency,
          gateway: p.gateway,
          gatewayReference: p.gatewayReference,
          gatewayStatus: p.gatewayStatus,
          reconciliationStatus: p.reconciliationStatus,
          paidAt: p.paidAt,
          reconciledAt: p.reconciledAt,
          studentId: student.id,
          studentNumber: student.studentNumber,
          legalFirstName: student.legalFirstName,
          legalLastName: student.legalLastName,
        };
      });
  }
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
  if (!db) {
    const p = memoryDb.paymentTransactions.find(pt => pt.id === input.paymentId);
    if (p) {
      p.reconciliationStatus = input.status;
      p.reconciledAt = new Date();
      p.reconciledByUserId = input.userId;
      p.updatedAt = new Date();
    }
    return;
  }
  await db.update(paymentTransactions).set({ reconciliationStatus: input.status, reconciledAt: new Date(), reconciledByUserId: input.userId }).where(eq(paymentTransactions.id, input.paymentId));
}

export async function getPaymentReportingMetrics() {
  const db = await getDb();
  const payments = db
    ? await db.select({ amountCents: paymentTransactions.amountCents, status: paymentTransactions.reconciliationStatus }).from(paymentTransactions)
    : memoryDb.paymentTransactions.map(p => ({ amountCents: p.amountCents, status: p.reconciliationStatus }));
  return payments.reduce((metrics, payment) => ({
    pendingCount: metrics.pendingCount + (payment.status === "pending" ? 1 : 0),
    reconciledCount: metrics.reconciledCount + (payment.status === "reconciled" ? 1 : 0),
    exceptionCount: metrics.exceptionCount + (payment.status === "exception" ? 1 : 0),
    settledCents: metrics.settledCents + payment.amountCents,
  }), { pendingCount: 0, reconciledCount: 0, exceptionCount: 0, settledCents: 0 });
}

export async function listStudentRequestsForUser(userId: number, role: UserRole) {
  const db = await getDb();
  if (!db) {
    const studentId = (role === "student" || role === "user") ? await getStudentIdForUser(userId) : undefined;
    return memoryDb.studentRequests
      .filter(r => !studentId || r.studentId === studentId)
      .map(r => {
        const student = memoryDb.students.find(s => s.id === r.studentId)!;
        return {
          id: r.id,
          type: r.type,
          title: r.title,
          detail: r.detail,
          status: r.status,
          createdAt: r.createdAt,
          updatedAt: r.updatedAt,
          studentId: student.id,
          studentNumber: student.studentNumber,
          legalFirstName: student.legalFirstName,
          legalLastName: student.legalLastName,
        };
      });
  }

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
  if (!db) {
    const id = memoryDb.studentRequests.length + 1;
    const now = new Date();
    memoryDb.studentRequests.push({
      id,
      studentId: input.studentId,
      type: input.type,
      title: input.title,
      detail: input.detail ?? null,
      status: "submitted",
      assigneeUserId: null,
      createdAt: now,
      updatedAt: now,
    });
    return id;
  }
  const result = await db.insert(studentRequests).values(input);
  return Number(result[0].insertId);
}

export async function updateStudentRequestStatus(input: {
  requestId: number;
  status: "submitted" | "in_review" | "approved" | "rejected" | "completed";
  assigneeUserId: number;
}) {
  const db = await getDb();
  if (!db) {
    const req = memoryDb.studentRequests.find(r => r.id === input.requestId);
    if (req) {
      req.status = input.status;
      req.assigneeUserId = input.assigneeUserId;
      req.updatedAt = new Date();
    }
    return;
  }
  await db
    .update(studentRequests)
    .set({ status: input.status, assigneeUserId: input.assigneeUserId })
    .where(eq(studentRequests.id, input.requestId));
}

export async function getStudentRequest(requestId: number) {
  const db = await getDb();
  if (!db) return memoryDb.studentRequests.find(r => r.id === requestId);
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
  if (!db) {
    const id = memoryDb.documents.length + 1;
    memoryDb.documents.push({ id, ...input, createdAt: new Date() });
    return id;
  }
  const result = await db.insert(documents).values(input);
  return Number(result[0].insertId);
}

export async function listDocumentsForRequest(requestId: number) {
  const db = await getDb();
  if (!db) return memoryDb.documents.filter(d => d.requestId === requestId);
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
  if (!db) return memoryDb.auditEvents;

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
  if (!db) return memoryDb.users;

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
  if (!db) {
    const u = memoryDb.users.find(user => user.id === userId);
    if (u) u.role = role;
    return;
  }
  await db.update(users).set({ role }).where(eq(users.id, userId));
}

export async function createCoursePrerequisite(input: {
  courseId: number;
  prerequisiteCourseId: number;
}) {
  const db = await getDb();
  if (!db) {
    const id = memoryDb.coursePrerequisites.length + 1;
    memoryDb.coursePrerequisites.push({ id, ...input });
    return id;
  }
  const result = await db.insert(coursePrerequisites).values(input);
  return Number(result[0].insertId);
}

export async function listFacultyUsers() {
  const db = await getDb();
  if (!db) return memoryDb.users.filter(u => u.role === "faculty");

  return db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .where(eq(users.role, "faculty"))
    .orderBy(users.name);
}

export async function assignFaculty(input: { courseOfferingId: number; facultyUserId: number }) {
  const db = await getDb();
  if (!db) {
    const existing = memoryDb.facultyAssignments.find(a => a.courseOfferingId === input.courseOfferingId && a.facultyUserId === input.facultyUserId);
    if (existing) return existing.id;
    const id = memoryDb.facultyAssignments.length + 1;
    memoryDb.facultyAssignments.push({ id, ...input, assignmentRole: "instructor", assignedAt: new Date() });
    return id;
  }
  const result = await db.insert(facultyAssignments).values(input).onDuplicateKeyUpdate({
    set: { assignmentRole: "instructor" },
  });
  return Number(result[0].insertId);
}

export async function createCourseActivity(input: { courseOfferingId: number; type: "assessment" | "assignment" | "note"; title: string; description?: string; dueAt?: Date; maxScore?: number; createdByUserId: number }) {
  const db = await getDb();
  if (!db) {
    const id = memoryDb.courseActivities.length + 1;
    const now = new Date();
    memoryDb.courseActivities.push({
      id,
      courseOfferingId: input.courseOfferingId,
      type: input.type,
      title: input.title,
      description: input.description ?? null,
      dueAt: input.dueAt ?? null,
      maxScore: input.maxScore ?? null,
      published: true,
      createdByUserId: input.createdByUserId,
      createdAt: now,
      updatedAt: now,
    });
    return id;
  }
  const result = await db.insert(courseActivities).values(input);
  return Number(result[0].insertId);
}

export async function getOfferingLearningProgress(courseOfferingId: number) {
  const db = await getDb();
  if (!db) {
    const activities = memoryDb.courseActivities.filter(a => a.courseOfferingId === courseOfferingId && a.published);
    const studentsInCourse = await getOfferingRoster(courseOfferingId);
    return {
      activities,
      students: studentsInCourse.map(student => {
        const attended = memoryDb.attendanceRecords.filter(r => r.enrollmentId === student.enrollmentId && r.status !== "excused");
        const present = attended.filter(r => r.status === "present" || r.status === "late").length;
        return {
          ...student,
          attendanceCount: attended.length,
          attendanceRate: attended.length ? Math.round((present / attended.length) * 100) : null,
          submissions: memoryDb.activitySubmissions.filter(s => s.enrollmentId === student.enrollmentId),
        };
      }),
    };
  }
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
  if (!db) {
    const enrolled = memoryDb.enrollments.filter(e => e.studentId === studentId && e.status === "registered");
    return enrolled.map(e => {
      const offering = memoryDb.offerings.find(o => o.id === e.courseOfferingId)!;
      const course = memoryDb.courses.find(c => c.id === offering.courseId)!;
      const term = memoryDb.terms.find(t => t.id === offering.termId)!;
      const activities = memoryDb.courseActivities
        .filter(a => a.courseOfferingId === offering.id && a.published)
        .map(a => {
          const sub = memoryDb.activitySubmissions.find(s => s.activityId === a.id && s.enrollmentId === e.id);
          return {
            id: a.id,
            type: a.type,
            title: a.title,
            description: a.description,
            dueAt: a.dueAt,
            maxScore: a.maxScore,
            submissionId: sub?.id ?? null,
            response: sub?.response ?? null,
            score: sub?.score ?? null,
            feedback: sub?.feedback ?? null,
            submissionStatus: sub?.status ?? null,
            submittedAt: sub?.submittedAt ?? null,
          };
        });
      const attendance = memoryDb.attendanceRecords.filter(a => a.enrollmentId === e.id);
      const countedAttendance = attendance.filter(row => row.status !== "excused");
      return {
        enrollmentId: e.id,
        offeringId: offering.id,
        section: offering.section,
        courseCode: course.code,
        courseTitle: course.title,
        termName: term.name,
        activities,
        attendance,
        attendanceRate: countedAttendance.length ? Math.round((countedAttendance.filter(row => row.status === "present" || row.status === "late").length / countedAttendance.length) * 100) : null,
      };
    });
  }
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
  if (!db) {
    const existing = memoryDb.activitySubmissions.find(s => s.activityId === input.activityId && s.enrollmentId === input.enrollmentId);
    if (existing) {
      existing.response = input.response;
      existing.status = "submitted";
      existing.submittedAt = new Date();
      existing.score = null;
      existing.feedback = null;
      existing.gradedAt = null;
      existing.gradedByUserId = null;
    } else {
      memoryDb.activitySubmissions.push({
        id: memoryDb.activitySubmissions.length + 1,
        activityId: input.activityId,
        enrollmentId: input.enrollmentId,
        response: input.response,
        score: null,
        feedback: null,
        status: "submitted",
        submittedAt: new Date(),
        gradedAt: null,
        gradedByUserId: null,
      });
    }
    return;
  }
  await db.insert(activitySubmissions).values({ ...input, status: "submitted", submittedAt: new Date() }).onDuplicateKeyUpdate({ set: { response: input.response, status: "submitted", submittedAt: new Date(), score: null, feedback: null, gradedAt: null, gradedByUserId: null } });
}

export async function getActivityEnrollment(activityId: number, studentId: number) {
  const db = await getDb();
  if (!db) {
    const activity = memoryDb.courseActivities.find(a => a.id === activityId && a.published);
    if (!activity) return null;
    const enrollment = memoryDb.enrollments.find(e => e.studentId === studentId && e.courseOfferingId === activity.courseOfferingId && e.status === "registered");
    return enrollment?.id ?? null;
  }
  const rows = await db.select({ enrollmentId: enrollments.id }).from(enrollments)
    .innerJoin(courseActivities, eq(courseActivities.courseOfferingId, enrollments.courseOfferingId))
    .where(and(eq(courseActivities.id, activityId), eq(enrollments.studentId, studentId), eq(enrollments.status, "registered"), eq(courseActivities.published, true))).limit(1);
  return rows[0]?.enrollmentId ?? null;
}

export async function getActivityMaxScore(activityId: number, courseOfferingId: number) {
  const db = await getDb();
  if (!db) {
    return memoryDb.courseActivities.find(a => a.id === activityId && a.courseOfferingId === courseOfferingId && a.published)?.maxScore ?? null;
  }
  const rows = await db.select({ maxScore: courseActivities.maxScore }).from(courseActivities)
    .where(and(eq(courseActivities.id, activityId), eq(courseActivities.courseOfferingId, courseOfferingId), eq(courseActivities.published, true))).limit(1);
  return rows[0]?.maxScore ?? null;
}

export async function isEnrollmentInActivity(activityId: number, enrollmentId: number) {
  const db = await getDb();
  if (!db) {
    const activity = memoryDb.courseActivities.find(a => a.id === activityId);
    const enrollment = memoryDb.enrollments.find(e => e.id === enrollmentId);
    return Boolean(activity && enrollment && activity.courseOfferingId === enrollment.courseOfferingId);
  }
  const rows = await db.select({ id: enrollments.id }).from(enrollments)
    .innerJoin(courseActivities, eq(courseActivities.courseOfferingId, enrollments.courseOfferingId))
    .where(and(eq(courseActivities.id, activityId), eq(enrollments.id, enrollmentId))).limit(1);
  return rows.length > 0;
}

export async function gradeCourseActivity(input: { activityId: number; enrollmentId: number; score: number; feedback?: string; gradedByUserId: number; }) {
  const db = await getDb();
  if (!db) {
    const existing = memoryDb.activitySubmissions.find(s => s.activityId === input.activityId && s.enrollmentId === input.enrollmentId);
    if (existing) {
      existing.score = input.score;
      existing.feedback = input.feedback ?? null;
      existing.status = "graded";
      existing.gradedAt = new Date();
      existing.gradedByUserId = input.gradedByUserId;
    } else {
      memoryDb.activitySubmissions.push({
        id: memoryDb.activitySubmissions.length + 1,
        activityId: input.activityId,
        enrollmentId: input.enrollmentId,
        response: null,
        score: input.score,
        feedback: input.feedback ?? null,
        status: "graded",
        submittedAt: new Date(),
        gradedAt: new Date(),
        gradedByUserId: input.gradedByUserId,
      });
    }
    return;
  }
  await db.insert(activitySubmissions).values({ ...input, status: "graded", gradedAt: new Date() }).onDuplicateKeyUpdate({ set: { score: input.score, feedback: input.feedback, status: "graded", gradedAt: new Date(), gradedByUserId: input.gradedByUserId } });
}
