import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { userRoleValues } from "../drizzle/schema";
import {
  academicProcedure,
  administratorProcedure,
  financeProcedure,
  registrarProcedure,
  studentServicesProcedure,
} from "./authorization";
import * as misDb from "./db/mis";
import * as lmsDb from "./db/lms";
import { COOKIE_NAME } from "./../shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { storageGetSignedUrl, storagePut, validateSafeUpload } from "./storage";
import { getOrCreateLocalUser } from "./db";
import { createSessionToken } from "./_core/sessions";
import { localAuthEnabled } from "./localAuth";
import {
  gradeItemStatusValues,
  lateSubmissionPolicyValues,
  publicationStatusValues,
  quizQuestionTypeValues,
  quizReviewPolicyValues,
} from "../shared/lms";

const id = z.number().int().positive();
const optionalText = (limit: number) => z.string().trim().max(limit).optional().transform(value => value || undefined);
const fileUploadSchema = z
  .object({
    fileName: z.string().trim().min(1).max(255),
    mimeType: z.string().trim().min(3).max(120),
    contentBase64: z.string().min(1).max(18_000_000),
  })
  .optional();

async function storeValidatedUpload(
  prefix: string,
  upload?: { fileName: string; mimeType: string; contentBase64: string },
) {
  if (!upload) return null;
  const bytes = Buffer.from(upload.contentBase64, "base64");
  const validated = validateSafeUpload({
    name: upload.fileName,
    mimeType: upload.mimeType,
    byteLength: bytes.byteLength,
  });
  const stored = await storagePut(`${prefix}/${Date.now()}-${validated.safeName}`, bytes, upload.mimeType);
  return {
    key: stored.key,
    url: stored.url,
    fileName: upload.fileName,
    mimeType: upload.mimeType,
    sizeBytes: bytes.byteLength,
  };
}

