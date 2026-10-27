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
import { COOKIE_NAME } from "./../shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { storageGetSignedUrl, storagePut } from "./storage";
import { getOrCreateLocalUser } from "./db";
import { createSessionToken } from "./_core/sessions";
import { localAuthEnabled } from "./localAuth";

const id = z.number().int().positive();
const optionalText = (limit: number) => z.string().trim().max(limit).optional().transform(value => value || undefined);

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
});

export type AppRouter = typeof appRouter;
