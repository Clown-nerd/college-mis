import {
  boolean,
  index,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";

export const userRoleValues = [
  "user",
  "applicant",
  "admin",
  "registrar",
  "faculty",
  "student",
  "finance",
  "non_teaching",
] as const;

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", userRoleValues).default("applicant").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const departments = mysqlTable(
  "departments",
  {
    id: int("id").autoincrement().primaryKey(),
    code: varchar("code", { length: 24 }).notNull(),
    name: varchar("name", { length: 180 }).notNull(),
    active: boolean("active").default(true).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [uniqueIndex("departments_code_unique").on(table.code)],
);

export const programmes = mysqlTable(
  "programmes",
  {
    id: int("id").autoincrement().primaryKey(),
    departmentId: int("departmentId")
      .notNull()
      .references(() => departments.id),
    code: varchar("code", { length: 32 }).notNull(),
    name: varchar("name", { length: 180 }).notNull(),
    awardType: mysqlEnum("awardType", ["certificate", "diploma", "degree", "postgraduate"]).notNull(),
    durationTerms: int("durationTerms").notNull(),
    active: boolean("active").default(true).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    uniqueIndex("programmes_code_unique").on(table.code),
    index("programmes_department_idx").on(table.departmentId),
  ],
);

export const academicTerms = mysqlTable(
  "academicTerms",
  {
    id: int("id").autoincrement().primaryKey(),
    code: varchar("code", { length: 32 }).notNull(),
    name: varchar("name", { length: 120 }).notNull(),
    startsAt: timestamp("startsAt").notNull(),
    endsAt: timestamp("endsAt").notNull(),
    status: mysqlEnum("status", ["planned", "active", "closed"]).default("planned").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [uniqueIndex("academic_terms_code_unique").on(table.code)],
);

export const courses = mysqlTable(
  "courses",
  {
    id: int("id").autoincrement().primaryKey(),
    departmentId: int("departmentId")
      .notNull()
      .references(() => departments.id),
    code: varchar("code", { length: 32 }).notNull(),
    title: varchar("title", { length: 180 }).notNull(),
    description: text("description"),
    credits: int("credits").notNull(),
    level: int("level").notNull(),
    active: boolean("active").default(true).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    uniqueIndex("courses_code_unique").on(table.code),
    index("courses_department_idx").on(table.departmentId),
  ],
);

export const coursePrerequisites = mysqlTable(
  "coursePrerequisites",
  {
    id: int("id").autoincrement().primaryKey(),
    courseId: int("courseId")
      .notNull()
      .references(() => courses.id),
    prerequisiteCourseId: int("prerequisiteCourseId")
      .notNull()
      .references(() => courses.id),
  },
  table => [
    uniqueIndex("course_prerequisites_pair_unique").on(table.courseId, table.prerequisiteCourseId),
    index("course_prerequisites_course_idx").on(table.courseId),
  ],
);

export const courseOfferings = mysqlTable(
  "courseOfferings",
  {
    id: int("id").autoincrement().primaryKey(),
    courseId: int("courseId")
      .notNull()
      .references(() => courses.id),
    termId: int("termId")
      .notNull()
      .references(() => academicTerms.id),
    section: varchar("section", { length: 16 }).notNull(),
    modality: mysqlEnum("modality", ["in_person", "online", "hybrid"]).default("in_person").notNull(),
    meetingPattern: varchar("meetingPattern", { length: 120 }),
    room: varchar("room", { length: 80 }),
    capacity: int("capacity").notNull(),
    status: mysqlEnum("status", ["draft", "open", "closed", "cancelled"]).default("draft").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    uniqueIndex("course_offerings_section_unique").on(table.courseId, table.termId, table.section),
    index("course_offerings_term_idx").on(table.termId),
  ],
);

export const classMeetings = mysqlTable(
  "classMeetings",
  {
    id: int("id").autoincrement().primaryKey(),
    courseOfferingId: int("courseOfferingId")
      .notNull()
      .references(() => courseOfferings.id),
    weekday: mysqlEnum("weekday", ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]).notNull(),
    startsAt: varchar("startsAt", { length: 5 }).notNull(),
    endsAt: varchar("endsAt", { length: 5 }).notNull(),
    room: varchar("room", { length: 80 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [
    uniqueIndex("class_meetings_unique").on(table.courseOfferingId, table.weekday, table.startsAt),
    index("class_meetings_offering_idx").on(table.courseOfferingId),
  ],
);

export const students = mysqlTable(
  "students",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").references(() => users.id),
    studentNumber: varchar("studentNumber", { length: 40 }).notNull(),
    legalFirstName: varchar("legalFirstName", { length: 100 }).notNull(),
    legalLastName: varchar("legalLastName", { length: 100 }).notNull(),
    preferredName: varchar("preferredName", { length: 100 }),
    institutionalEmail: varchar("institutionalEmail", { length: 320 }),
    phone: varchar("phone", { length: 40 }),
    emergencyContactName: varchar("emergencyContactName", { length: 180 }),
    emergencyContactPhone: varchar("emergencyContactPhone", { length: 40 }),
    programmeId: int("programmeId").references(() => programmes.id),
    admissionTermId: int("admissionTermId").references(() => academicTerms.id),
    status: mysqlEnum("status", ["applicant", "active", "leave", "graduated", "withdrawn"]).default("applicant").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    uniqueIndex("students_user_unique").on(table.userId),
    uniqueIndex("students_number_unique").on(table.studentNumber),
    index("students_programme_idx").on(table.programmeId),
    index("students_status_idx").on(table.status),
  ],
);

export const studentProgrammeHistory = mysqlTable(
  "studentProgrammeHistory",
  {
    id: int("id").autoincrement().primaryKey(),
    studentId: int("studentId")
      .notNull()
      .references(() => students.id),
    programmeId: int("programmeId")
      .notNull()
      .references(() => programmes.id),
    startedTermId: int("startedTermId").references(() => academicTerms.id),
    endedTermId: int("endedTermId").references(() => academicTerms.id),
    status: mysqlEnum("status", ["active", "completed", "transferred", "withdrawn"]).default("active").notNull(),
    recordedByUserId: int("recordedByUserId").references(() => users.id),
    recordedAt: timestamp("recordedAt").defaultNow().notNull(),
  },
  table => [index("student_programme_history_student_idx").on(table.studentId)],
);

export const enrollments = mysqlTable(
  "enrollments",
  {
    id: int("id").autoincrement().primaryKey(),
    studentId: int("studentId")
      .notNull()
      .references(() => students.id),
    courseOfferingId: int("courseOfferingId")
      .notNull()
      .references(() => courseOfferings.id),
    status: mysqlEnum("status", ["registered", "dropped", "withdrawn", "completed"]).default("registered").notNull(),
    registeredAt: timestamp("registeredAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    uniqueIndex("enrollments_student_offering_unique").on(table.studentId, table.courseOfferingId),
    index("enrollments_offering_idx").on(table.courseOfferingId),
  ],
);

export const facultyAssignments = mysqlTable(
  "facultyAssignments",
  {
    id: int("id").autoincrement().primaryKey(),
    courseOfferingId: int("courseOfferingId")
      .notNull()
      .references(() => courseOfferings.id),
    facultyUserId: int("facultyUserId")
      .notNull()
      .references(() => users.id),
    assignmentRole: mysqlEnum("assignmentRole", ["instructor", "coordinator"]).default("instructor").notNull(),
    assignedAt: timestamp("assignedAt").defaultNow().notNull(),
  },
  table => [
    uniqueIndex("faculty_assignments_unique").on(table.courseOfferingId, table.facultyUserId),
    index("faculty_assignments_user_idx").on(table.facultyUserId),
  ],
);

export const attendanceRecords = mysqlTable(
  "attendanceRecords",
  {
    id: int("id").autoincrement().primaryKey(),
    enrollmentId: int("enrollmentId")
      .notNull()
      .references(() => enrollments.id),
    classDate: varchar("classDate", { length: 10 }).notNull(),
    status: mysqlEnum("status", ["present", "late", "absent", "excused"]).notNull(),
    capturedByUserId: int("capturedByUserId")
      .notNull()
      .references(() => users.id),
    capturedAt: timestamp("capturedAt").defaultNow().notNull(),
  },
  table => [
    uniqueIndex("attendance_enrollment_date_unique").on(table.enrollmentId, table.classDate),
    index("attendance_class_date_idx").on(table.classDate),
  ],
);

export const gradeRecords = mysqlTable(
  "gradeRecords",
  {
    id: int("id").autoincrement().primaryKey(),
    enrollmentId: int("enrollmentId")
      .notNull()
      .references(() => enrollments.id),
    score: int("score").notNull(),
    letterGrade: varchar("letterGrade", { length: 4 }).notNull(),
    gradePointsTimes100: int("gradePointsTimes100").notNull(),
    status: mysqlEnum("status", ["draft", "published"]).default("draft").notNull(),
    enteredByUserId: int("enteredByUserId")
      .notNull()
      .references(() => users.id),
    enteredAt: timestamp("enteredAt").defaultNow().notNull(),
    publishedAt: timestamp("publishedAt"),
  },
  table => [uniqueIndex("grade_records_enrollment_unique").on(table.enrollmentId)],
);

export const courseActivities = mysqlTable(
  "courseActivities",
  {
    id: int("id").autoincrement().primaryKey(),
    courseOfferingId: int("courseOfferingId").notNull().references(() => courseOfferings.id),
    type: mysqlEnum("type", ["assessment", "assignment", "note"]).notNull(),
    title: varchar("title", { length: 180 }).notNull(),
    description: text("description"),
    dueAt: timestamp("dueAt"),
    maxScore: int("maxScore"),
    published: boolean("published").default(true).notNull(),
    createdByUserId: int("createdByUserId").notNull().references(() => users.id),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [index("course_activities_offering_idx").on(table.courseOfferingId), index("course_activities_type_idx").on(table.type)],
);

export const activitySubmissions = mysqlTable(
  "activitySubmissions",
  {
    id: int("id").autoincrement().primaryKey(),
    activityId: int("activityId").notNull().references(() => courseActivities.id),
    enrollmentId: int("enrollmentId").notNull().references(() => enrollments.id),
    response: text("response"),
    score: int("score"),
    feedback: text("feedback"),
    status: mysqlEnum("status", ["submitted", "graded"]).default("submitted").notNull(),
    submittedAt: timestamp("submittedAt").defaultNow().notNull(),
    gradedAt: timestamp("gradedAt"),
    gradedByUserId: int("gradedByUserId").references(() => users.id),
  },
  table => [uniqueIndex("activity_submissions_activity_enrollment_unique").on(table.activityId, table.enrollmentId), index("activity_submissions_enrollment_idx").on(table.enrollmentId)],
);

export const invoices = mysqlTable(
  "invoices",
  {
    id: int("id").autoincrement().primaryKey(),
    studentId: int("studentId")
      .notNull()
      .references(() => students.id),
    termId: int("termId").references(() => academicTerms.id),
    invoiceNumber: varchar("invoiceNumber", { length: 48 }).notNull(),
    amountCents: int("amountCents").notNull(),
    balanceCents: int("balanceCents").notNull(),
    dueAt: timestamp("dueAt"),
    status: mysqlEnum("status", ["draft", "issued", "part_paid", "paid", "waived", "overdue"]).default("draft").notNull(),
    createdByUserId: int("createdByUserId").references(() => users.id),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    uniqueIndex("invoices_number_unique").on(table.invoiceNumber),
    index("invoices_student_idx").on(table.studentId),
  ],
);

export const scholarships = mysqlTable(
  "scholarships",
  {
    id: int("id").autoincrement().primaryKey(),
    studentId: int("studentId")
      .notNull()
      .references(() => students.id),
    termId: int("termId").references(() => academicTerms.id),
    name: varchar("name", { length: 180 }).notNull(),
    amountCents: int("amountCents").notNull(),
    status: mysqlEnum("status", ["pending", "approved", "applied", "cancelled"]).default("pending").notNull(),
    approvedByUserId: int("approvedByUserId").references(() => users.id),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [index("scholarships_student_idx").on(table.studentId)],
);

export const paymentTransactions = mysqlTable(
  "paymentTransactions",
  {
    id: int("id").autoincrement().primaryKey(),
    invoiceId: int("invoiceId")
      .notNull()
      .references(() => invoices.id),
    studentId: int("studentId")
      .notNull()
      .references(() => students.id),
    amountCents: int("amountCents").notNull(),
    currency: varchar("currency", { length: 3 }).default("USD").notNull(),
    gateway: mysqlEnum("gateway", ["simulated"]).default("simulated").notNull(),
    gatewayReference: varchar("gatewayReference", { length: 64 }).notNull(),
    gatewayStatus: mysqlEnum("gatewayStatus", ["initiated", "authorised", "settled", "failed"]).default("initiated").notNull(),
    reconciliationStatus: mysqlEnum("reconciliationStatus", ["pending", "reconciled", "exception"]).default("pending").notNull(),
    paidAt: timestamp("paidAt"),
    reconciledAt: timestamp("reconciledAt"),
    reconciledByUserId: int("reconciledByUserId").references(() => users.id),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    uniqueIndex("payment_transactions_gateway_reference_unique").on(table.gatewayReference),
    index("payment_transactions_invoice_idx").on(table.invoiceId),
    index("payment_transactions_student_idx").on(table.studentId),
    index("payment_transactions_reconciliation_idx").on(table.reconciliationStatus),
  ],
);

export const applicants = mysqlTable(
  "applicants",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").references(() => users.id),
    applicantNumber: varchar("applicantNumber", { length: 40 }).notNull(),
    firstName: varchar("firstName", { length: 100 }).notNull(),
    lastName: varchar("lastName", { length: 100 }).notNull(),
    email: varchar("email", { length: 320 }).notNull(),
    phone: varchar("phone", { length: 40 }),
    programmeId: int("programmeId").references(() => programmes.id),
    intakeTermId: int("intakeTermId").references(() => academicTerms.id),
    status: mysqlEnum("status", ["inquiry", "submitted", "under_review", "admitted", "declined", "converted"]).default("inquiry").notNull(),
    applicationFeeStatus: mysqlEnum("applicationFeeStatus", ["not_required", "pending", "settled", "waived"]).default("pending").notNull(),
    detailsVerifiedAt: timestamp("detailsVerifiedAt"),
    detailsVerifiedByUserId: int("detailsVerifiedByUserId").references(() => users.id),
    decisionAt: timestamp("decisionAt"),
    decidedByUserId: int("decidedByUserId").references(() => users.id),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    uniqueIndex("applicants_number_unique").on(table.applicantNumber),
    uniqueIndex("applicants_user_unique").on(table.userId),
    index("applicants_status_idx").on(table.status),
  ],
);

export const applicantPayments = mysqlTable(
  "applicantPayments",
  {
    id: int("id").autoincrement().primaryKey(),
    applicantId: int("applicantId").notNull().references(() => applicants.id),
    amountCents: int("amountCents").notNull(),
    currency: varchar("currency", { length: 3 }).default("USD").notNull(),
    gatewayReference: varchar("gatewayReference", { length: 64 }).notNull(),
    gatewayStatus: mysqlEnum("gatewayStatus", ["initiated", "settled", "failed"]).default("initiated").notNull(),
    reviewedAt: timestamp("reviewedAt"),
    reviewedByUserId: int("reviewedByUserId").references(() => users.id),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [
    uniqueIndex("applicant_payments_gateway_reference_unique").on(table.gatewayReference),
    index("applicant_payments_applicant_idx").on(table.applicantId),
  ],
);

export const staffProfiles = mysqlTable(
  "staffProfiles",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").references(() => users.id),
    fullName: varchar("fullName", { length: 180 }).notNull(),
    email: varchar("email", { length: 320 }).notNull(),
    staffNumber: varchar("staffNumber", { length: 48 }).notNull(),
    staffCategory: mysqlEnum("staffCategory", ["teaching", "technical", "finance", "registry", "administration"]).notNull(),
    accessRole: mysqlEnum("accessRole", ["faculty", "non_teaching", "finance", "registrar", "admin"]).notNull(),
    status: mysqlEnum("status", ["invited", "active", "inactive"]).default("invited").notNull(),
    invitationToken: varchar("invitationToken", { length: 64 }).notNull(),
    invitationPreparedAt: timestamp("invitationPreparedAt"),
    invitationPreparedByUserId: int("invitationPreparedByUserId").references(() => users.id),
    invitationDeliveryStatus: mysqlEnum("invitationDeliveryStatus", ["not_sent", "drafted", "sent", "failed"]).default("not_sent").notNull(),
    invitationSentAt: timestamp("invitationSentAt"),
    invitationFailureReason: varchar("invitationFailureReason", { length: 255 }),
    provisionedByUserId: int("provisionedByUserId").notNull().references(() => users.id),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    uniqueIndex("staff_profiles_email_unique").on(table.email),
    uniqueIndex("staff_profiles_number_unique").on(table.staffNumber),
    uniqueIndex("staff_profiles_user_unique").on(table.userId),
    uniqueIndex("staff_profiles_invitation_token_unique").on(table.invitationToken),
    index("staff_profiles_category_idx").on(table.staffCategory),
  ],
);

export const studentRequests = mysqlTable(
  "studentRequests",
  {
    id: int("id").autoincrement().primaryKey(),
    studentId: int("studentId")
      .notNull()
      .references(() => students.id),
    type: mysqlEnum("type", ["document", "registration", "finance", "personal_details", "other"]).notNull(),
    title: varchar("title", { length: 180 }).notNull(),
    detail: text("detail"),
    status: mysqlEnum("status", ["submitted", "in_review", "approved", "rejected", "completed"]).default("submitted").notNull(),
    assigneeUserId: int("assigneeUserId").references(() => users.id),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    index("student_requests_student_idx").on(table.studentId),
    index("student_requests_status_idx").on(table.status),
  ],
);

export const documents = mysqlTable(
  "documents",
  {
    id: int("id").autoincrement().primaryKey(),
    studentId: int("studentId").references(() => students.id),
    requestId: int("requestId").references(() => studentRequests.id),
    name: varchar("name", { length: 255 }).notNull(),
    fileKey: varchar("fileKey", { length: 512 }).notNull(),
    mimeType: varchar("mimeType", { length: 120 }).notNull(),
    retentionCategory: varchar("retentionCategory", { length: 100 }).notNull(),
    uploadedByUserId: int("uploadedByUserId")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [
    index("documents_student_idx").on(table.studentId),
    index("documents_request_idx").on(table.requestId),
  ],
);

export const auditEvents = mysqlTable(
  "auditEvents",
  {
    id: int("id").autoincrement().primaryKey(),
    actorUserId: int("actorUserId").references(() => users.id),
    action: varchar("action", { length: 120 }).notNull(),
    entityType: varchar("entityType", { length: 80 }).notNull(),
    entityId: varchar("entityId", { length: 80 }),
    summary: varchar("summary", { length: 500 }).notNull(),
    metadata: json("metadata"),
    occurredAt: timestamp("occurredAt").defaultNow().notNull(),
  },
  table => [
    index("audit_events_actor_idx").on(table.actorUserId),
    index("audit_events_entity_idx").on(table.entityType, table.entityId),
    index("audit_events_occurred_idx").on(table.occurredAt),
  ],
);

export const lmsPublicationStatusValues = ["draft", "published", "scheduled", "archived"] as const;
export const lmsLatePolicyValues = ["accept_with_penalty", "accept_no_penalty", "reject_after_due"] as const;
export const lmsQuestionTypeValues = ["multiple_choice", "multiple_select", "true_false", "short_answer", "essay"] as const;
export const lmsQuizReviewPolicyValues = ["immediate", "after_due", "after_release", "never"] as const;
export const lmsGradeStatusValues = ["missing", "submitted", "exempt", "draft_grade", "released"] as const;

export const lmsCourseSpaces = mysqlTable(
  "lmsCourseSpaces",
  {
    id: int("id").autoincrement().primaryKey(),
    courseOfferingId: int("courseOfferingId")
      .notNull()
      .references(() => courseOfferings.id),
    overview: text("overview"),
    learningOutcomes: text("learningOutcomes"),
    instructorBio: text("instructorBio"),
    officeHours: varchar("officeHours", { length: 240 }),
    gradingPolicy: text("gradingPolicy"),
    latePenaltyPercentPerDay: int("latePenaltyPercentPerDay").default(10).notNull(),
    allowDiscussions: boolean("allowDiscussions").default(true).notNull(),
    allowPrivateMessages: boolean("allowPrivateMessages").default(true).notNull(),
    proctoringNoticeAcknowledged: boolean("proctoringNoticeAcknowledged").default(true).notNull(),
    retentionDays: int("retentionDays").default(365).notNull(),
    updatedByUserId: int("updatedByUserId").references(() => users.id),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [uniqueIndex("lms_course_spaces_offering_unique").on(table.courseOfferingId)],
);

export const lmsModules = mysqlTable(
  "lmsModules",
  {
    id: int("id").autoincrement().primaryKey(),
    courseOfferingId: int("courseOfferingId")
      .notNull()
      .references(() => courseOfferings.id),
    title: varchar("title", { length: 180 }).notNull(),
    description: text("description"),
    weekNumber: int("weekNumber"),
    position: int("position").default(1).notNull(),
    status: mysqlEnum("status", lmsPublicationStatusValues).default("published").notNull(),
    publishAt: timestamp("publishAt"),
    unlockAt: timestamp("unlockAt"),
    createdByUserId: int("createdByUserId")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    index("lms_modules_offering_pos_idx").on(table.courseOfferingId, table.position),
    index("lms_modules_status_idx").on(table.status),
  ],
);

export const lmsModuleItems = mysqlTable(
  "lmsModuleItems",
  {
    id: int("id").autoincrement().primaryKey(),
    moduleId: int("moduleId")
      .notNull()
      .references(() => lmsModules.id),
    courseOfferingId: int("courseOfferingId")
      .notNull()
      .references(() => courseOfferings.id),
    itemType: mysqlEnum("itemType", ["page", "file", "link", "video", "assignment", "quiz", "discussion"]).notNull(),
    title: varchar("title", { length: 180 }).notNull(),
    summary: varchar("summary", { length: 500 }),
    bodyHtml: text("bodyHtml"),
    externalUrl: varchar("externalUrl", { length: 1024 }),
    fileKey: varchar("fileKey", { length: 512 }),
    fileName: varchar("fileName", { length: 255 }),
    fileMimeType: varchar("fileMimeType", { length: 120 }),
    fileSizeBytes: int("fileSizeBytes"),
    captionsUrl: varchar("captionsUrl", { length: 1024 }),
    transcriptText: text("transcriptText"),
    linkedActivityId: int("linkedActivityId").references(() => courseActivities.id),
    linkedQuizId: int("linkedQuizId"),
    position: int("position").default(1).notNull(),
    estimatedMinutes: int("estimatedMinutes").default(20).notNull(),
    status: mysqlEnum("status", lmsPublicationStatusValues).default("published").notNull(),
    publishAt: timestamp("publishAt"),
    createdByUserId: int("createdByUserId")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    index("lms_module_items_module_pos_idx").on(table.moduleId, table.position),
    index("lms_module_items_offering_idx").on(table.courseOfferingId),
  ],
);

export const lmsItemCompletions = mysqlTable(
  "lmsItemCompletions",
  {
    id: int("id").autoincrement().primaryKey(),
    moduleItemId: int("moduleItemId")
      .notNull()
      .references(() => lmsModuleItems.id),
    enrollmentId: int("enrollmentId")
      .notNull()
      .references(() => enrollments.id),
    completedAt: timestamp("completedAt").defaultNow().notNull(),
  },
  table => [
    uniqueIndex("lms_item_completions_unique").on(table.moduleItemId, table.enrollmentId),
    index("lms_item_completions_enrollment_idx").on(table.enrollmentId),
  ],
);

export const lmsGradeCategories = mysqlTable(
  "lmsGradeCategories",
  {
    id: int("id").autoincrement().primaryKey(),
    courseOfferingId: int("courseOfferingId")
      .notNull()
      .references(() => courseOfferings.id),
    name: varchar("name", { length: 120 }).notNull(),
    weightPercent: int("weightPercent").notNull(),
    position: int("position").default(1).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [index("lms_grade_categories_offering_idx").on(table.courseOfferingId)],
);

export const lmsAssignmentConfigs = mysqlTable(
  "lmsAssignmentConfigs",
  {
    id: int("id").autoincrement().primaryKey(),
    activityId: int("activityId")
      .notNull()
      .references(() => courseActivities.id),
    courseOfferingId: int("courseOfferingId")
      .notNull()
      .references(() => courseOfferings.id),
    moduleId: int("moduleId").references(() => lmsModules.id),
    categoryId: int("categoryId").references(() => lmsGradeCategories.id),
    availableFrom: timestamp("availableFrom"),
    lockAt: timestamp("lockAt"),
    latePolicy: mysqlEnum("latePolicy", lmsLatePolicyValues).default("accept_with_penalty").notNull(),
    latePenaltyPercentPerDay: int("latePenaltyPercentPerDay").default(10).notNull(),
    maxAttempts: int("maxAttempts").default(3).notNull(),
    allowResubmission: boolean("allowResubmission").default(true).notNull(),
    submissionMode: mysqlEnum("submissionMode", ["individual", "group"]).default("individual").notNull(),
    allowTextResponse: boolean("allowTextResponse").default(true).notNull(),
    allowFileUpload: boolean("allowFileUpload").default(true).notNull(),
    rubricJson: json("rubricJson"),
    attachmentKey: varchar("attachmentKey", { length: 512 }),
    attachmentName: varchar("attachmentName", { length: 255 }),
    attachmentMimeType: varchar("attachmentMimeType", { length: 120 }),
    status: mysqlEnum("status", lmsPublicationStatusValues).default("published").notNull(),
    publishAt: timestamp("publishAt"),
    gradesReleased: boolean("gradesReleased").default(false).notNull(),
    gradesReleasedAt: timestamp("gradesReleasedAt"),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    uniqueIndex("lms_assignment_configs_activity_unique").on(table.activityId),
    index("lms_assignment_configs_offering_idx").on(table.courseOfferingId),
  ],
);

export const lmsAssignmentExtensions = mysqlTable(
  "lmsAssignmentExtensions",
  {
    id: int("id").autoincrement().primaryKey(),
    activityId: int("activityId")
      .notNull()
      .references(() => courseActivities.id),
    enrollmentId: int("enrollmentId")
      .notNull()
      .references(() => enrollments.id),
    extendedDueAt: timestamp("extendedDueAt").notNull(),
    reason: varchar("reason", { length: 500 }).notNull(),
    grantedByUserId: int("grantedByUserId")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [
    uniqueIndex("lms_assignment_extensions_unique").on(table.activityId, table.enrollmentId),
    index("lms_assignment_extensions_enrollment_idx").on(table.enrollmentId),
  ],
);

export const lmsSubmissionVersions = mysqlTable(
  "lmsSubmissionVersions",
  {
    id: int("id").autoincrement().primaryKey(),
    activityId: int("activityId")
      .notNull()
      .references(() => courseActivities.id),
    enrollmentId: int("enrollmentId")
      .notNull()
      .references(() => enrollments.id),
    attemptNumber: int("attemptNumber").default(1).notNull(),
    isDraft: boolean("isDraft").default(false).notNull(),
    groupName: varchar("groupName", { length: 120 }),
    responseText: text("responseText"),
    attachmentKey: varchar("attachmentKey", { length: 512 }),
    attachmentName: varchar("attachmentName", { length: 255 }),
    attachmentMimeType: varchar("attachmentMimeType", { length: 120 }),
    attachmentSizeBytes: int("attachmentSizeBytes"),
    receiptCode: varchar("receiptCode", { length: 48 }).notNull(),
    isLate: boolean("isLate").default(false).notNull(),
    daysLate: int("daysLate").default(0).notNull(),
    submittedAt: timestamp("submittedAt").defaultNow().notNull(),
    rawScore: int("rawScore"),
    latePenaltyPoints: int("latePenaltyPoints").default(0).notNull(),
    finalScore: int("finalScore"),
    rubricScoresJson: json("rubricScoresJson"),
    feedback: text("feedback"),
    annotatedFileKey: varchar("annotatedFileKey", { length: 512 }),
    annotatedFileName: varchar("annotatedFileName", { length: 255 }),
    gradeStatus: mysqlEnum("gradeStatus", ["draft", "released"]).default("draft").notNull(),
    releasedAt: timestamp("releasedAt"),
    gradedByUserId: int("gradedByUserId").references(() => users.id),
    gradedAt: timestamp("gradedAt"),
  },
  table => [
    index("lms_sub_versions_activity_enrollment_idx").on(table.activityId, table.enrollmentId),
    uniqueIndex("lms_sub_versions_receipt_unique").on(table.receiptCode),
  ],
);

export const lmsQuestionBank = mysqlTable(
  "lmsQuestionBank",
  {
    id: int("id").autoincrement().primaryKey(),
    courseId: int("courseId").references(() => courses.id),
    courseOfferingId: int("courseOfferingId")
      .notNull()
      .references(() => courseOfferings.id),
    topic: varchar("topic", { length: 120 }).notNull(),
    questionType: mysqlEnum("questionType", lmsQuestionTypeValues).notNull(),
    prompt: text("prompt").notNull(),
    optionsJson: json("optionsJson").notNull(),
    correctAnswerJson: json("correctAnswerJson").notNull(),
    explanation: text("explanation"),
    defaultPoints: int("defaultPoints").default(10).notNull(),
    createdByUserId: int("createdByUserId")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [
    index("lms_question_bank_offering_idx").on(table.courseOfferingId),
    index("lms_question_bank_topic_idx").on(table.topic),
  ],
);

export const lmsQuizzes = mysqlTable(
  "lmsQuizzes",
  {
    id: int("id").autoincrement().primaryKey(),
    courseOfferingId: int("courseOfferingId")
      .notNull()
      .references(() => courseOfferings.id),
    moduleId: int("moduleId").references(() => lmsModules.id),
    categoryId: int("categoryId").references(() => lmsGradeCategories.id),
    title: varchar("title", { length: 180 }).notNull(),
    instructions: text("instructions"),
    status: mysqlEnum("status", lmsPublicationStatusValues).default("published").notNull(),
    publishAt: timestamp("publishAt"),
    availableFrom: timestamp("availableFrom"),
    dueAt: timestamp("dueAt"),
    timeLimitMinutes: int("timeLimitMinutes").default(30).notNull(),
    maxAttempts: int("maxAttempts").default(2).notNull(),
    passMarkPercent: int("passMarkPercent").default(50).notNull(),
    randomizeQuestions: boolean("randomizeQuestions").default(false).notNull(),
    randomizeOptions: boolean("randomizeOptions").default(false).notNull(),
    reviewPolicy: mysqlEnum("reviewPolicy", lmsQuizReviewPolicyValues).default("after_release").notNull(),
    gradesReleased: boolean("gradesReleased").default(false).notNull(),
    createdByUserId: int("createdByUserId")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [index("lms_quizzes_offering_idx").on(table.courseOfferingId)],
);

export const lmsQuizQuestions = mysqlTable(
  "lmsQuizQuestions",
  {
    id: int("id").autoincrement().primaryKey(),
    quizId: int("quizId")
      .notNull()
      .references(() => lmsQuizzes.id),
    questionBankId: int("questionBankId")
      .notNull()
      .references(() => lmsQuestionBank.id),
    position: int("position").default(1).notNull(),
    pointsOverride: int("pointsOverride"),
  },
  table => [
    uniqueIndex("lms_quiz_questions_unique").on(table.quizId, table.questionBankId),
    index("lms_quiz_questions_quiz_idx").on(table.quizId),
  ],
);

export const lmsQuizAttempts = mysqlTable(
  "lmsQuizAttempts",
  {
    id: int("id").autoincrement().primaryKey(),
    quizId: int("quizId")
      .notNull()
      .references(() => lmsQuizzes.id),
    enrollmentId: int("enrollmentId")
      .notNull()
      .references(() => enrollments.id),
    attemptNumber: int("attemptNumber").default(1).notNull(),
    status: mysqlEnum("status", ["in_progress", "submitted", "auto_graded", "graded", "expired"]).default("in_progress").notNull(),
    startedAt: timestamp("startedAt").defaultNow().notNull(),
    expiresAt: timestamp("expiresAt"),
    lastSavedAt: timestamp("lastSavedAt").defaultNow().notNull(),
    submittedAt: timestamp("submittedAt"),
    answersJson: json("answersJson").notNull(),
    questionOrderJson: json("questionOrderJson").notNull(),
    autoScore: int("autoScore").default(0).notNull(),
    manualScore: int("manualScore").default(0).notNull(),
    totalScore: int("totalScore").default(0).notNull(),
    maxScore: int("maxScore").default(0).notNull(),
    passed: boolean("passed"),
    instructorFeedback: text("instructorFeedback"),
    gradeReleased: boolean("gradeReleased").default(false).notNull(),
    gradedByUserId: int("gradedByUserId").references(() => users.id),
    gradedAt: timestamp("gradedAt"),
  },
  table => [
    index("lms_quiz_attempts_quiz_enrollment_idx").on(table.quizId, table.enrollmentId),
    index("lms_quiz_attempts_enrollment_idx").on(table.enrollmentId),
  ],
);

export const lmsGradebookEntries = mysqlTable(
  "lmsGradebookEntries",
  {
    id: int("id").autoincrement().primaryKey(),
    courseOfferingId: int("courseOfferingId")
      .notNull()
      .references(() => courseOfferings.id),
    enrollmentId: int("enrollmentId")
      .notNull()
      .references(() => enrollments.id),
    categoryId: int("categoryId").references(() => lmsGradeCategories.id),
    title: varchar("title", { length: 180 }).notNull(),
    sourceType: mysqlEnum("sourceType", ["assignment", "quiz", "manual"]).notNull(),
    sourceId: int("sourceId"),
    score: int("score"),
    maxScore: int("maxScore").default(100).notNull(),
    status: mysqlEnum("status", lmsGradeStatusValues).default("missing").notNull(),
    feedback: text("feedback"),
    releasedAt: timestamp("releasedAt"),
    updatedByUserId: int("updatedByUserId").references(() => users.id),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    index("lms_gradebook_offering_enrollment_idx").on(table.courseOfferingId, table.enrollmentId),
    index("lms_gradebook_source_idx").on(table.sourceType, table.sourceId),
  ],
);

export const lmsAnnouncements = mysqlTable(
  "lmsAnnouncements",
  {
    id: int("id").autoincrement().primaryKey(),
    courseOfferingId: int("courseOfferingId")
      .notNull()
      .references(() => courseOfferings.id),
    title: varchar("title", { length: 180 }).notNull(),
    body: text("body").notNull(),
    status: mysqlEnum("status", lmsPublicationStatusValues).default("published").notNull(),
    publishAt: timestamp("publishAt"),
    pinned: boolean("pinned").default(false).notNull(),
    authorUserId: int("authorUserId")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [index("lms_announcements_offering_idx").on(table.courseOfferingId)],
);

export const lmsDiscussionTopics = mysqlTable(
  "lmsDiscussionTopics",
  {
    id: int("id").autoincrement().primaryKey(),
    courseOfferingId: int("courseOfferingId")
      .notNull()
      .references(() => courseOfferings.id),
    moduleId: int("moduleId").references(() => lmsModules.id),
    title: varchar("title", { length: 180 }).notNull(),
    body: text("body").notNull(),
    pinned: boolean("pinned").default(false).notNull(),
    locked: boolean("locked").default(false).notNull(),
    moderationStatus: mysqlEnum("moderationStatus", ["active", "flagged", "hidden"]).default("active").notNull(),
    flagReason: varchar("flagReason", { length: 255 }),
    authorUserId: int("authorUserId")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [index("lms_discussion_topics_offering_idx").on(table.courseOfferingId)],
);

export const lmsDiscussionReplies = mysqlTable(
  "lmsDiscussionReplies",
  {
    id: int("id").autoincrement().primaryKey(),
    topicId: int("topicId")
      .notNull()
      .references(() => lmsDiscussionTopics.id),
    authorUserId: int("authorUserId")
      .notNull()
      .references(() => users.id),
    body: text("body").notNull(),
    moderationStatus: mysqlEnum("moderationStatus", ["active", "flagged", "hidden"]).default("active").notNull(),
    flagReason: varchar("flagReason", { length: 255 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [index("lms_discussion_replies_topic_idx").on(table.topicId)],
);

export const lmsCourseMessages = mysqlTable(
  "lmsCourseMessages",
  {
    id: int("id").autoincrement().primaryKey(),
    courseOfferingId: int("courseOfferingId")
      .notNull()
      .references(() => courseOfferings.id),
    senderUserId: int("senderUserId")
      .notNull()
      .references(() => users.id),
    recipientUserId: int("recipientUserId")
      .notNull()
      .references(() => users.id),
    subject: varchar("subject", { length: 180 }).notNull(),
    body: text("body").notNull(),
    readAt: timestamp("readAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [
    index("lms_course_messages_offering_idx").on(table.courseOfferingId),
    index("lms_course_messages_recipient_idx").on(table.recipientUserId),
    index("lms_course_messages_sender_idx").on(table.senderUserId),
  ],
);

export const lmsNotifications = mysqlTable(
  "lmsNotifications",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId")
      .notNull()
      .references(() => users.id),
    courseOfferingId: int("courseOfferingId").references(() => courseOfferings.id),
    category: mysqlEnum("category", ["announcement", "due_date", "submission", "grade_released", "discussion_reply", "message"]).notNull(),
    title: varchar("title", { length: 180 }).notNull(),
    body: varchar("body", { length: 500 }).notNull(),
    linkPath: varchar("linkPath", { length: 255 }),
    readAt: timestamp("readAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [index("lms_notifications_user_idx").on(table.userId, table.createdAt)],
);

export const lmsNotificationPreferences = mysqlTable(
  "lmsNotificationPreferences",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId")
      .notNull()
      .references(() => users.id),
    announcements: boolean("announcements").default(true).notNull(),
    dueDates: boolean("dueDates").default(true).notNull(),
    submissions: boolean("submissions").default(true).notNull(),
    grades: boolean("grades").default(true).notNull(),
    discussions: boolean("discussions").default(true).notNull(),
    messages: boolean("messages").default(true).notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [uniqueIndex("lms_notification_prefs_user_unique").on(table.userId)],
);

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type UserRole = (typeof userRoleValues)[number];

