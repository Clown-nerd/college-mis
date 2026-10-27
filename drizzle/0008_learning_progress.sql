CREATE TABLE `courseActivities` (
	`id` int AUTO_INCREMENT NOT NULL,
	`courseOfferingId` int NOT NULL,
	`type` enum('assessment','assignment','note') NOT NULL,
	`title` varchar(180) NOT NULL,
	`description` text,
	`dueAt` timestamp,
	`maxScore` int,
	`published` boolean NOT NULL DEFAULT true,
	`createdByUserId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `courseActivities_id` PRIMARY KEY(`id`),
	CONSTRAINT `course_activities_offering_courseOfferings_id_fk` FOREIGN KEY (`courseOfferingId`) REFERENCES `courseOfferings`(`id`) ON DELETE no action ON UPDATE no action,
	CONSTRAINT `course_activities_createdBy_users_id_fk` FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action
);
--> statement-breakpoint
CREATE INDEX `course_activities_offering_idx` ON `courseActivities` (`courseOfferingId`);
--> statement-breakpoint
CREATE INDEX `course_activities_type_idx` ON `courseActivities` (`type`);
--> statement-breakpoint
CREATE TABLE `activitySubmissions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`activityId` int NOT NULL,
	`enrollmentId` int NOT NULL,
	`response` text,
	`score` int,
	`feedback` text,
	`status` enum('submitted','graded') NOT NULL DEFAULT 'submitted',
	`submittedAt` timestamp NOT NULL DEFAULT (now()),
	`gradedAt` timestamp,
	`gradedByUserId` int,
	CONSTRAINT `activitySubmissions_id` PRIMARY KEY(`id`),
	CONSTRAINT `activity_submissions_activity_courseActivities_id_fk` FOREIGN KEY (`activityId`) REFERENCES `courseActivities`(`id`) ON DELETE no action ON UPDATE no action,
	CONSTRAINT `activity_submissions_enrollment_enrollments_id_fk` FOREIGN KEY (`enrollmentId`) REFERENCES `enrollments`(`id`) ON DELETE no action ON UPDATE no action,
	CONSTRAINT `activity_submissions_gradedBy_users_id_fk` FOREIGN KEY (`gradedByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `activity_submissions_activity_enrollment_unique` ON `activitySubmissions` (`activityId`,`enrollmentId`);
--> statement-breakpoint
CREATE INDEX `activity_submissions_enrollment_idx` ON `activitySubmissions` (`enrollmentId`);
