ALTER TABLE `staffProfiles` ADD `invitationToken` varchar(64);--> statement-breakpoint
UPDATE `staffProfiles` SET `invitationToken` = CONCAT('legacy-', `id`) WHERE `invitationToken` IS NULL;--> statement-breakpoint
ALTER TABLE `staffProfiles` MODIFY `invitationToken` varchar(64) NOT NULL;--> statement-breakpoint
ALTER TABLE `staffProfiles` ADD `invitationPreparedAt` timestamp;--> statement-breakpoint
ALTER TABLE `staffProfiles` ADD `invitationPreparedByUserId` int;--> statement-breakpoint
ALTER TABLE `staffProfiles` ADD CONSTRAINT `staff_profiles_invitation_token_unique` UNIQUE(`invitationToken`);--> statement-breakpoint
ALTER TABLE `staffProfiles` ADD CONSTRAINT `staffProfiles_invitationPreparedByUserId_users_id_fk` FOREIGN KEY (`invitationPreparedByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;
