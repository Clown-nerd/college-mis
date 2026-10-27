ALTER TABLE `staffProfiles` ADD `invitationDeliveryStatus` enum('not_sent','drafted','sent','failed') DEFAULT 'not_sent' NOT NULL;--> statement-breakpoint
ALTER TABLE `staffProfiles` ADD `invitationSentAt` timestamp;--> statement-breakpoint
ALTER TABLE `staffProfiles` ADD `invitationFailureReason` varchar(255);