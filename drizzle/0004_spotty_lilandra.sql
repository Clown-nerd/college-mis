CREATE TABLE `applicantPayments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`applicantId` int NOT NULL,
	`amountCents` int NOT NULL,
	`currency` varchar(3) NOT NULL DEFAULT 'USD',
	`gatewayReference` varchar(64) NOT NULL,
	`gatewayStatus` enum('initiated','settled','failed') NOT NULL DEFAULT 'initiated',
	`reviewedAt` timestamp,
	`reviewedByUserId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `applicantPayments_id` PRIMARY KEY(`id`),
	CONSTRAINT `applicant_payments_gateway_reference_unique` UNIQUE(`gatewayReference`)
);
--> statement-breakpoint
CREATE TABLE `staffProfiles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int,
	`fullName` varchar(180) NOT NULL,
	`email` varchar(320) NOT NULL,
	`staffNumber` varchar(48) NOT NULL,
	`staffCategory` enum('teaching','technical','finance','registry','administration') NOT NULL,
	`accessRole` enum('faculty','non_teaching','finance','registrar','admin') NOT NULL,
	`status` enum('invited','active','inactive') NOT NULL DEFAULT 'invited',
	`provisionedByUserId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `staffProfiles_id` PRIMARY KEY(`id`),
	CONSTRAINT `staff_profiles_email_unique` UNIQUE(`email`),
	CONSTRAINT `staff_profiles_number_unique` UNIQUE(`staffNumber`),
	CONSTRAINT `staff_profiles_user_unique` UNIQUE(`userId`)
);
--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `role` enum('user','applicant','admin','registrar','faculty','student','finance','non_teaching') NOT NULL DEFAULT 'applicant';--> statement-breakpoint
ALTER TABLE `applicants` ADD `userId` int;--> statement-breakpoint
ALTER TABLE `applicants` ADD `applicationFeeStatus` enum('not_required','pending','settled','waived') DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE `applicants` ADD CONSTRAINT `applicants_user_unique` UNIQUE(`userId`);--> statement-breakpoint
ALTER TABLE `applicantPayments` ADD CONSTRAINT `applicantPayments_applicantId_applicants_id_fk` FOREIGN KEY (`applicantId`) REFERENCES `applicants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `applicantPayments` ADD CONSTRAINT `applicantPayments_reviewedByUserId_users_id_fk` FOREIGN KEY (`reviewedByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `staffProfiles` ADD CONSTRAINT `staffProfiles_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `staffProfiles` ADD CONSTRAINT `staffProfiles_provisionedByUserId_users_id_fk` FOREIGN KEY (`provisionedByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `applicant_payments_applicant_idx` ON `applicantPayments` (`applicantId`);--> statement-breakpoint
CREATE INDEX `staff_profiles_category_idx` ON `staffProfiles` (`staffCategory`);--> statement-breakpoint
ALTER TABLE `applicants` ADD CONSTRAINT `applicants_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;