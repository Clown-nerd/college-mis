CREATE TABLE `classMeetings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`courseOfferingId` int NOT NULL,
	`weekday` enum('monday','tuesday','wednesday','thursday','friday','saturday','sunday') NOT NULL,
	`startsAt` varchar(5) NOT NULL,
	`endsAt` varchar(5) NOT NULL,
	`room` varchar(80),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `classMeetings_id` PRIMARY KEY(`id`),
	CONSTRAINT `class_meetings_unique` UNIQUE(`courseOfferingId`,`weekday`,`startsAt`)
);
--> statement-breakpoint
ALTER TABLE `classMeetings` ADD CONSTRAINT `classMeetings_courseOfferingId_courseOfferings_id_fk` FOREIGN KEY (`courseOfferingId`) REFERENCES `courseOfferings`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `class_meetings_offering_idx` ON `classMeetings` (`courseOfferingId`);