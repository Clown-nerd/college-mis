CREATE TABLE `academicTerms` (
	`id` int AUTO_INCREMENT NOT NULL,
	`code` varchar(32) NOT NULL,
	`name` varchar(120) NOT NULL,
	`startsAt` timestamp NOT NULL,
	`endsAt` timestamp NOT NULL,
	`status` enum('planned','active','closed') NOT NULL DEFAULT 'planned',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `academicTerms_id` PRIMARY KEY(`id`),
	CONSTRAINT `academic_terms_code_unique` UNIQUE(`code`)
);
--> statement-breakpoint
CREATE TABLE `applicants` (
	`id` int AUTO_INCREMENT NOT NULL,
	`applicantNumber` varchar(40) NOT NULL,
	`firstName` varchar(100) NOT NULL,
	`lastName` varchar(100) NOT NULL,
	`email` varchar(320) NOT NULL,
	`phone` varchar(40),
	`programmeId` int,
	`intakeTermId` int,
	`status` enum('inquiry','submitted','under_review','admitted','declined','converted') NOT NULL DEFAULT 'inquiry',
	`decisionAt` timestamp,
	`decidedByUserId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `applicants_id` PRIMARY KEY(`id`),
	CONSTRAINT `applicants_number_unique` UNIQUE(`applicantNumber`)
);
--> statement-breakpoint
CREATE TABLE `attendanceRecords` (
	`id` int AUTO_INCREMENT NOT NULL,
	`enrollmentId` int NOT NULL,
	`classDate` varchar(10) NOT NULL,
	`status` enum('present','late','absent','excused') NOT NULL,
	`capturedByUserId` int NOT NULL,
	`capturedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `attendanceRecords_id` PRIMARY KEY(`id`),
	CONSTRAINT `attendance_enrollment_date_unique` UNIQUE(`enrollmentId`,`classDate`)
);
--> statement-breakpoint
CREATE TABLE `auditEvents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`actorUserId` int,
	`action` varchar(120) NOT NULL,
	`entityType` varchar(80) NOT NULL,
	`entityId` varchar(80),
	`summary` varchar(500) NOT NULL,
	`metadata` json,
	`occurredAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `auditEvents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `courseOfferings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`courseId` int NOT NULL,
	`termId` int NOT NULL,
	`section` varchar(16) NOT NULL,
	`modality` enum('in_person','online','hybrid') NOT NULL DEFAULT 'in_person',
	`meetingPattern` varchar(120),
	`room` varchar(80),
	`capacity` int NOT NULL,
	`status` enum('draft','open','closed','cancelled') NOT NULL DEFAULT 'draft',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `courseOfferings_id` PRIMARY KEY(`id`),
	CONSTRAINT `course_offerings_section_unique` UNIQUE(`courseId`,`termId`,`section`)
);
--> statement-breakpoint
CREATE TABLE `coursePrerequisites` (
	`id` int AUTO_INCREMENT NOT NULL,
	`courseId` int NOT NULL,
	`prerequisiteCourseId` int NOT NULL,
	CONSTRAINT `coursePrerequisites_id` PRIMARY KEY(`id`),
	CONSTRAINT `course_prerequisites_pair_unique` UNIQUE(`courseId`,`prerequisiteCourseId`)
);
--> statement-breakpoint
CREATE TABLE `courses` (
	`id` int AUTO_INCREMENT NOT NULL,
	`departmentId` int NOT NULL,
	`code` varchar(32) NOT NULL,
	`title` varchar(180) NOT NULL,
	`description` text,
	`credits` int NOT NULL,
	`level` int NOT NULL,
	`active` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `courses_id` PRIMARY KEY(`id`),
	CONSTRAINT `courses_code_unique` UNIQUE(`code`)
);
--> statement-breakpoint
CREATE TABLE `departments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`code` varchar(24) NOT NULL,
	`name` varchar(180) NOT NULL,
	`active` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `departments_id` PRIMARY KEY(`id`),
	CONSTRAINT `departments_code_unique` UNIQUE(`code`)
);
--> statement-breakpoint
CREATE TABLE `documents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`studentId` int,
	`requestId` int,
	`name` varchar(255) NOT NULL,
	`fileKey` varchar(512) NOT NULL,
	`mimeType` varchar(120) NOT NULL,
	`retentionCategory` varchar(100) NOT NULL,
	`uploadedByUserId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `documents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `enrollments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`studentId` int NOT NULL,
	`courseOfferingId` int NOT NULL,
	`status` enum('registered','dropped','withdrawn','completed') NOT NULL DEFAULT 'registered',
	`registeredAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `enrollments_id` PRIMARY KEY(`id`),
	CONSTRAINT `enrollments_student_offering_unique` UNIQUE(`studentId`,`courseOfferingId`)
);
--> statement-breakpoint
CREATE TABLE `facultyAssignments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`courseOfferingId` int NOT NULL,
	`facultyUserId` int NOT NULL,
	`assignmentRole` enum('instructor','coordinator') NOT NULL DEFAULT 'instructor',
	`assignedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `facultyAssignments_id` PRIMARY KEY(`id`),
	CONSTRAINT `faculty_assignments_unique` UNIQUE(`courseOfferingId`,`facultyUserId`)
);
--> statement-breakpoint
CREATE TABLE `gradeRecords` (
	`id` int AUTO_INCREMENT NOT NULL,
	`enrollmentId` int NOT NULL,
	`score` int NOT NULL,
	`letterGrade` varchar(4) NOT NULL,
	`gradePointsTimes100` int NOT NULL,
	`status` enum('draft','published') NOT NULL DEFAULT 'draft',
	`enteredByUserId` int NOT NULL,
	`enteredAt` timestamp NOT NULL DEFAULT (now()),
	`publishedAt` timestamp,
	CONSTRAINT `gradeRecords_id` PRIMARY KEY(`id`),
	CONSTRAINT `grade_records_enrollment_unique` UNIQUE(`enrollmentId`)
);
--> statement-breakpoint
CREATE TABLE `invoices` (
	`id` int AUTO_INCREMENT NOT NULL,
	`studentId` int NOT NULL,
	`termId` int,
	`invoiceNumber` varchar(48) NOT NULL,
	`amountCents` int NOT NULL,
	`balanceCents` int NOT NULL,
	`dueAt` timestamp,
	`status` enum('draft','issued','part_paid','paid','waived','overdue') NOT NULL DEFAULT 'draft',
	`createdByUserId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `invoices_id` PRIMARY KEY(`id`),
	CONSTRAINT `invoices_number_unique` UNIQUE(`invoiceNumber`)
);
--> statement-breakpoint
CREATE TABLE `programmes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`departmentId` int NOT NULL,
	`code` varchar(32) NOT NULL,
	`name` varchar(180) NOT NULL,
	`awardType` enum('certificate','diploma','degree','postgraduate') NOT NULL,
	`durationTerms` int NOT NULL,
	`active` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `programmes_id` PRIMARY KEY(`id`),
	CONSTRAINT `programmes_code_unique` UNIQUE(`code`)
);
--> statement-breakpoint
CREATE TABLE `scholarships` (
	`id` int AUTO_INCREMENT NOT NULL,
	`studentId` int NOT NULL,
	`termId` int,
	`name` varchar(180) NOT NULL,
	`amountCents` int NOT NULL,
	`status` enum('pending','approved','applied','cancelled') NOT NULL DEFAULT 'pending',
	`approvedByUserId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `scholarships_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `studentProgrammeHistory` (
	`id` int AUTO_INCREMENT NOT NULL,
	`studentId` int NOT NULL,
	`programmeId` int NOT NULL,
	`startedTermId` int,
	`endedTermId` int,
	`status` enum('active','completed','transferred','withdrawn') NOT NULL DEFAULT 'active',
	`recordedByUserId` int,
	`recordedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `studentProgrammeHistory_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `studentRequests` (
	`id` int AUTO_INCREMENT NOT NULL,
	`studentId` int NOT NULL,
	`type` enum('document','registration','finance','personal_details','other') NOT NULL,
	`title` varchar(180) NOT NULL,
	`detail` text,
	`status` enum('submitted','in_review','approved','rejected','completed') NOT NULL DEFAULT 'submitted',
	`assigneeUserId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `studentRequests_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `students` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int,
	`studentNumber` varchar(40) NOT NULL,
	`legalFirstName` varchar(100) NOT NULL,
	`legalLastName` varchar(100) NOT NULL,
	`preferredName` varchar(100),
	`institutionalEmail` varchar(320),
	`phone` varchar(40),
	`emergencyContactName` varchar(180),
	`emergencyContactPhone` varchar(40),
	`programmeId` int,
	`admissionTermId` int,
	`status` enum('applicant','active','leave','graduated','withdrawn') NOT NULL DEFAULT 'applicant',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `students_id` PRIMARY KEY(`id`),
	CONSTRAINT `students_user_unique` UNIQUE(`userId`),
	CONSTRAINT `students_number_unique` UNIQUE(`studentNumber`)
);
--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `role` enum('user','admin','registrar','faculty','student','finance') NOT NULL DEFAULT 'student';--> statement-breakpoint
ALTER TABLE `applicants` ADD CONSTRAINT `applicants_programmeId_programmes_id_fk` FOREIGN KEY (`programmeId`) REFERENCES `programmes`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `applicants` ADD CONSTRAINT `applicants_intakeTermId_academicTerms_id_fk` FOREIGN KEY (`intakeTermId`) REFERENCES `academicTerms`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `applicants` ADD CONSTRAINT `applicants_decidedByUserId_users_id_fk` FOREIGN KEY (`decidedByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `attendanceRecords` ADD CONSTRAINT `attendanceRecords_enrollmentId_enrollments_id_fk` FOREIGN KEY (`enrollmentId`) REFERENCES `enrollments`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `attendanceRecords` ADD CONSTRAINT `attendanceRecords_capturedByUserId_users_id_fk` FOREIGN KEY (`capturedByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `auditEvents` ADD CONSTRAINT `auditEvents_actorUserId_users_id_fk` FOREIGN KEY (`actorUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `courseOfferings` ADD CONSTRAINT `courseOfferings_courseId_courses_id_fk` FOREIGN KEY (`courseId`) REFERENCES `courses`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `courseOfferings` ADD CONSTRAINT `courseOfferings_termId_academicTerms_id_fk` FOREIGN KEY (`termId`) REFERENCES `academicTerms`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `coursePrerequisites` ADD CONSTRAINT `coursePrerequisites_courseId_courses_id_fk` FOREIGN KEY (`courseId`) REFERENCES `courses`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `coursePrerequisites` ADD CONSTRAINT `coursePrerequisites_prerequisiteCourseId_courses_id_fk` FOREIGN KEY (`prerequisiteCourseId`) REFERENCES `courses`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `courses` ADD CONSTRAINT `courses_departmentId_departments_id_fk` FOREIGN KEY (`departmentId`) REFERENCES `departments`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `documents` ADD CONSTRAINT `documents_studentId_students_id_fk` FOREIGN KEY (`studentId`) REFERENCES `students`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `documents` ADD CONSTRAINT `documents_requestId_studentRequests_id_fk` FOREIGN KEY (`requestId`) REFERENCES `studentRequests`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `documents` ADD CONSTRAINT `documents_uploadedByUserId_users_id_fk` FOREIGN KEY (`uploadedByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `enrollments` ADD CONSTRAINT `enrollments_studentId_students_id_fk` FOREIGN KEY (`studentId`) REFERENCES `students`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `enrollments` ADD CONSTRAINT `enrollments_courseOfferingId_courseOfferings_id_fk` FOREIGN KEY (`courseOfferingId`) REFERENCES `courseOfferings`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `facultyAssignments` ADD CONSTRAINT `facultyAssignments_courseOfferingId_courseOfferings_id_fk` FOREIGN KEY (`courseOfferingId`) REFERENCES `courseOfferings`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `facultyAssignments` ADD CONSTRAINT `facultyAssignments_facultyUserId_users_id_fk` FOREIGN KEY (`facultyUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `gradeRecords` ADD CONSTRAINT `gradeRecords_enrollmentId_enrollments_id_fk` FOREIGN KEY (`enrollmentId`) REFERENCES `enrollments`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `gradeRecords` ADD CONSTRAINT `gradeRecords_enteredByUserId_users_id_fk` FOREIGN KEY (`enteredByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `invoices` ADD CONSTRAINT `invoices_studentId_students_id_fk` FOREIGN KEY (`studentId`) REFERENCES `students`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `invoices` ADD CONSTRAINT `invoices_termId_academicTerms_id_fk` FOREIGN KEY (`termId`) REFERENCES `academicTerms`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `invoices` ADD CONSTRAINT `invoices_createdByUserId_users_id_fk` FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `programmes` ADD CONSTRAINT `programmes_departmentId_departments_id_fk` FOREIGN KEY (`departmentId`) REFERENCES `departments`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `scholarships` ADD CONSTRAINT `scholarships_studentId_students_id_fk` FOREIGN KEY (`studentId`) REFERENCES `students`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `scholarships` ADD CONSTRAINT `scholarships_termId_academicTerms_id_fk` FOREIGN KEY (`termId`) REFERENCES `academicTerms`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `scholarships` ADD CONSTRAINT `scholarships_approvedByUserId_users_id_fk` FOREIGN KEY (`approvedByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `studentProgrammeHistory` ADD CONSTRAINT `studentProgrammeHistory_studentId_students_id_fk` FOREIGN KEY (`studentId`) REFERENCES `students`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `studentProgrammeHistory` ADD CONSTRAINT `studentProgrammeHistory_programmeId_programmes_id_fk` FOREIGN KEY (`programmeId`) REFERENCES `programmes`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `studentProgrammeHistory` ADD CONSTRAINT `studentProgrammeHistory_startedTermId_academicTerms_id_fk` FOREIGN KEY (`startedTermId`) REFERENCES `academicTerms`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `studentProgrammeHistory` ADD CONSTRAINT `studentProgrammeHistory_endedTermId_academicTerms_id_fk` FOREIGN KEY (`endedTermId`) REFERENCES `academicTerms`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `studentProgrammeHistory` ADD CONSTRAINT `studentProgrammeHistory_recordedByUserId_users_id_fk` FOREIGN KEY (`recordedByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `studentRequests` ADD CONSTRAINT `studentRequests_studentId_students_id_fk` FOREIGN KEY (`studentId`) REFERENCES `students`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `studentRequests` ADD CONSTRAINT `studentRequests_assigneeUserId_users_id_fk` FOREIGN KEY (`assigneeUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `students` ADD CONSTRAINT `students_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `students` ADD CONSTRAINT `students_programmeId_programmes_id_fk` FOREIGN KEY (`programmeId`) REFERENCES `programmes`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `students` ADD CONSTRAINT `students_admissionTermId_academicTerms_id_fk` FOREIGN KEY (`admissionTermId`) REFERENCES `academicTerms`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `applicants_status_idx` ON `applicants` (`status`);--> statement-breakpoint
CREATE INDEX `attendance_class_date_idx` ON `attendanceRecords` (`classDate`);--> statement-breakpoint
CREATE INDEX `audit_events_actor_idx` ON `auditEvents` (`actorUserId`);--> statement-breakpoint
CREATE INDEX `audit_events_entity_idx` ON `auditEvents` (`entityType`,`entityId`);--> statement-breakpoint
CREATE INDEX `audit_events_occurred_idx` ON `auditEvents` (`occurredAt`);--> statement-breakpoint
CREATE INDEX `course_offerings_term_idx` ON `courseOfferings` (`termId`);--> statement-breakpoint
CREATE INDEX `course_prerequisites_course_idx` ON `coursePrerequisites` (`courseId`);--> statement-breakpoint
CREATE INDEX `courses_department_idx` ON `courses` (`departmentId`);--> statement-breakpoint
CREATE INDEX `documents_student_idx` ON `documents` (`studentId`);--> statement-breakpoint
CREATE INDEX `documents_request_idx` ON `documents` (`requestId`);--> statement-breakpoint
CREATE INDEX `enrollments_offering_idx` ON `enrollments` (`courseOfferingId`);--> statement-breakpoint
CREATE INDEX `faculty_assignments_user_idx` ON `facultyAssignments` (`facultyUserId`);--> statement-breakpoint
CREATE INDEX `invoices_student_idx` ON `invoices` (`studentId`);--> statement-breakpoint
CREATE INDEX `programmes_department_idx` ON `programmes` (`departmentId`);--> statement-breakpoint
CREATE INDEX `scholarships_student_idx` ON `scholarships` (`studentId`);--> statement-breakpoint
CREATE INDEX `student_programme_history_student_idx` ON `studentProgrammeHistory` (`studentId`);--> statement-breakpoint
CREATE INDEX `student_requests_student_idx` ON `studentRequests` (`studentId`);--> statement-breakpoint
CREATE INDEX `student_requests_status_idx` ON `studentRequests` (`status`);--> statement-breakpoint
CREATE INDEX `students_programme_idx` ON `students` (`programmeId`);--> statement-breakpoint
CREATE INDEX `students_status_idx` ON `students` (`status`);