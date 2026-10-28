-- Migration: 0009_lms_platform
-- Extends the College MIS with full LMS entities (course spaces, modules, items, completions,
-- grade categories, configurable assignments, extensions, submission versions, question banks,
-- quizzes, quiz attempts, weighted gradebook entries, announcements, discussions, course messages,
-- and notifications).
--
-- Reversible Rollback SQL (run in reverse dependency order if rolling back):
-- DROP TABLE IF EXISTS `lmsNotificationPreferences`, `lmsNotifications`, `lmsCourseMessages`,
--   `lmsDiscussionReplies`, `lmsDiscussionTopics`, `lmsAnnouncements`, `lmsGradebookEntries`,
--   `lmsQuizAttempts`, `lmsQuizQuestions`, `lmsQuizzes`, `lmsQuestionBank`,
--   `lmsSubmissionVersions`, `lmsAssignmentExtensions`, `lmsAssignmentConfigs`,
--   `lmsGradeCategories`, `lmsItemCompletions`, `lmsModuleItems`, `lmsModules`, `lmsCourseSpaces`;

CREATE TABLE `lmsCourseSpaces` (
	`id` int AUTO_INCREMENT NOT NULL,
	`courseOfferingId` int NOT NULL,
	`overview` text,
	`learningOutcomes` text,
	`instructorBio` text,
	`officeHours` varchar(240),
	`gradingPolicy` text,
	`latePenaltyPercentPerDay` int NOT NULL DEFAULT 10,
	`allowDiscussions` boolean NOT NULL DEFAULT true,
	`allowPrivateMessages` boolean NOT NULL DEFAULT true,
	`proctoringNoticeAcknowledged` boolean NOT NULL DEFAULT true,
	`retentionDays` int NOT NULL DEFAULT 365,
	`updatedByUserId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `lmsCourseSpaces_id` PRIMARY KEY(`id`),
	CONSTRAINT `lms_course_spaces_offering_fk` FOREIGN KEY (`courseOfferingId`) REFERENCES `courseOfferings`(`id`) ON DELETE no action ON UPDATE no action,
	CONSTRAINT `lms_course_spaces_updatedBy_fk` FOREIGN KEY (`updatedByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `lms_course_spaces_offering_unique` ON `lmsCourseSpaces` (`courseOfferingId`);
--> statement-breakpoint
CREATE TABLE `lmsModules` (
	`id` int AUTO_INCREMENT NOT NULL,
	`courseOfferingId` int NOT NULL,
	`title` varchar(180) NOT NULL,
	`description` text,
	`weekNumber` int,
	`position` int NOT NULL DEFAULT 1,
	`status` enum('draft','published','scheduled','archived') NOT NULL DEFAULT 'published',
	`publishAt` timestamp,
	`unlockAt` timestamp,
	`createdByUserId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `lmsModules_id` PRIMARY KEY(`id`),
	CONSTRAINT `lms_modules_offering_fk` FOREIGN KEY (`courseOfferingId`) REFERENCES `courseOfferings`(`id`) ON DELETE no action ON UPDATE no action,
	CONSTRAINT `lms_modules_createdBy_fk` FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action
);
--> statement-breakpoint
CREATE INDEX `lms_modules_offering_pos_idx` ON `lmsModules` (`courseOfferingId`,`position`);
--> statement-breakpoint
CREATE INDEX `lms_modules_status_idx` ON `lmsModules` (`status`);
--> statement-breakpoint
CREATE TABLE `lmsModuleItems` (
	`id` int AUTO_INCREMENT NOT NULL,
	`moduleId` int NOT NULL,
	`courseOfferingId` int NOT NULL,
	`itemType` enum('page','file','link','video','assignment','quiz','discussion') NOT NULL,
	`title` varchar(180) NOT NULL,
	`summary` varchar(500),
	`bodyHtml` text,
	`externalUrl` varchar(1024),
	`fileKey` varchar(512),
	`fileName` varchar(255),
	`fileMimeType` varchar(120),
	`fileSizeBytes` int,
	`captionsUrl` varchar(1024),
	`transcriptText` text,
	`linkedActivityId` int,
	`linkedQuizId` int,
	`position` int NOT NULL DEFAULT 1,
	`estimatedMinutes` int NOT NULL DEFAULT 20,
	`status` enum('draft','published','scheduled','archived') NOT NULL DEFAULT 'published',
	`publishAt` timestamp,
	`createdByUserId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `lmsModuleItems_id` PRIMARY KEY(`id`),
	CONSTRAINT `lms_module_items_module_fk` FOREIGN KEY (`moduleId`) REFERENCES `lmsModules`(`id`) ON DELETE no action ON UPDATE no action,
	CONSTRAINT `lms_module_items_offering_fk` FOREIGN KEY (`courseOfferingId`) REFERENCES `courseOfferings`(`id`) ON DELETE no action ON UPDATE no action,
	CONSTRAINT `lms_module_items_activity_fk` FOREIGN KEY (`linkedActivityId`) REFERENCES `courseActivities`(`id`) ON DELETE no action ON UPDATE no action,
	CONSTRAINT `lms_module_items_createdBy_fk` FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action
);
--> statement-breakpoint
CREATE INDEX `lms_module_items_module_pos_idx` ON `lmsModuleItems` (`moduleId`,`position`);
--> statement-breakpoint
CREATE INDEX `lms_module_items_offering_idx` ON `lmsModuleItems` (`courseOfferingId`);
--> statement-breakpoint
CREATE TABLE `lmsItemCompletions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`moduleItemId` int NOT NULL,
	`enrollmentId` int NOT NULL,
	`completedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `lmsItemCompletions_id` PRIMARY KEY(`id`),
	CONSTRAINT `lms_item_completions_item_fk` FOREIGN KEY (`moduleItemId`) REFERENCES `lmsModuleItems`(`id`) ON DELETE no action ON UPDATE no action,
	CONSTRAINT `lms_item_completions_enrollment_fk` FOREIGN KEY (`enrollmentId`) REFERENCES `enrollments`(`id`) ON DELETE no action ON UPDATE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `lms_item_completions_unique` ON `lmsItemCompletions` (`moduleItemId`,`enrollmentId`);
--> statement-breakpoint
CREATE INDEX `lms_item_completions_enrollment_idx` ON `lmsItemCompletions` (`enrollmentId`);
--> statement-breakpoint
CREATE TABLE `lmsGradeCategories` (
	`id` int AUTO_INCREMENT NOT NULL,
	`courseOfferingId` int NOT NULL,
	`name` varchar(120) NOT NULL,
	`weightPercent` int NOT NULL,
	`position` int NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `lmsGradeCategories_id` PRIMARY KEY(`id`),
	CONSTRAINT `lms_grade_categories_offering_fk` FOREIGN KEY (`courseOfferingId`) REFERENCES `courseOfferings`(`id`) ON DELETE no action ON UPDATE no action
);
--> statement-breakpoint
CREATE INDEX `lms_grade_categories_offering_idx` ON `lmsGradeCategories` (`courseOfferingId`);
--> statement-breakpoint
CREATE TABLE `lmsAssignmentConfigs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`activityId` int NOT NULL,
	`courseOfferingId` int NOT NULL,
	`moduleId` int,
	`categoryId` int,
	`availableFrom` timestamp,
	`lockAt` timestamp,
	`latePolicy` enum('accept_with_penalty','accept_no_penalty','reject_after_due') NOT NULL DEFAULT 'accept_with_penalty',
	`latePenaltyPercentPerDay` int NOT NULL DEFAULT 10,
	`maxAttempts` int NOT NULL DEFAULT 3,
	`allowResubmission` boolean NOT NULL DEFAULT true,
	`submissionMode` enum('individual','group') NOT NULL DEFAULT 'individual',
	`allowTextResponse` boolean NOT NULL DEFAULT true,
	`allowFileUpload` boolean NOT NULL DEFAULT true,
	`rubricJson` json,
	`attachmentKey` varchar(512),
	`attachmentName` varchar(255),
	`attachmentMimeType` varchar(120),
	`status` enum('draft','published','scheduled','archived') NOT NULL DEFAULT 'published',
	`publishAt` timestamp,
	`gradesReleased` boolean NOT NULL DEFAULT false,
	`gradesReleasedAt` timestamp,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `lmsAssignmentConfigs_id` PRIMARY KEY(`id`),
	CONSTRAINT `lms_assignment_configs_activity_fk` FOREIGN KEY (`activityId`) REFERENCES `courseActivities`(`id`) ON DELETE no action ON UPDATE no action,
	CONSTRAINT `lms_assignment_configs_offering_fk` FOREIGN KEY (`courseOfferingId`) REFERENCES `courseOfferings`(`id`) ON DELETE no action ON UPDATE no action,
	CONSTRAINT `lms_assignment_configs_module_fk` FOREIGN KEY (`moduleId`) REFERENCES `lmsModules`(`id`) ON DELETE no action ON UPDATE no action,
	CONSTRAINT `lms_assignment_configs_category_fk` FOREIGN KEY (`categoryId`) REFERENCES `lmsGradeCategories`(`id`) ON DELETE no action ON UPDATE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `lms_assignment_configs_activity_unique` ON `lmsAssignmentConfigs` (`activityId`);
--> statement-breakpoint
CREATE INDEX `lms_assignment_configs_offering_idx` ON `lmsAssignmentConfigs` (`courseOfferingId`);
--> statement-breakpoint
CREATE TABLE `lmsAssignmentExtensions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`activityId` int NOT NULL,
	`enrollmentId` int NOT NULL,
	`extendedDueAt` timestamp NOT NULL,
	`reason` varchar(500) NOT NULL,
	`grantedByUserId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `lmsAssignmentExtensions_id` PRIMARY KEY(`id`),
	CONSTRAINT `lms_assignment_ext_activity_fk` FOREIGN KEY (`activityId`) REFERENCES `courseActivities`(`id`) ON DELETE no action ON UPDATE no action,
	CONSTRAINT `lms_assignment_ext_enrollment_fk` FOREIGN KEY (`enrollmentId`) REFERENCES `enrollments`(`id`) ON DELETE no action ON UPDATE no action,
	CONSTRAINT `lms_assignment_ext_grantedBy_fk` FOREIGN KEY (`grantedByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `lms_assignment_extensions_unique` ON `lmsAssignmentExtensions` (`activityId`,`enrollmentId`);
--> statement-breakpoint
CREATE INDEX `lms_assignment_extensions_enrollment_idx` ON `lmsAssignmentExtensions` (`enrollmentId`);
--> statement-breakpoint
CREATE TABLE `lmsSubmissionVersions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`activityId` int NOT NULL,
	`enrollmentId` int NOT NULL,
	`attemptNumber` int NOT NULL DEFAULT 1,
	`isDraft` boolean NOT NULL DEFAULT false,
	`groupName` varchar(120),
	`responseText` text,
	`attachmentKey` varchar(512),
	`attachmentName` varchar(255),
	`attachmentMimeType` varchar(120),
	`attachmentSizeBytes` int,
	`receiptCode` varchar(48) NOT NULL,
	`isLate` boolean NOT NULL DEFAULT false,
	`daysLate` int NOT NULL DEFAULT 0,
	`submittedAt` timestamp NOT NULL DEFAULT (now()),
	`rawScore` int,
	`latePenaltyPoints` int NOT NULL DEFAULT 0,
	`finalScore` int,
	`rubricScoresJson` json,
	`feedback` text,
	`annotatedFileKey` varchar(512),
	`annotatedFileName` varchar(255),
	`gradeStatus` enum('draft','released') NOT NULL DEFAULT 'draft',
	`releasedAt` timestamp,
	`gradedByUserId` int,
	`gradedAt` timestamp,
	CONSTRAINT `lmsSubmissionVersions_id` PRIMARY KEY(`id`),
	CONSTRAINT `lms_sub_versions_activity_fk` FOREIGN KEY (`activityId`) REFERENCES `courseActivities`(`id`) ON DELETE no action ON UPDATE no action,
	CONSTRAINT `lms_sub_versions_enrollment_fk` FOREIGN KEY (`enrollmentId`) REFERENCES `enrollments`(`id`) ON DELETE no action ON UPDATE no action,
	CONSTRAINT `lms_sub_versions_gradedBy_fk` FOREIGN KEY (`gradedByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action
);
--> statement-breakpoint
CREATE INDEX `lms_sub_versions_activity_enrollment_idx` ON `lmsSubmissionVersions` (`activityId`,`enrollmentId`);
--> statement-breakpoint
CREATE UNIQUE INDEX `lms_sub_versions_receipt_unique` ON `lmsSubmissionVersions` (`receiptCode`);
--> statement-breakpoint
CREATE TABLE `lmsQuestionBank` (
	`id` int AUTO_INCREMENT NOT NULL,
	`courseId` int,
	`courseOfferingId` int NOT NULL,
	`topic` varchar(120) NOT NULL,
	`questionType` enum('multiple_choice','multiple_select','true_false','short_answer','essay') NOT NULL,
	`prompt` text NOT NULL,
	`optionsJson` json NOT NULL,
	`correctAnswerJson` json NOT NULL,
	`explanation` text,
	`defaultPoints` int NOT NULL DEFAULT 10,
	`createdByUserId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `lmsQuestionBank_id` PRIMARY KEY(`id`),
	CONSTRAINT `lms_question_bank_course_fk` FOREIGN KEY (`courseId`) REFERENCES `courses`(`id`) ON DELETE no action ON UPDATE no action,
	CONSTRAINT `lms_question_bank_offering_fk` FOREIGN KEY (`courseOfferingId`) REFERENCES `courseOfferings`(`id`) ON DELETE no action ON UPDATE no action,
	CONSTRAINT `lms_question_bank_createdBy_fk` FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action
);
--> statement-breakpoint
CREATE INDEX `lms_question_bank_offering_idx` ON `lmsQuestionBank` (`courseOfferingId`);
--> statement-breakpoint
CREATE INDEX `lms_question_bank_topic_idx` ON `lmsQuestionBank` (`topic`);
--> statement-breakpoint
CREATE TABLE `lmsQuizzes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`courseOfferingId` int NOT NULL,
	`moduleId` int,
	`categoryId` int,
	`title` varchar(180) NOT NULL,
	`instructions` text,
	`status` enum('draft','published','scheduled','archived') NOT NULL DEFAULT 'published',
	`publishAt` timestamp,
	`availableFrom` timestamp,
	`dueAt` timestamp,
	`timeLimitMinutes` int NOT NULL DEFAULT 30,
	`maxAttempts` int NOT NULL DEFAULT 2,
	`passMarkPercent` int NOT NULL DEFAULT 50,
	`randomizeQuestions` boolean NOT NULL DEFAULT false,
	`randomizeOptions` boolean NOT NULL DEFAULT false,
	`reviewPolicy` enum('immediate','after_due','after_release','never') NOT NULL DEFAULT 'after_release',
	`gradesReleased` boolean NOT NULL DEFAULT false,
	`createdByUserId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `lmsQuizzes_id` PRIMARY KEY(`id`),
	CONSTRAINT `lms_quizzes_offering_fk` FOREIGN KEY (`courseOfferingId`) REFERENCES `courseOfferings`(`id`) ON DELETE no action ON UPDATE no action,
	CONSTRAINT `lms_quizzes_module_fk` FOREIGN KEY (`moduleId`) REFERENCES `lmsModules`(`id`) ON DELETE no action ON UPDATE no action,
	CONSTRAINT `lms_quizzes_category_fk` FOREIGN KEY (`categoryId`) REFERENCES `lmsGradeCategories`(`id`) ON DELETE no action ON UPDATE no action,
	CONSTRAINT `lms_quizzes_createdBy_fk` FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action
);
--> statement-breakpoint
CREATE INDEX `lms_quizzes_offering_idx` ON `lmsQuizzes` (`courseOfferingId`);
--> statement-breakpoint
CREATE TABLE `lmsQuizQuestions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`quizId` int NOT NULL,
	`questionBankId` int NOT NULL,
	`position` int NOT NULL DEFAULT 1,
	`pointsOverride` int,
	CONSTRAINT `lmsQuizQuestions_id` PRIMARY KEY(`id`),
	CONSTRAINT `lms_quiz_questions_quiz_fk` FOREIGN KEY (`quizId`) REFERENCES `lmsQuizzes`(`id`) ON DELETE no action ON UPDATE no action,
	CONSTRAINT `lms_quiz_questions_bank_fk` FOREIGN KEY (`questionBankId`) REFERENCES `lmsQuestionBank`(`id`) ON DELETE no action ON UPDATE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `lms_quiz_questions_unique` ON `lmsQuizQuestions` (`quizId`,`questionBankId`);
--> statement-breakpoint
CREATE INDEX `lms_quiz_questions_quiz_idx` ON `lmsQuizQuestions` (`quizId`);
--> statement-breakpoint
CREATE TABLE `lmsQuizAttempts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`quizId` int NOT NULL,
	`enrollmentId` int NOT NULL,
	`attemptNumber` int NOT NULL DEFAULT 1,
	`status` enum('in_progress','submitted','auto_graded','graded','expired') NOT NULL DEFAULT 'in_progress',
	`startedAt` timestamp NOT NULL DEFAULT (now()),
	`expiresAt` timestamp,
	`lastSavedAt` timestamp NOT NULL DEFAULT (now()),
	`submittedAt` timestamp,
	`answersJson` json NOT NULL,
	`questionOrderJson` json NOT NULL,
	`autoScore` int NOT NULL DEFAULT 0,
	`manualScore` int NOT NULL DEFAULT 0,
	`totalScore` int NOT NULL DEFAULT 0,
	`maxScore` int NOT NULL DEFAULT 0,
	`passed` boolean,
	`instructorFeedback` text,
	`gradeReleased` boolean NOT NULL DEFAULT false,
	`gradedByUserId` int,
	`gradedAt` timestamp,
	CONSTRAINT `lmsQuizAttempts_id` PRIMARY KEY(`id`),
	CONSTRAINT `lms_quiz_attempts_quiz_fk` FOREIGN KEY (`quizId`) REFERENCES `lmsQuizzes`(`id`) ON DELETE no action ON UPDATE no action,
	CONSTRAINT `lms_quiz_attempts_enrollment_fk` FOREIGN KEY (`enrollmentId`) REFERENCES `enrollments`(`id`) ON DELETE no action ON UPDATE no action,
	CONSTRAINT `lms_quiz_attempts_gradedBy_fk` FOREIGN KEY (`gradedByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action
);
--> statement-breakpoint
CREATE INDEX `lms_quiz_attempts_quiz_enrollment_idx` ON `lmsQuizAttempts` (`quizId`,`enrollmentId`);
--> statement-breakpoint
CREATE INDEX `lms_quiz_attempts_enrollment_idx` ON `lmsQuizAttempts` (`enrollmentId`);
--> statement-breakpoint
CREATE TABLE `lmsGradebookEntries` (
	`id` int AUTO_INCREMENT NOT NULL,
	`courseOfferingId` int NOT NULL,
	`enrollmentId` int NOT NULL,
	`categoryId` int,
	`title` varchar(180) NOT NULL,
	`sourceType` enum('assignment','quiz','manual') NOT NULL,
	`sourceId` int,
	`score` int,
	`maxScore` int NOT NULL DEFAULT 100,
	`status` enum('missing','submitted','exempt','draft_grade','released') NOT NULL DEFAULT 'missing',
	`feedback` text,
	`releasedAt` timestamp,
	`updatedByUserId` int,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `lmsGradebookEntries_id` PRIMARY KEY(`id`),
	CONSTRAINT `lms_gradebook_offering_fk` FOREIGN KEY (`courseOfferingId`) REFERENCES `courseOfferings`(`id`) ON DELETE no action ON UPDATE no action,
	CONSTRAINT `lms_gradebook_enrollment_fk` FOREIGN KEY (`enrollmentId`) REFERENCES `enrollments`(`id`) ON DELETE no action ON UPDATE no action,
	CONSTRAINT `lms_gradebook_category_fk` FOREIGN KEY (`categoryId`) REFERENCES `lmsGradeCategories`(`id`) ON DELETE no action ON UPDATE no action,
	CONSTRAINT `lms_gradebook_updatedBy_fk` FOREIGN KEY (`updatedByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action
);
--> statement-breakpoint
CREATE INDEX `lms_gradebook_offering_enrollment_idx` ON `lmsGradebookEntries` (`courseOfferingId`,`enrollmentId`);
--> statement-breakpoint
CREATE INDEX `lms_gradebook_source_idx` ON `lmsGradebookEntries` (`sourceType`,`sourceId`);
--> statement-breakpoint
CREATE TABLE `lmsAnnouncements` (
	`id` int AUTO_INCREMENT NOT NULL,
	`courseOfferingId` int NOT NULL,
	`title` varchar(180) NOT NULL,
	`body` text NOT NULL,
	`status` enum('draft','published','scheduled','archived') NOT NULL DEFAULT 'published',
	`publishAt` timestamp,
	`pinned` boolean NOT NULL DEFAULT false,
	`authorUserId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `lmsAnnouncements_id` PRIMARY KEY(`id`),
	CONSTRAINT `lms_announcements_offering_fk` FOREIGN KEY (`courseOfferingId`) REFERENCES `courseOfferings`(`id`) ON DELETE no action ON UPDATE no action,
	CONSTRAINT `lms_announcements_author_fk` FOREIGN KEY (`authorUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action
);
--> statement-breakpoint
CREATE INDEX `lms_announcements_offering_idx` ON `lmsAnnouncements` (`courseOfferingId`);
--> statement-breakpoint
CREATE TABLE `lmsDiscussionTopics` (
	`id` int AUTO_INCREMENT NOT NULL,
	`courseOfferingId` int NOT NULL,
	`moduleId` int,
	`title` varchar(180) NOT NULL,
	`body` text NOT NULL,
	`pinned` boolean NOT NULL DEFAULT false,
	`locked` boolean NOT NULL DEFAULT false,
	`moderationStatus` enum('active','flagged','hidden') NOT NULL DEFAULT 'active',
	`flagReason` varchar(255),
	`authorUserId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `lmsDiscussionTopics_id` PRIMARY KEY(`id`),
	CONSTRAINT `lms_discussion_topics_offering_fk` FOREIGN KEY (`courseOfferingId`) REFERENCES `courseOfferings`(`id`) ON DELETE no action ON UPDATE no action,
	CONSTRAINT `lms_discussion_topics_module_fk` FOREIGN KEY (`moduleId`) REFERENCES `lmsModules`(`id`) ON DELETE no action ON UPDATE no action,
	CONSTRAINT `lms_discussion_topics_author_fk` FOREIGN KEY (`authorUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action
);
--> statement-breakpoint
CREATE INDEX `lms_discussion_topics_offering_idx` ON `lmsDiscussionTopics` (`courseOfferingId`);
--> statement-breakpoint
CREATE TABLE `lmsDiscussionReplies` (
	`id` int AUTO_INCREMENT NOT NULL,
	`topicId` int NOT NULL,
	`authorUserId` int NOT NULL,
	`body` text NOT NULL,
	`moderationStatus` enum('active','flagged','hidden') NOT NULL DEFAULT 'active',
	`flagReason` varchar(255),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `lmsDiscussionReplies_id` PRIMARY KEY(`id`),
	CONSTRAINT `lms_discussion_replies_topic_fk` FOREIGN KEY (`topicId`) REFERENCES `lmsDiscussionTopics`(`id`) ON DELETE no action ON UPDATE no action,
	CONSTRAINT `lms_discussion_replies_author_fk` FOREIGN KEY (`authorUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action
);
--> statement-breakpoint
CREATE INDEX `lms_discussion_replies_topic_idx` ON `lmsDiscussionReplies` (`topicId`);
--> statement-breakpoint
CREATE TABLE `lmsCourseMessages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`courseOfferingId` int NOT NULL,
	`senderUserId` int NOT NULL,
	`recipientUserId` int NOT NULL,
	`subject` varchar(180) NOT NULL,
	`body` text NOT NULL,
	`readAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `lmsCourseMessages_id` PRIMARY KEY(`id`),
	CONSTRAINT `lms_course_messages_offering_fk` FOREIGN KEY (`courseOfferingId`) REFERENCES `courseOfferings`(`id`) ON DELETE no action ON UPDATE no action,
	CONSTRAINT `lms_course_messages_sender_fk` FOREIGN KEY (`senderUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action,
	CONSTRAINT `lms_course_messages_recipient_fk` FOREIGN KEY (`recipientUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action
);
--> statement-breakpoint
CREATE INDEX `lms_course_messages_offering_idx` ON `lmsCourseMessages` (`courseOfferingId`);
--> statement-breakpoint
CREATE INDEX `lms_course_messages_recipient_idx` ON `lmsCourseMessages` (`recipientUserId`);
--> statement-breakpoint
CREATE INDEX `lms_course_messages_sender_idx` ON `lmsCourseMessages` (`senderUserId`);
--> statement-breakpoint
CREATE TABLE `lmsNotifications` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`courseOfferingId` int,
	`category` enum('announcement','due_date','submission','grade_released','discussion_reply','message') NOT NULL,
	`title` varchar(180) NOT NULL,
	`body` varchar(500) NOT NULL,
	`linkPath` varchar(255),
	`readAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `lmsNotifications_id` PRIMARY KEY(`id`),
	CONSTRAINT `lms_notifications_user_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action,
	CONSTRAINT `lms_notifications_offering_fk` FOREIGN KEY (`courseOfferingId`) REFERENCES `courseOfferings`(`id`) ON DELETE no action ON UPDATE no action
);
--> statement-breakpoint
CREATE INDEX `lms_notifications_user_idx` ON `lmsNotifications` (`userId`,`createdAt`);
--> statement-breakpoint
CREATE TABLE `lmsNotificationPreferences` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`announcements` boolean NOT NULL DEFAULT true,
	`dueDates` boolean NOT NULL DEFAULT true,
	`submissions` boolean NOT NULL DEFAULT true,
	`grades` boolean NOT NULL DEFAULT true,
	`discussions` boolean NOT NULL DEFAULT true,
	`messages` boolean NOT NULL DEFAULT true,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `lmsNotificationPreferences_id` PRIMARY KEY(`id`),
	CONSTRAINT `lms_notification_prefs_user_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `lms_notification_prefs_user_unique` ON `lmsNotificationPreferences` (`userId`);
