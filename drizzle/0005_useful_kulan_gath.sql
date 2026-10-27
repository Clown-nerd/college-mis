ALTER TABLE `applicants` ADD `detailsVerifiedAt` timestamp;--> statement-breakpoint
ALTER TABLE `applicants` ADD `detailsVerifiedByUserId` int;--> statement-breakpoint
ALTER TABLE `applicants` ADD CONSTRAINT `applicants_detailsVerifiedByUserId_users_id_fk` FOREIGN KEY (`detailsVerifiedByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;