async function assertOfferingAccess(user: { id: number; role: (typeof userRoleValues)[number] }, courseOfferingId: number) {
  const allowed = await misDb.canManageOffering(user.id, user.role, courseOfferingId);
  if (!allowed) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You are not assigned to manage this course offering.",
    });
  }
}

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    localLogin: publicProcedure
      .input(z.enum(["applicant", "student", "faculty", "non_teaching", "finance", "registrar", "admin"]))
      .mutation(async ({ ctx, input }) => {
        if (!localAuthEnabled()) throw new TRPCError({ code: "FORBIDDEN", message: "Local authentication is disabled by configuration." });
        const user = await getOrCreateLocalUser(input);
        const token = await createSessionToken(user.openId);
        ctx.res.cookie(COOKIE_NAME, token, getSessionCookieOptions(ctx.req));
        return user;
      }),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  dashboard: router({
    overview: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role === "applicant") {
        return { scope: "applicant" as const };
      }
      if (ctx.user.role === "student" || ctx.user.role === "user") {
        const studentId = await misDb.getStudentIdForUser(ctx.user.id);
        if (!studentId) {
          return { scope: "student" as const, recordReady: false, gpa: null, publishedResults: 0, outstandingBalanceCents: 0 };
        }
        const [record, studentInvoices] = await Promise.all([
          misDb.getAcademicRecord(studentId, false),
          misDb.getStudentInvoices(studentId),
        ]);
        return {
          scope: "student" as const,
          recordReady: Boolean(record.student),
          gpa: record.gpa,
          publishedResults: record.results.length,
          outstandingBalanceCents: studentInvoices.reduce((sum, invoice) => sum + invoice.balanceCents, 0),
        };
      }

      if (ctx.user.role === "finance") {
        const metrics = await misDb.getPaymentReportingMetrics();
        return { scope: "finance" as const, ...metrics };
      }

      if (ctx.user.role === "non_teaching") {
        return { scope: "student_services" as const };
      }

      if (ctx.user.role === "faculty") {
        const offerings = await misDb.getTeachingOfferings(ctx.user.id, ctx.user.role);
        return { scope: "faculty" as const, assignedOfferings: offerings.length };
      }

      return { scope: "staff" as const, ...(await misDb.getDashboardMetrics()) };
    }),
  }),

  students: router({
    list: registrarProcedure.query(() => misDb.listStudents()),
    create: registrarProcedure
      .input(
        z.object({
          studentNumber: z.string().trim().min(4).max(40),
          legalFirstName: z.string().trim().min(1).max(100),
          legalLastName: z.string().trim().min(1).max(100),
          preferredName: optionalText(100),
          institutionalEmail: z.string().trim().email().max(320).optional(),
          phone: optionalText(40),
          emergencyContactName: optionalText(180),
          emergencyContactPhone: optionalText(40),
          programmeId: id.optional(),
          admissionTermId: id.optional(),
          status: z.enum(["applicant", "active", "leave", "graduated", "withdrawn"]),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const studentId = await misDb.createStudent(input);
        await misDb.writeAuditEvent({
          actorUserId: ctx.user.id,
          action: "student.created",
          entityType: "student",
          entityId: String(studentId),
          summary: `Created student record ${input.studentNumber}.`,
          metadata: { studentNumber: input.studentNumber, status: input.status, programmeId: input.programmeId ?? null },
        });
        return { id: studentId };
      }),
    update: registrarProcedure
      .input(
        z.object({
          studentId: id,
          status: z.enum(["applicant", "active", "leave", "graduated", "withdrawn"]),
          programmeId: id.nullable().optional(),
          preferredName: optionalText(100),
          institutionalEmail: z.string().trim().email().max(320).optional(),
          phone: optionalText(40),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const updated = await misDb.updateStudent(input);
        await misDb.writeAuditEvent({
          actorUserId: ctx.user.id,
          action: "student.updated",
          entityType: "student",
          entityId: String(input.studentId),
          summary: `Updated student record ${updated.studentNumber} (status: ${updated.previousStatus} → ${updated.status}${updated.programmeCode ? `, programme: ${updated.programmeCode}` : ""}).`,
          metadata: {
            studentNumber: updated.studentNumber,
            previousStatus: updated.previousStatus,
            status: updated.status,
            programmeCode: updated.programmeCode,
          },
        });
        return updated;
      }),
    academicRecord: registrarProcedure.input(z.object({ studentId: id })).query(({ input }) =>
      misDb.getAcademicRecord(input.studentId, true),
    ),
    myAcademicRecord: protectedProcedure.query(async ({ ctx }) => {
      const studentId = await misDb.getStudentIdForUser(ctx.user.id);
      if (!studentId) return null;
      return misDb.getAcademicRecord(studentId, false);
    }),
    mySchedule: protectedProcedure.query(async ({ ctx }) => {
      const studentId = await misDb.getStudentIdForUser(ctx.user.id);
      if (!studentId) return [];
      return misDb.getStudentSchedule(studentId);
    }),
    myProgression: protectedProcedure.query(async ({ ctx }) => {
      const studentId = await misDb.getStudentIdForUser(ctx.user.id);
      if (!studentId) return [];
      return misDb.getStudentProgression(studentId);
    }),
    myLearningProgress: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== "student" && ctx.user.role !== "user") throw new TRPCError({ code: "FORBIDDEN" });
      const studentId = await misDb.getStudentIdForUser(ctx.user.id);
      if (!studentId) return [];
      return misDb.getStudentLearningProgress(studentId);
    }),
    register: registrarProcedure
      .input(z.object({ studentId: id, courseOfferingId: id }))
      .mutation(async ({ ctx, input }) => {
        const policyCheck = await misDb.validateCourseRegistration(input.studentId, input.courseOfferingId);
        if (!policyCheck.ok) {
          throw new TRPCError({ code: policyCheck.code, message: policyCheck.message });
        }
        const clashes = await misDb.findTimetableClashes(input.studentId, input.courseOfferingId);
        if (clashes.length) {
          throw new TRPCError({ code: "CONFLICT", message: `Registration blocked: timetable conflict with ${clashes.map(clash => `${clash.courseCode} section ${clash.section} (${clash.weekday} ${clash.startsAt}–${clash.endsAt})`).join(", ")}.` });
        }
        const enrollmentId = await misDb.enrollStudent(input);
        await misDb.writeAuditEvent({
          actorUserId: ctx.user.id,
          action: "enrollment.created",
          entityType: "enrollment",
          entityId: String(enrollmentId),
          summary: `Registered student ${input.studentId} in offering ${input.courseOfferingId}.`,
        });
        return { id: enrollmentId };
      }),
  }),

  admissions: router({
    list: registrarProcedure.query(() => misDb.listApplicants()),
    mine: protectedProcedure.query(async ({ ctx }) => misDb.getApplicantForUser(ctx.user.id)),
    submitApplication: protectedProcedure
      .input(z.object({ applicantNumber: z.string().trim().min(4).max(40), firstName: z.string().trim().min(1).max(100), lastName: z.string().trim().min(1).max(100), email: z.string().trim().email().max(320), phone: optionalText(40), programmeId: id.optional(), intakeTermId: id.optional() }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "applicant") throw new TRPCError({ code: "FORBIDDEN", message: "Only prospective student accounts can submit an application." });
        const applicantId = await misDb.createSelfApplicant({ ...input, userId: ctx.user.id });
        await misDb.writeAuditEvent({ actorUserId: ctx.user.id, action: "application.self_submitted", entityType: "applicant", entityId: String(applicantId), summary: `Submitted application ${input.applicantNumber}.` });
        return { id: applicantId };
      }),
    simulateApplicationFee: protectedProcedure
      .input(z.object({ amountCents: z.number().int().positive().max(100000000) }))
      .mutation(async ({ ctx, input }) => {
        const applicant = await misDb.getApplicantForUser(ctx.user.id);
        if (!applicant) throw new TRPCError({ code: "NOT_FOUND", message: "Submit your application before recording an application fee." });
        const payment = await misDb.simulateApplicantFeePayment({ applicantId: applicant.id, amountCents: input.amountCents });
        await misDb.writeAuditEvent({ actorUserId: ctx.user.id, action: "application_fee.simulated_settlement", entityType: "applicantPayment", entityId: String(payment.paymentId), summary: `Simulated settled application fee for application ${applicant.applicantNumber}.`, metadata: { amountCents: input.amountCents, gatewayReference: payment.gatewayReference } });
        return payment;
      }),
    create: registrarProcedure
      .input(z.object({ applicantNumber: z.string().trim().min(4).max(40), firstName: z.string().trim().min(1).max(100), lastName: z.string().trim().min(1).max(100), email: z.string().trim().email().max(320), phone: optionalText(40), programmeId: id.optional(), intakeTermId: id.optional(), status: z.enum(["inquiry", "submitted", "under_review"]) }))
      .mutation(async ({ ctx, input }) => {
        const applicantId = await misDb.createApplicant(input);
        await misDb.writeAuditEvent({ actorUserId: ctx.user.id, action: "applicant.created", entityType: "applicant", entityId: String(applicantId), summary: `Created applicant record ${input.applicantNumber}.` });
        return { id: applicantId };
      }),
    decide: registrarProcedure
      .input(z.object({ applicantId: id, status: z.enum(["admitted", "declined"]) }))
      .mutation(async ({ ctx, input }) => {
        await misDb.decideApplicant({ ...input, decidedByUserId: ctx.user.id });
        await misDb.writeAuditEvent({ actorUserId: ctx.user.id, action: `applicant.${input.status}`, entityType: "applicant", entityId: String(input.applicantId), summary: `Recorded ${input.status} decision for applicant ${input.applicantId}.` });
        return { success: true };
      }),
    verifyDetails: administratorProcedure
      .input(z.object({ applicantId: id }))
      .mutation(async ({ ctx, input }) => {
        await misDb.verifyApplicantDetails({ applicantId: input.applicantId, verifiedByUserId: ctx.user.id });
        await misDb.writeAuditEvent({ actorUserId: ctx.user.id, action: "application.details_verified", entityType: "applicant", entityId: String(input.applicantId), summary: `Verified submitted details for applicant ${input.applicantId}.` });
        return { success: true };
      }),
    convert: administratorProcedure
      .input(z.object({ applicantId: id, studentNumber: z.string().trim().min(4).max(40) }))
      .mutation(async ({ ctx, input }) => {
        const studentId = await misDb.activateApplicant({ ...input, activatedByUserId: ctx.user.id });
        await misDb.writeAuditEvent({ actorUserId: ctx.user.id, action: "application.admin_confirmed_and_activated", entityType: "applicant", entityId: String(input.applicantId), summary: `Confirmed applicant details and activated student ${input.studentNumber}.`, metadata: { studentId } });
        return { id: studentId };
      }),
    activate: administratorProcedure
      .input(z.object({ applicantId: id, studentNumber: z.string().trim().min(4).max(40) }))
      .mutation(async ({ ctx, input }) => {
        const studentId = await misDb.activateApplicant({ ...input, activatedByUserId: ctx.user.id });
        await misDb.writeAuditEvent({ actorUserId: ctx.user.id, action: "application.admin_confirmed_and_activated", entityType: "applicant", entityId: String(input.applicantId), summary: `Confirmed applicant details and activated student ${input.studentNumber}.`, metadata: { studentId } });
        return { id: studentId };
      }),
  }),

  catalogue: router({
    get: protectedProcedure.query(() => misDb.getAcademicCatalogue()),
    createDepartment: registrarProcedure
      .input(z.object({ code: z.string().trim().min(2).max(24), name: z.string().trim().min(2).max(180) }))
      .mutation(async ({ ctx, input }) => {
        const departmentId = await misDb.createDepartment(input);
        await misDb.writeAuditEvent({
          actorUserId: ctx.user.id,
          action: "department.created",
          entityType: "department",
          entityId: String(departmentId),
          summary: `Created department ${input.code}.`,
        });
        return { id: departmentId };
      }),
    createProgramme: registrarProcedure
      .input(
        z.object({
          departmentId: id,
          code: z.string().trim().min(2).max(32),
          name: z.string().trim().min(2).max(180),
          awardType: z.enum(["certificate", "diploma", "degree", "postgraduate"]),
          durationTerms: z.number().int().min(1).max(30),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const programmeId = await misDb.createProgramme(input);
        await misDb.writeAuditEvent({
          actorUserId: ctx.user.id,
          action: "programme.created",
          entityType: "programme",
          entityId: String(programmeId),
          summary: `Created programme ${input.code}.`,
        });
        return { id: programmeId };
      }),
    createTerm: registrarProcedure
      .input(
        z.object({
          code: z.string().trim().min(2).max(32),
          name: z.string().trim().min(2).max(120),
          startsAt: z.coerce.date(),
          endsAt: z.coerce.date(),
          status: z.enum(["planned", "active", "closed"]),
        }).refine(value => value.endsAt > value.startsAt, { message: "Term end must follow its start." }),
      )
      .mutation(async ({ ctx, input }) => {
        const termId = await misDb.createTerm(input);
        await misDb.writeAuditEvent({
          actorUserId: ctx.user.id,
          action: "term.created",
          entityType: "academicTerm",
          entityId: String(termId),
          summary: `Created academic term ${input.code}.`,
        });
        return { id: termId };
      }),
    createCourse: registrarProcedure
      .input(
        z.object({
          departmentId: id,
          code: z.string().trim().min(2).max(32),
          title: z.string().trim().min(2).max(180),
          description: optionalText(5000),
          credits: z.number().int().min(1).max(30),
          level: z.number().int().min(1).max(20),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const courseId = await misDb.createCourse(input);
        await misDb.writeAuditEvent({
          actorUserId: ctx.user.id,
          action: "course.created",
          entityType: "course",
          entityId: String(courseId),
          summary: `Created course ${input.code}.`,
        });
        return { id: courseId };
      }),
    createPrerequisite: registrarProcedure
      .input(z.object({ courseId: id, prerequisiteCourseId: id }).refine(input => input.courseId !== input.prerequisiteCourseId, { message: "A course cannot require itself." }))
      .mutation(async ({ ctx, input }) => {
        const prerequisiteId = await misDb.createCoursePrerequisite(input);
        await misDb.writeAuditEvent({
          actorUserId: ctx.user.id,
          action: "course.prerequisite.created",
          entityType: "coursePrerequisite",
          entityId: String(prerequisiteId),
          summary: `Added prerequisite ${input.prerequisiteCourseId} to course ${input.courseId}.`,
        });
        return { id: prerequisiteId };
      }),
    createOffering: registrarProcedure
      .input(
        z.object({
          courseId: id,
          termId: id,
          section: z.string().trim().min(1).max(16),
          modality: z.enum(["in_person", "online", "hybrid"]),
          meetingPattern: optionalText(120),
          room: optionalText(80),
          capacity: z.number().int().min(1).max(2000),
          status: z.enum(["draft", "open", "closed", "cancelled"]),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const offeringId = await misDb.createOffering(input);
        await misDb.writeAuditEvent({
          actorUserId: ctx.user.id,
          action: "courseOffering.created",
          entityType: "courseOffering",
          entityId: String(offeringId),
          summary: `Created section ${input.section} for course ${input.courseId}.`,
        });
        return { id: offeringId };
      }),
  }),

  teaching: router({
    offerings: academicProcedure.query(({ ctx }) => misDb.getTeachingOfferings(ctx.user.id, ctx.user.role)),
    timetable: academicProcedure.query(() => misDb.getTimetable()),
    createMeeting: registrarProcedure
      .input(z.object({ courseOfferingId: id, weekday: z.enum(["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]), startsAt: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), endsAt: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), room: optionalText(80) }).refine(value => value.endsAt > value.startsAt, { message: "Class end time must follow its start time." }))
      .mutation(async ({ ctx, input }) => {
        const meetingId = await misDb.createClassMeeting(input);
        await misDb.writeAuditEvent({ actorUserId: ctx.user.id, action: "timetable.meeting.created", entityType: "classMeeting", entityId: String(meetingId), summary: `Added ${input.weekday} class meeting for offering ${input.courseOfferingId}.` });
        return { id: meetingId };
      }),
    faculty: registrarProcedure.query(() => misDb.listFacultyUsers()),
    assignFaculty: registrarProcedure
      .input(z.object({ courseOfferingId: id, facultyUserId: id }))
      .mutation(async ({ ctx, input }) => {
        const assignmentId = await misDb.assignFaculty(input);
        await misDb.writeAuditEvent({
          actorUserId: ctx.user.id,
          action: "faculty.assignment.created",
          entityType: "facultyAssignment",
          entityId: String(assignmentId),
          summary: `Assigned faculty user ${input.facultyUserId} to offering ${input.courseOfferingId}.`,
        });
        return { id: assignmentId };
      }),
    roster: academicProcedure
      .input(z.object({ courseOfferingId: id }))
      .query(async ({ ctx, input }) => {
        await assertOfferingAccess(ctx.user, input.courseOfferingId);
        return misDb.getOfferingRoster(input.courseOfferingId);
      }),
    learningProgress: academicProcedure.input(z.object({ courseOfferingId: id })).query(async ({ ctx, input }) => {
      await assertOfferingAccess(ctx.user, input.courseOfferingId);
      return misDb.getOfferingLearningProgress(input.courseOfferingId);
    }),
    createActivity: academicProcedure.input(z.object({ courseOfferingId: id, type: z.enum(["assessment", "assignment", "note"]), title: z.string().trim().min(1).max(180), description: optionalText(10000), dueAt: z.coerce.date().optional(), maxScore: z.number().int().positive().max(10000).optional() }).refine(value => value.type !== "note" || value.maxScore === undefined, { message: "Course notes do not have a score." }).refine(value => value.type === "note" || value.maxScore !== undefined, { message: "Assessments and assignments need a maximum score." }))
      .mutation(async ({ ctx, input }) => {
        await assertOfferingAccess(ctx.user, input.courseOfferingId);
        const activityId = await misDb.createCourseActivity({ ...input, createdByUserId: ctx.user.id });
        await misDb.writeAuditEvent({ actorUserId: ctx.user.id, action: `courseActivity.${input.type}.created`, entityType: "courseActivity", entityId: String(activityId), summary: `Created ${input.type}: ${input.title}.` });
        return { id: activityId };
      }),
    submitActivity: protectedProcedure.input(z.object({ activityId: id, response: z.string().trim().min(1).max(20000) })).mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "student" && ctx.user.role !== "user") throw new TRPCError({ code: "FORBIDDEN" });
      const studentId = await misDb.getStudentIdForUser(ctx.user.id);
      if (!studentId) throw new TRPCError({ code: "FORBIDDEN", message: "No student record is linked to this account." });
      const enrollmentId = await misDb.getActivityEnrollment(input.activityId, studentId);
      if (!enrollmentId) throw new TRPCError({ code: "FORBIDDEN", message: "This activity is not part of your course enrolments." });
      await misDb.submitCourseActivity({ ...input, enrollmentId });
      await misDb.writeAuditEvent({ actorUserId: ctx.user.id, action: "courseActivity.submitted", entityType: "courseActivity", entityId: String(input.activityId), summary: "Student submitted course work." });
      return { success: true };
    }),
    gradeActivity: academicProcedure.input(z.object({ courseOfferingId: id, activityId: id, enrollmentId: id, score: z.number().int().min(0), feedback: optionalText(5000) })).mutation(async ({ ctx, input }) => {
      await assertOfferingAccess(ctx.user, input.courseOfferingId);
      const maxScore = await misDb.getActivityMaxScore(input.activityId, input.courseOfferingId);
      if (maxScore === null) throw new TRPCError({ code: "NOT_FOUND", message: "Scored activity not found." });
      if (!(await misDb.isEnrollmentInActivity(input.activityId, input.enrollmentId))) throw new TRPCError({ code: "BAD_REQUEST", message: "The learner is not enrolled in this activity's course." });
      if (input.score > maxScore) throw new TRPCError({ code: "BAD_REQUEST", message: `Score cannot exceed ${maxScore}.` });
      const { courseOfferingId: _courseOfferingId, ...gradeInput } = input;
      await misDb.gradeCourseActivity({ ...gradeInput, gradedByUserId: ctx.user.id });
      await misDb.writeAuditEvent({ actorUserId: ctx.user.id, action: "courseActivity.graded", entityType: "activitySubmission", entityId: `${input.activityId}:${input.enrollmentId}`, summary: `Graded course work ${input.score}/${maxScore}.` });
      return { success: true };
    }),
    upsertAttendance: academicProcedure
      .input(
        z.object({
          courseOfferingId: id,
          enrollmentId: id,
          classDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use ISO date format YYYY-MM-DD."),
          status: z.enum(["present", "late", "absent", "excused"]),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        await assertOfferingAccess(ctx.user, input.courseOfferingId);
        await misDb.upsertAttendance({ ...input, capturedByUserId: ctx.user.id });
        await misDb.writeAuditEvent({
          actorUserId: ctx.user.id,
          action: "attendance.upserted",
          entityType: "enrollment",
          entityId: String(input.enrollmentId),
          summary: `Recorded ${input.status} attendance for ${input.classDate}.`,
        });
        return { success: true };
      }),
    upsertGrade: academicProcedure
      .input(
        z.object({
          courseOfferingId: id,
          enrollmentId: id,
          score: z.number().int().min(0).max(100),
          status: z.enum(["draft", "published"]),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        await assertOfferingAccess(ctx.user, input.courseOfferingId);
        const grade = await misDb.upsertGrade({ ...input, enteredByUserId: ctx.user.id });
        await misDb.writeAuditEvent({
          actorUserId: ctx.user.id,
          action: `grade.${input.status}`,
          entityType: "enrollment",
          entityId: String(input.enrollmentId),
          summary: `${input.status === "published" ? "Published" : "Saved"} ${grade.letterGrade} result.`,
        });
        return { success: true, grade };
      }),
  }),

  finance: router({
    invoices: financeProcedure.query(() => misDb.listInvoices()),
    studentOptions: financeProcedure.query(() => misDb.listStudents()),
    scholarships: financeProcedure.query(() => misDb.listScholarships()),
    payments: financeProcedure.query(() => misDb.listPayments()),
    reporting: financeProcedure.query(() => misDb.getPaymentReportingMetrics()),
    createInvoice: financeProcedure
      .input(
        z.object({
          studentId: id,
          termId: id.optional(),
          invoiceNumber: z.string().trim().min(4).max(48),
          amountCents: z.number().int().positive().max(100000000),
          dueAt: z.coerce.date().optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const invoiceId = await misDb.createInvoice({ ...input, createdByUserId: ctx.user.id });
        await misDb.writeAuditEvent({
          actorUserId: ctx.user.id,
          action: "invoice.issued",
          entityType: "invoice",
          entityId: String(invoiceId),
          summary: `Issued invoice ${input.invoiceNumber}.`,
          metadata: { studentId: input.studentId, amountCents: input.amountCents },
        });
        return { id: invoiceId };
      }),
    createScholarship: financeProcedure
      .input(z.object({ studentId: id, termId: id.optional(), name: z.string().trim().min(3).max(180), amountCents: z.number().int().positive().max(100000000) }))
      .mutation(async ({ ctx, input }) => {
        const scholarshipId = await misDb.createScholarship({ ...input, approvedByUserId: ctx.user.id });
        await misDb.writeAuditEvent({ actorUserId: ctx.user.id, action: "scholarship.approved", entityType: "scholarship", entityId: String(scholarshipId), summary: `Approved scholarship ${input.name}.`, metadata: { studentId: input.studentId, amountCents: input.amountCents } });
        return { id: scholarshipId };
      }),
    applyScholarship: financeProcedure
      .input(z.object({ scholarshipId: id, invoiceId: id }))
      .mutation(async ({ ctx, input }) => {
        const result = await misDb.applyScholarshipToInvoice(input);
        await misDb.writeAuditEvent({
          actorUserId: ctx.user.id,
          action: "scholarship.applied",
          entityType: "scholarship",
          entityId: String(input.scholarshipId),
          summary: `Applied scholarship ${result.scholarshipName} to invoice ${result.invoiceNumber}.`,
          metadata: { invoiceId: input.invoiceId, appliedAmountCents: result.appliedAmountCents, newBalanceCents: result.newBalanceCents },
        });
        return result;
      }),
    waiveInvoice: financeProcedure
      .input(z.object({ invoiceId: id }))
      .mutation(async ({ ctx, input }) => {
        await misDb.waiveInvoice(input.invoiceId);
        await misDb.writeAuditEvent({ actorUserId: ctx.user.id, action: "invoice.waived", entityType: "invoice", entityId: String(input.invoiceId), summary: `Waived invoice ${input.invoiceId}.` });
        return { success: true };
      }),
    reconcilePayment: financeProcedure
      .input(z.object({ paymentId: id, status: z.enum(["reconciled", "exception"]) }))
      .mutation(async ({ ctx, input }) => {
        await misDb.reconcilePayment({ ...input, userId: ctx.user.id });
        await misDb.writeAuditEvent({ actorUserId: ctx.user.id, action: `payment.${input.status}`, entityType: "paymentTransaction", entityId: String(input.paymentId), summary: `Marked payment ${input.paymentId} as ${input.status}.` });
        return { success: true };
      }),
    myInvoices: protectedProcedure.query(async ({ ctx }) => {
      const studentId = await misDb.getStudentIdForUser(ctx.user.id);
      if (!studentId) return [];
      return misDb.getStudentInvoices(studentId);
    }),
    myPayments: protectedProcedure.query(async ({ ctx }) => {
      const studentId = await misDb.getStudentIdForUser(ctx.user.id);
      if (!studentId) return [];
      return misDb.listPayments(studentId);
    }),
    simulatePayment: protectedProcedure
      .input(z.object({ invoiceId: id, amountCents: z.number().int().positive().max(100000000) }))
      .mutation(async ({ ctx, input }) => {
        const studentId = await misDb.getStudentIdForUser(ctx.user.id);
        if (!studentId) throw new TRPCError({ code: "FORBIDDEN", message: "Only an account linked to a student record can simulate a student-fee payment." });
        const payment = await misDb.simulateInvoicePayment({ ...input, studentId });
        await misDb.writeAuditEvent({ actorUserId: ctx.user.id, action: "payment.simulated_settlement", entityType: "paymentTransaction", entityId: String(payment.paymentId), summary: `Simulated settled fee payment against invoice ${input.invoiceId}.`, metadata: { amountCents: input.amountCents, gatewayReference: payment.gatewayReference } });
        return payment;
      }),
  }),

  requests: router({
    list: protectedProcedure.query(({ ctx }) => misDb.listStudentRequestsForUser(ctx.user.id, ctx.user.role)),
    create: protectedProcedure
      .input(
        z.object({
          type: z.enum(["document", "registration", "finance", "personal_details", "other"]),
          title: z.string().trim().min(3).max(180),
          detail: optionalText(5000),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const studentId = await misDb.getStudentIdForUser(ctx.user.id);
        if (!studentId) throw new Error("Your account is not linked to a student record.");
        const requestId = await misDb.createStudentRequest({ ...input, studentId });
        await misDb.writeAuditEvent({
          actorUserId: ctx.user.id,
          action: "studentRequest.created",
          entityType: "studentRequest",
          entityId: String(requestId),
          summary: `Submitted ${input.type} request ${input.title}.`,
        });
        return { id: requestId };
      }),
    documents: protectedProcedure
      .input(z.object({ requestId: id }))
      .query(async ({ ctx, input }) => {
        const request = await misDb.getStudentRequest(input.requestId);
        if (!request) throw new TRPCError({ code: "NOT_FOUND", message: "Student request was not found." });
        const studentId = await misDb.getStudentIdForUser(ctx.user.id);
        const canAccess = ctx.user.role === "admin" || ctx.user.role === "registrar" || studentId === request.studentId;
        if (!canAccess) throw new TRPCError({ code: "FORBIDDEN", message: "You cannot access documents for this request." });
        const documents = await misDb.listDocumentsForRequest(input.requestId);
        return Promise.all(documents.map(async document => ({ ...document, url: await storageGetSignedUrl(document.fileKey) })));
      }),
    uploadDocument: protectedProcedure
      .input(z.object({ requestId: id, name: z.string().trim().min(1).max(255), mimeType: z.enum(["application/pdf", "image/jpeg", "image/png"]), contentBase64: z.string().min(1).max(7_000_000), retentionCategory: z.string().trim().min(3).max(100) }))
      .mutation(async ({ ctx, input }) => {
        const request = await misDb.getStudentRequest(input.requestId);
        if (!request) throw new TRPCError({ code: "NOT_FOUND", message: "Student request was not found." });
        const studentId = await misDb.getStudentIdForUser(ctx.user.id);
        const canUpload = ctx.user.role === "admin" || ctx.user.role === "registrar" || studentId === request.studentId;
        if (!canUpload) throw new TRPCError({ code: "FORBIDDEN", message: "You cannot upload documents for this request." });
        const safeName = input.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const bytes = Buffer.from(input.contentBase64, "base64");
        if (bytes.byteLength > 5 * 1024 * 1024) throw new TRPCError({ code: "PAYLOAD_TOO_LARGE", message: "Documents must be 5 MB or smaller." });
        const stored = await storagePut(`student-documents/${request.studentId}/${request.id}/${safeName}`, bytes, input.mimeType);
        const documentId = await misDb.createDocumentMetadata({ studentId: request.studentId, requestId: request.id, name: input.name, fileKey: stored.key, mimeType: input.mimeType, retentionCategory: input.retentionCategory, uploadedByUserId: ctx.user.id });
        await misDb.writeAuditEvent({ actorUserId: ctx.user.id, action: "document.uploaded", entityType: "document", entityId: String(documentId), summary: `Uploaded document ${input.name} for request ${request.id}.`, metadata: { requestId: request.id, retentionCategory: input.retentionCategory } });
        return { id: documentId, url: stored.url };
      }),
    updateStatus: studentServicesProcedure
      .input(z.object({ requestId: id, status: z.enum(["submitted", "in_review", "approved", "rejected", "completed"]) }))
      .mutation(async ({ ctx, input }) => {
        await misDb.updateStudentRequestStatus({ ...input, assigneeUserId: ctx.user.id });
        await misDb.writeAuditEvent({
          actorUserId: ctx.user.id,
          action: "studentRequest.status.updated",
          entityType: "studentRequest",
          entityId: String(input.requestId),
          summary: `Updated request status to ${input.status}.`,
        });
        return { success: true };
      }),
  }),

  governance: router({
    auditLog: administratorProcedure.query(() => misDb.listAuditEvents()),
    users: administratorProcedure.query(() => misDb.listInstitutionalUsers()),
    updateRole: administratorProcedure
      .input(z.object({ userId: id, role: z.enum(["admin", "registrar", "faculty", "student", "finance", "non_teaching", "applicant"]) }))
      .mutation(async ({ ctx, input }) => {
        await misDb.updateInstitutionalUserRole(input.userId, input.role);
        await misDb.writeAuditEvent({
          actorUserId: ctx.user.id,
          action: "role.updated",
          entityType: "user",
          entityId: String(input.userId),
          summary: `Assigned the ${input.role} institutional role.`,
          metadata: { role: input.role },
        });
        return { success: true };
      }),
    staff: administratorProcedure.query(() => misDb.listStaffProfiles()),
    createStaff: administratorProcedure
      .input(z.object({ fullName: z.string().trim().min(2).max(180), email: z.string().trim().email().max(320), staffNumber: z.string().trim().min(3).max(48), staffCategory: z.enum(["teaching", "technical", "finance", "registry", "administration"]), accessRole: z.enum(["faculty", "non_teaching", "finance", "registrar", "admin"]) }))
      .mutation(async ({ ctx, input }) => {
        const staffId = await misDb.createStaffProfile({ ...input, provisionedByUserId: ctx.user.id });
        await misDb.writeAuditEvent({ actorUserId: ctx.user.id, action: "staff.provisioned", entityType: "staffProfile", entityId: String(staffId), summary: `Provisioned ${input.staffCategory} staff record ${input.staffNumber}.`, metadata: { accessRole: input.accessRole, email: input.email } });
        return { id: staffId };
      }),
    prepareStaffInvitation: administratorProcedure
      .input(z.object({ staffProfileId: id }))
      .mutation(async ({ ctx, input }) => {
        const profile = await misDb.prepareStaffInvitation({ staffProfileId: input.staffProfileId, preparedByUserId: ctx.user.id });
        await misDb.writeAuditEvent({ actorUserId: ctx.user.id, action: "staff.invitation_prepared", entityType: "staffProfile", entityId: String(profile.id), summary: `Prepared staff invitation for ${profile.email}.`, metadata: { staffCategory: profile.staffCategory, accessRole: profile.accessRole } });
        return { email: profile.email, fullName: profile.fullName, invitationToken: profile.invitationToken, accessRole: profile.accessRole };
      }),
    simulateStaffInvitationSend: administratorProcedure
      .input(z.object({ staffProfileId: id, outcome: z.enum(["sent", "failed"]) }))
      .mutation(async ({ ctx, input }) => {
        const profile = await misDb.recordStaffInvitationDelivery({ staffProfileId: input.staffProfileId, deliveryStatus: input.outcome, actorUserId: ctx.user.id, failureReason: input.outcome === "failed" ? "Simulated email delivery failure" : undefined });
        await misDb.writeAuditEvent({ actorUserId: ctx.user.id, action: input.outcome === "sent" ? "staff.invitation_simulated_sent" : "staff.invitation_simulated_failed", entityType: "staffProfile", entityId: String(profile.id), summary: `Recorded simulated invitation ${input.outcome} status for ${profile.email}.`, metadata: { staffCategory: profile.staffCategory, accessRole: profile.accessRole } });
        return { success: true };
      }),
  }),

  lms: router({
    accessibleOfferings: protectedProcedure.query(({ ctx }) =>
      lmsDb.listAccessibleOfferingsForUser(ctx.user.id, ctx.user.role),
    ),

    myDashboard: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role === "student" || ctx.user.role === "user") {
        return lmsDb.getLearnerLmsDashboard(ctx.user.id);
      }
      const offerings = await lmsDb.listAccessibleOfferingsForUser(ctx.user.id, ctx.user.role);
      return {
        courses: offerings.map(o => ({
          offeringId: o.id,
          enrollmentId: null,
          courseCode: o.courseCode,
          courseTitle: o.courseTitle,
          section: o.section,
          termName: o.termName,
          modality: o.modality,
          completionPercent: 100,
          completedItems: 0,
          totalItems: 0,
          nextResumeItem: null,
          upcomingCount: 0,
          overdueCount: 0,
          upcomingDeadlines: [],
          overdueItems: [],
          latestAnnouncement: null,
          currentOverallPercent: null,
          currentLetterGrade: null,
        })),
        notifications: [],
        unreadNotificationCount: 0,
        preferences: {
          announcements: true,
          dueDates: true,
          submissions: true,
          grades: true,
          discussions: true,
          messages: true,
        },
      };
    }),

    courseSpace: protectedProcedure
      .input(z.object({ courseOfferingId: id }))
      .query(async ({ ctx, input }) => {
        const access = await lmsDb.checkCourseSpaceAccess(ctx.user.id, ctx.user.role, input.courseOfferingId);
        if (!access.allowed) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "You do not have enrolment or faculty assignment access to this course space.",
          });
        }
        return lmsDb.getCourseSpaceFull(input.courseOfferingId, {
          userId: ctx.user.id,
          role: ctx.user.role,
          enrollmentId: access.enrollmentId,
        });
      }),

    updateCourseSpaceSettings: academicProcedure
      .input(
        z.object({
          courseOfferingId: id,
          overview: z.string().trim().min(5).max(10000),
          learningOutcomes: z.string().trim().min(5).max(10000),
          instructorBio: optionalText(5000),
          officeHours: optionalText(255),
          gradingPolicy: optionalText(5000),
          latePenaltyPercentPerDay: z.number().int().min(0).max(100),
          allowDiscussions: z.boolean(),
          allowPrivateMessages: z.boolean(),
          retentionDays: z.number().int().min(30).max(3650),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        await assertOfferingAccess(ctx.user, input.courseOfferingId);
        await lmsDb.updateCourseSpaceSettings({ ...input, updatedByUserId: ctx.user.id });
        await misDb.writeAuditEvent({
          actorUserId: ctx.user.id,
          action: "lms.courseSpace.updated",
          entityType: "courseOffering",
          entityId: String(input.courseOfferingId),
          summary: `Updated LMS course space settings and policies for offering ${input.courseOfferingId}.`,
        });
        return { success: true };
      }),

    createModule: academicProcedure
      .input(
        z.object({
          courseOfferingId: id,
          title: z.string().trim().min(2).max(180),
          description: optionalText(5000),
          weekNumber: z.number().int().min(1).max(52).optional(),
          status: z.enum(publicationStatusValues),
          publishAt: z.coerce.date().optional(),
          unlockAt: z.coerce.date().optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        await assertOfferingAccess(ctx.user, input.courseOfferingId);
        const moduleId = await lmsDb.createLmsModule({ ...input, createdByUserId: ctx.user.id });
        await misDb.writeAuditEvent({
          actorUserId: ctx.user.id,
          action: "lms.module.created",
          entityType: "lmsModule",
          entityId: String(moduleId),
          summary: `Created LMS module "${input.title}" (${input.status}).`,
        });
        return { id: moduleId };
      }),

    reorderModule: academicProcedure
      .input(z.object({ courseOfferingId: id, moduleId: id, direction: z.enum(["up", "down"]) }))
      .mutation(async ({ ctx, input }) => {
        await assertOfferingAccess(ctx.user, input.courseOfferingId);
        await lmsDb.reorderLmsModule(input);
        return { success: true };
      }),

    createModuleItem: academicProcedure
      .input(
        z.object({
          courseOfferingId: id,
          moduleId: id,
          itemType: z.enum(["page", "file", "link", "video", "assignment", "quiz", "discussion"]),
          title: z.string().trim().min(2).max(180),
          summary: optionalText(2000),
          bodyHtml: optionalText(25000),
          externalUrl: optionalText(1024),
          captionsUrl: optionalText(1024),
          transcriptText: optionalText(25000),
          estimatedMinutes: z.number().int().min(1).max(600).optional(),
          status: z.enum(publicationStatusValues),
          publishAt: z.coerce.date().optional(),
          upload: fileUploadSchema,
        }),
      )
      .mutation(async ({ ctx, input }) => {
        await assertOfferingAccess(ctx.user, input.courseOfferingId);
        let uploaded = null;
        try {
          uploaded = await storeValidatedUpload(`lms-materials/${input.courseOfferingId}`, input.upload);
        } catch (err) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: err instanceof Error ? err.message : "File validation failed.",
          });
        }
        const itemId = await lmsDb.createLmsModuleItem({
          moduleId: input.moduleId,
          courseOfferingId: input.courseOfferingId,
          itemType: input.itemType,
          title: input.title,
          summary: input.summary,
          bodyHtml: input.bodyHtml,
          externalUrl: input.externalUrl,
          fileKey: uploaded?.key,
          fileName: uploaded?.fileName,
          fileMimeType: uploaded?.mimeType,
          fileSizeBytes: uploaded?.sizeBytes,
          captionsUrl: input.captionsUrl,
          transcriptText: input.transcriptText,
          estimatedMinutes: input.estimatedMinutes,
          status: input.status,
          publishAt: input.publishAt,
          createdByUserId: ctx.user.id,
        });
        await misDb.writeAuditEvent({
          actorUserId: ctx.user.id,
          action: "lms.moduleItem.created",
          entityType: "lmsModuleItem",
          entityId: String(itemId),
          summary: `Added ${input.itemType} item "${input.title}" (${input.status}).`,
        });
        return { id: itemId };
      }),

    reorderModuleItem: academicProcedure
      .input(z.object({ courseOfferingId: id, moduleId: id, itemId: id, direction: z.enum(["up", "down"]) }))
      .mutation(async ({ ctx, input }) => {
        await assertOfferingAccess(ctx.user, input.courseOfferingId);
        await lmsDb.reorderLmsModuleItem(input);
        return { success: true };
      }),

    updateContentPublication: academicProcedure
      .input(
        z.object({
          courseOfferingId: id,
          targetType: z.enum(["module", "item"]),
          targetId: id,
          status: z.enum(publicationStatusValues),
          publishAt: z.coerce.date().optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        await assertOfferingAccess(ctx.user, input.courseOfferingId);
        await lmsDb.updateLmsContentPublication(input);
        await misDb.writeAuditEvent({
          actorUserId: ctx.user.id,
          action: `lms.${input.targetType}.publication_updated`,
          entityType: input.targetType === "module" ? "lmsModule" : "lmsModuleItem",
          entityId: String(input.targetId),
          summary: `Changed ${input.targetType} #${input.targetId} state to ${input.status}.`,
        });
        return { success: true };
      }),

    toggleItemCompletion: protectedProcedure
      .input(z.object({ courseOfferingId: id, moduleItemId: id, completed: z.boolean() }))
      .mutation(async ({ ctx, input }) => {
        const access = await lmsDb.checkCourseSpaceAccess(ctx.user.id, ctx.user.role, input.courseOfferingId);
        if (!access.allowed || !access.enrollmentId) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Only enrolled learners can record item completion." });
        }
        await lmsDb.toggleItemCompletion({
          moduleItemId: input.moduleItemId,
          enrollmentId: access.enrollmentId,
          completed: input.completed,
        });
        return { success: true };
      }),

    createAssignment: academicProcedure
      .input(
        z.object({
          courseOfferingId: id,
          moduleId: id.optional(),
          categoryId: id.optional(),
          title: z.string().trim().min(2).max(180),
          description: optionalText(15000),
          dueAt: z.coerce.date().optional(),
          availableFrom: z.coerce.date().optional(),
          lockAt: z.coerce.date().optional(),
          maxScore: z.number().int().min(1).max(1000),
          latePolicy: z.enum(lateSubmissionPolicyValues),
          latePenaltyPercentPerDay: z.number().int().min(0).max(100),
          maxAttempts: z.number().int().min(1).max(20),
          allowResubmission: z.boolean(),
          submissionMode: z.enum(["individual", "group"]),
          allowTextResponse: z.boolean(),
          allowFileUpload: z.boolean(),
          rubric: z
            .array(
              z.object({
                criterion: z.string().trim().min(1).max(180),
                maxPoints: z.number().int().min(1).max(500),
                description: optionalText(500),
              }),
            )
            .optional(),
          status: z.enum(publicationStatusValues),
          publishAt: z.coerce.date().optional(),
          upload: fileUploadSchema,
        }),
      )
      .mutation(async ({ ctx, input }) => {
        await assertOfferingAccess(ctx.user, input.courseOfferingId);
        let uploaded = null;
        try {
          uploaded = await storeValidatedUpload(`lms-assignments/${input.courseOfferingId}`, input.upload);
        } catch (err) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: err instanceof Error ? err.message : "Attachment validation failed.",
          });
        }
        const activityId = await lmsDb.createConfiguredAssignment({
          ...input,
          attachmentKey: uploaded?.key,
          attachmentName: uploaded?.fileName,
          attachmentMimeType: uploaded?.mimeType,
          createdByUserId: ctx.user.id,
        });
        await misDb.writeAuditEvent({
          actorUserId: ctx.user.id,
          action: "lms.assignment.created",
          entityType: "courseActivity",
          entityId: String(activityId),
          summary: `Created configured LMS assignment "${input.title}" (maxScore: ${input.maxScore}, policy: ${input.latePolicy}).`,
        });
        return { id: activityId };
      }),

    grantAssignmentExtension: academicProcedure
      .input(
        z.object({
          courseOfferingId: id,
          activityId: id,
          enrollmentId: id,
          extendedDueAt: z.coerce.date(),
          reason: z.string().trim().min(3).max(500),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        await assertOfferingAccess(ctx.user, input.courseOfferingId);
        const extId = await lmsDb.grantAssignmentExtension({
          activityId: input.activityId,
          enrollmentId: input.enrollmentId,
          extendedDueAt: input.extendedDueAt,
          reason: input.reason,
          grantedByUserId: ctx.user.id,
        });
        await misDb.writeAuditEvent({
          actorUserId: ctx.user.id,
          action: "lms.assignment.extension_granted",
          entityType: "lmsAssignmentExtension",
          entityId: String(extId),
          summary: `Granted deadline extension for assignment #${input.activityId} (enrollment #${input.enrollmentId}) until ${input.extendedDueAt.toISOString()}.`,
          metadata: { reason: input.reason, extendedDueAt: input.extendedDueAt.toISOString() },
        });
        return { id: extId };
      }),

    submitAssignment: protectedProcedure
      .input(
        z.object({
          courseOfferingId: id,
          activityId: id,
          isDraft: z.boolean().default(false),
          groupName: optionalText(120),
          responseText: optionalText(40000),
          upload: fileUploadSchema,
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const access = await lmsDb.checkCourseSpaceAccess(ctx.user.id, ctx.user.role, input.courseOfferingId);
        if (!access.allowed || !access.enrollmentId) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Only learners enrolled in this course offering can submit assignment work.",
          });
        }
        if (!input.responseText && !input.upload) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Provide a text response or attach a supported file before saving or submitting.",
          });
        }
        let uploaded = null;
        try {
          uploaded = await storeValidatedUpload(
            `lms-submissions/${input.courseOfferingId}/${access.enrollmentId}`,
            input.upload,
          );
        } catch (err) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: err instanceof Error ? err.message : "Submission file validation failed.",
          });
        }
        try {
          const receipt = await lmsDb.submitAssignmentVersion({
            activityId: input.activityId,
            enrollmentId: access.enrollmentId,
            isDraft: input.isDraft,
            groupName: input.groupName,
            responseText: input.responseText,
            attachmentKey: uploaded?.key,
            attachmentName: uploaded?.fileName,
            attachmentMimeType: uploaded?.mimeType,
            attachmentSizeBytes: uploaded?.sizeBytes,
          });
          if (!input.isDraft) {
            await misDb.writeAuditEvent({
              actorUserId: ctx.user.id,
              action: "lms.assignment.submitted",
              entityType: "lmsSubmissionVersion",
              entityId: String(receipt.versionId),
              summary: `Learner submitted assignment #${input.activityId} (receipt ${receipt.receiptCode}, attempt #${receipt.attemptNumber}${receipt.isLate ? `, late by ${receipt.daysLate}d` : ""}).`,
              metadata: { receiptCode: receipt.receiptCode, isLate: receipt.isLate, daysLate: receipt.daysLate },
            });
          }
          return receipt;
        } catch (err) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: err instanceof Error ? err.message : "Could not record submission.",
          });
        }
      }),

    gradeAssignment: academicProcedure
      .input(
        z.object({
          courseOfferingId: id,
          activityId: id,
          enrollmentId: id,
          rawScore: z.number().int().min(0).max(1000),
          feedback: optionalText(10000),
          rubricScores: z.record(z.string(), z.number().min(0)).optional(),
          releaseGrade: z.boolean(),
          annotatedUpload: fileUploadSchema,
        }),
      )
      .mutation(async ({ ctx, input }) => {
        await assertOfferingAccess(ctx.user, input.courseOfferingId);
        let annotated = null;
        try {
          annotated = await storeValidatedUpload(
            `lms-annotated-feedback/${input.courseOfferingId}/${input.enrollmentId}`,
            input.annotatedUpload,
          );
        } catch (err) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: err instanceof Error ? err.message : "Annotated feedback file validation failed.",
          });
        }
        const result = await lmsDb.gradeAssignmentSubmissionVersion({
          courseOfferingId: input.courseOfferingId,
          activityId: input.activityId,
          enrollmentId: input.enrollmentId,
          rawScore: input.rawScore,
          feedback: input.feedback,
          rubricScores: input.rubricScores,
          annotatedFileKey: annotated?.key,
          annotatedFileName: annotated?.fileName,
          releaseGrade: input.releaseGrade,
          gradedByUserId: ctx.user.id,
        });
        await misDb.writeAuditEvent({
          actorUserId: ctx.user.id,
          action: input.releaseGrade ? "lms.assignment.grade_released" : "lms.assignment.grade_saved_draft",
          entityType: "activitySubmission",
          entityId: `${input.activityId}:${input.enrollmentId}`,
          summary: `${input.releaseGrade ? "Released" : "Saved draft"} assignment grade (raw: ${input.rawScore}, final: ${result.finalScore}, penalty: -${result.penaltyPoints}).`,
        });
        return result;
      }),

    createQuestion: academicProcedure
      .input(
        z.object({
          courseOfferingId: id,
          topic: z.string().trim().min(2).max(120),
          questionType: z.enum(quizQuestionTypeValues),
          prompt: z.string().trim().min(3).max(5000),
          options: z.array(z.string().trim().min(1).max(500)).default([]),
          correctAnswer: z.union([z.string(), z.array(z.string())]),
          explanation: optionalText(2000),
          defaultPoints: z.number().int().min(1).max(100),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        await assertOfferingAccess(ctx.user, input.courseOfferingId);
        const questionId = await lmsDb.createQuestionBankEntry({
          ...input,
          createdByUserId: ctx.user.id,
        });
        await misDb.writeAuditEvent({
          actorUserId: ctx.user.id,
          action: "lms.questionBank.created",
          entityType: "lmsQuestionBank",
          entityId: String(questionId),
          summary: `Added ${input.questionType} question to topic "${input.topic}".`,
        });
        return { id: questionId };
      }),

    createQuiz: academicProcedure
      .input(
        z.object({
          courseOfferingId: id,
          moduleId: id.optional(),
          categoryId: id.optional(),
          title: z.string().trim().min(2).max(180),
          instructions: optionalText(10000),
          status: z.enum(publicationStatusValues),
          publishAt: z.coerce.date().optional(),
          availableFrom: z.coerce.date().optional(),
          dueAt: z.coerce.date().optional(),
          timeLimitMinutes: z.number().int().min(1).max(360),
          maxAttempts: z.number().int().min(1).max(20),
          passMarkPercent: z.number().int().min(0).max(100),
          randomizeQuestions: z.boolean(),
          randomizeOptions: z.boolean(),
          reviewPolicy: z.enum(quizReviewPolicyValues),
          questionBankIds: z.array(id).min(1, "Select at least one question from the question bank."),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        await assertOfferingAccess(ctx.user, input.courseOfferingId);
        const quizId = await lmsDb.createQuizWithQuestions({
          ...input,
          createdByUserId: ctx.user.id,
        });
        await misDb.writeAuditEvent({
          actorUserId: ctx.user.id,
          action: "lms.quiz.created",
          entityType: "lmsQuiz",
          entityId: String(quizId),
          summary: `Created online quiz "${input.title}" (${input.questionBankIds.length} questions, ${input.timeLimitMinutes} mins).`,
        });
        return { id: quizId };
      }),

    startQuizAttempt: protectedProcedure
      .input(z.object({ courseOfferingId: id, quizId: id }))
      .mutation(async ({ ctx, input }) => {
        const access = await lmsDb.checkCourseSpaceAccess(ctx.user.id, ctx.user.role, input.courseOfferingId);
        if (!access.allowed || !access.enrollmentId) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Only enrolled learners can start or resume a quiz attempt." });
        }
        try {
          return await lmsDb.startOrResumeQuizAttempt({
            quizId: input.quizId,
            enrollmentId: access.enrollmentId,
          });
        } catch (err) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: err instanceof Error ? err.message : "Could not start quiz attempt.",
          });
        }
      }),

    autosaveQuizAttempt: protectedProcedure
      .input(
        z.object({
          courseOfferingId: id,
          attemptId: id,
          answers: z.record(z.string(), z.union([z.string(), z.array(z.string())])),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const access = await lmsDb.checkCourseSpaceAccess(ctx.user.id, ctx.user.role, input.courseOfferingId);
        if (!access.allowed || !access.enrollmentId) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Enrolment required." });
        }
        try {
          return await lmsDb.autosaveQuizAttempt({
            attemptId: input.attemptId,
            enrollmentId: access.enrollmentId,
            answers: input.answers,
          });
        } catch (err) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: err instanceof Error ? err.message : "Could not autosave quiz attempt.",
          });
        }
      }),

    submitQuizAttempt: protectedProcedure
      .input(
        z.object({
          courseOfferingId: id,
          attemptId: id,
          answers: z.record(z.string(), z.union([z.string(), z.array(z.string())])),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const access = await lmsDb.checkCourseSpaceAccess(ctx.user.id, ctx.user.role, input.courseOfferingId);
        if (!access.allowed || !access.enrollmentId) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Enrolment required." });
        }
        try {
          const res = await lmsDb.submitQuizAttempt({
            attemptId: input.attemptId,
            enrollmentId: access.enrollmentId,
            answers: input.answers,
          });
          await misDb.writeAuditEvent({
            actorUserId: ctx.user.id,
            action: "lms.quiz.attempt_submitted",
            entityType: "lmsQuizAttempt",
            entityId: String(res.attemptId),
            summary: `Learner submitted quiz attempt #${res.attemptId} (${res.status}).`,
          });
          return res;
        } catch (err) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: err instanceof Error ? err.message : "Quiz submission rejected.",
          });
        }
      }),

    gradeQuizAttempt: academicProcedure
      .input(
        z.object({
          courseOfferingId: id,
          attemptId: id,
          manualScore: z.number().int().min(0).max(500),
          instructorFeedback: optionalText(5000),
          releaseGrade: z.boolean(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        await assertOfferingAccess(ctx.user, input.courseOfferingId);
        const updated = await lmsDb.gradeQuizAttemptInstructor({
          ...input,
          gradedByUserId: ctx.user.id,
        });
        await misDb.writeAuditEvent({
          actorUserId: ctx.user.id,
          action: "lms.quiz.attempt_graded",
          entityType: "lmsQuizAttempt",
          entityId: String(input.attemptId),
          summary: `Graded quiz attempt #${input.attemptId} (totalScore: ${updated.totalScore}/${updated.maxScore}, released: ${input.releaseGrade}).`,
        });
        return updated;
      }),

    upsertManualGradebookItem: academicProcedure
      .input(
        z.object({
          courseOfferingId: id,
          enrollmentId: id,
          categoryId: id.optional(),
          title: z.string().trim().min(2).max(180),
          score: z.number().int().min(0).max(1000).nullable(),
          maxScore: z.number().int().min(1).max(1000),
          status: z.enum(gradeItemStatusValues),
          feedback: optionalText(5000),
          changeReason: optionalText(500),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        await assertOfferingAccess(ctx.user, input.courseOfferingId);
        try {
          const res = await lmsDb.upsertManualGradebookItem({
            ...input,
            actorUserId: ctx.user.id,
          });
          await misDb.writeAuditEvent({
            actorUserId: ctx.user.id,
            action: res.wasReleased ? "lms.gradebook.released_grade_amended" : "lms.gradebook.item_upserted",
            entityType: "lmsGradebookEntry",
            entityId: `${input.courseOfferingId}:${input.enrollmentId}:${input.title}`,
            summary: `${res.wasReleased ? "Amended released" : "Updated"} gradebook item "${input.title}" (${input.score ?? "—"}/${input.maxScore}, status: ${input.status}).`,
            metadata: {
              previousScore: res.previousScore,
              newScore: input.score,
              changeReason: input.changeReason ?? null,
            },
          });
          return { success: true };
        } catch (err) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: err instanceof Error ? err.message : "Could not update gradebook item.",
          });
        }
      }),

    publishOfficialCourseGrade: academicProcedure
      .input(z.object({ courseOfferingId: id, enrollmentId: id }))
      .mutation(async ({ ctx, input }) => {
        await assertOfferingAccess(ctx.user, input.courseOfferingId);
        try {
          const published = await lmsDb.publishCourseGradeToOfficialRecord({
            courseOfferingId: input.courseOfferingId,
            enrollmentId: input.enrollmentId,
            actorUserId: ctx.user.id,
          });
          await misDb.writeAuditEvent({
            actorUserId: ctx.user.id,
            action: "lms.grade.published_to_official_record",
            entityType: "enrollment",
            entityId: String(input.enrollmentId),
            summary: `Published calculated LMS course grade (${published.score}% / ${published.letterGrade}) to official MIS academic record.`,
            metadata: published,
          });
          return published;
        } catch (err) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: err instanceof Error ? err.message : "Could not publish official grade.",
          });
        }
      }),

    createAnnouncement: academicProcedure
      .input(
        z.object({
          courseOfferingId: id,
          title: z.string().trim().min(3).max(180),
          body: z.string().trim().min(5).max(10000),
          status: z.enum(publicationStatusValues),
          publishAt: z.coerce.date().optional(),
          pinned: z.boolean().default(false),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        await assertOfferingAccess(ctx.user, input.courseOfferingId);
        const announcementId = await lmsDb.createAnnouncement({
          ...input,
          authorUserId: ctx.user.id,
        });
        await misDb.writeAuditEvent({
          actorUserId: ctx.user.id,
          action: "lms.announcement.created",
          entityType: "lmsAnnouncement",
          entityId: String(announcementId),
          summary: `Posted course announcement "${input.title}" (${input.status}).`,
        });
        return { id: announcementId };
      }),

    createDiscussionTopic: protectedProcedure
      .input(
        z.object({
          courseOfferingId: id,
          moduleId: id.optional(),
          title: z.string().trim().min(3).max(180),
          body: z.string().trim().min(5).max(10000),
          pinned: z.boolean().optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const access = await lmsDb.checkCourseSpaceAccess(ctx.user.id, ctx.user.role, input.courseOfferingId);
        if (!access.allowed) throw new TRPCError({ code: "FORBIDDEN" });
        const topicId = await lmsDb.createDiscussionTopic({
          ...input,
          pinned: access.mode === "staff" ? input.pinned : false,
          authorUserId: ctx.user.id,
        });
        return { id: topicId };
      }),

    createDiscussionReply: protectedProcedure
      .input(
        z.object({
          courseOfferingId: id,
          topicId: id,
          body: z.string().trim().min(2).max(10000),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const access = await lmsDb.checkCourseSpaceAccess(ctx.user.id, ctx.user.role, input.courseOfferingId);
        if (!access.allowed) throw new TRPCError({ code: "FORBIDDEN" });
        try {
          const replyId = await lmsDb.createDiscussionReply({
            ...input,
            authorUserId: ctx.user.id,
          });
          return { id: replyId };
        } catch (err) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: err instanceof Error ? err.message : "Could not post reply.",
          });
        }
      }),

    flagDiscussionItem: protectedProcedure
      .input(
        z.object({
          courseOfferingId: id,
          targetType: z.enum(["topic", "reply"]),
          targetId: id,
          reason: z.string().trim().min(3).max(255),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const access = await lmsDb.checkCourseSpaceAccess(ctx.user.id, ctx.user.role, input.courseOfferingId);
        if (!access.allowed) throw new TRPCError({ code: "FORBIDDEN" });
        await lmsDb.moderateDiscussionItem({
          courseOfferingId: input.courseOfferingId,
          targetType: input.targetType,
          targetId: input.targetId,
          moderationStatus: "flagged",
          flagReason: input.reason,
        });
        await misDb.writeAuditEvent({
          actorUserId: ctx.user.id,
          action: "lms.discussion.flagged",
          entityType: input.targetType === "topic" ? "lmsDiscussionTopic" : "lmsDiscussionReply",
          entityId: String(input.targetId),
          summary: `Flagged discussion ${input.targetType} #${input.targetId}: ${input.reason}`,
        });
        return { success: true };
      }),

    moderateDiscussionItem: academicProcedure
      .input(
        z.object({
          courseOfferingId: id,
          targetType: z.enum(["topic", "reply"]),
          targetId: id,
          moderationStatus: z.enum(["active", "flagged", "hidden"]),
          locked: z.boolean().optional(),
          flagReason: optionalText(255),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        await assertOfferingAccess(ctx.user, input.courseOfferingId);
        await lmsDb.moderateDiscussionItem(input);
        await misDb.writeAuditEvent({
          actorUserId: ctx.user.id,
          action: "lms.discussion.moderated",
          entityType: input.targetType === "topic" ? "lmsDiscussionTopic" : "lmsDiscussionReply",
          entityId: String(input.targetId),
          summary: `Moderated discussion ${input.targetType} #${input.targetId} -> ${input.moderationStatus}${input.locked !== undefined ? ` (locked: ${input.locked})` : ""}.`,
        });
        return { success: true };
      }),

    sendCourseMessage: protectedProcedure
      .input(
        z.object({
          courseOfferingId: id,
          recipientUserId: id,
          subject: z.string().trim().min(2).max(180),
          body: z.string().trim().min(2).max(10000),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const access = await lmsDb.checkCourseSpaceAccess(ctx.user.id, ctx.user.role, input.courseOfferingId);
        if (!access.allowed) throw new TRPCError({ code: "FORBIDDEN" });
        const messageId = await lmsDb.sendCourseMessage({
          ...input,
          senderUserId: ctx.user.id,
        });
        return { id: messageId };
      }),

    markNotificationRead: protectedProcedure
      .input(z.object({ notificationId: id }))
      .mutation(async ({ ctx, input }) => {
        await lmsDb.markNotificationRead({ notificationId: input.notificationId, userId: ctx.user.id });
        return { success: true };
      }),

    updateNotificationPreferences: protectedProcedure
      .input(
        z.object({
          announcements: z.boolean(),
          dueDates: z.boolean(),
          submissions: z.boolean(),
          grades: z.boolean(),
          discussions: z.boolean(),
          messages: z.boolean(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        await lmsDb.updateNotificationPreferences({ userId: ctx.user.id, ...input });
        return { success: true };
      }),

    previewCourseCopy: academicProcedure
      .input(z.object({ sourceOfferingId: id, targetOfferingId: id }))
      .query(async ({ ctx, input }) => {
        await assertOfferingAccess(ctx.user, input.sourceOfferingId);
        await assertOfferingAccess(ctx.user, input.targetOfferingId);
        return lmsDb.previewCourseCopy(input);
      }),

    executeCourseCopy: academicProcedure
      .input(z.object({ sourceOfferingId: id, targetOfferingId: id }))
      .mutation(async ({ ctx, input }) => {
        await assertOfferingAccess(ctx.user, input.sourceOfferingId);
        await assertOfferingAccess(ctx.user, input.targetOfferingId);
        const copied = await lmsDb.executeCourseCopy({
          ...input,
          actorUserId: ctx.user.id,
        });
        await misDb.writeAuditEvent({
          actorUserId: ctx.user.id,
          action: "lms.course.copied",
          entityType: "courseOffering",
          entityId: String(input.targetOfferingId),
          summary: `Copied LMS course structure from offering #${input.sourceOfferingId} to #${input.targetOfferingId} (${copied.modulesCount} modules, ${copied.quizzesCount} quizzes; private learner data excluded).`,
          metadata: copied,
        });
        return copied;
      }),

    adminOperationalReport: administratorProcedure
      .input(z.object({ courseOfferingId: id.optional() }).optional())
      .query(({ input }) => lmsDb.getAdminLmsOperationalReport(input?.courseOfferingId)),

    exportAdminReportCsv: administratorProcedure
      .input(z.object({ courseOfferingId: id.optional() }).optional())
      .mutation(async ({ ctx, input }) => {
        const csv = await lmsDb.exportAdminLmsReportCsv(input?.courseOfferingId);
        await misDb.writeAuditEvent({
          actorUserId: ctx.user.id,
          action: "lms.report.csv_exported",
          entityType: "courseOffering",
          entityId: input?.courseOfferingId ? String(input.courseOfferingId) : "all",
          summary: `Exported LMS operational participation and assessment CSV report.`,
        });
        return {
          filename: `lms-operational-report-${new Date().toISOString().slice(0, 10)}.csv`,
          csv,
        };
      }),

    seedDemoCourse: protectedProcedure.mutation(async ({ ctx }) => {
      if (!localAuthEnabled()) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Sample course provisioning is only available in local/demo environments.",
        });
      }
      const seeded = await lmsDb.seedLocalDemoCourse(ctx.user.id);
      await misDb.writeAuditEvent({
        actorUserId: ctx.user.id,
        action: "lms.demo_course.provisioned",
        entityType: "courseOffering",
        entityId: String(seeded.offeringId),
        summary: `Provisioned integrated MIS+LMS sample course ${seeded.courseCode} (Offering #${seeded.offeringId}).`,
      });
      return seeded;
    }),
  }),
});

export type AppRouter = typeof appRouter;
