CREATE TABLE `paymentTransactions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`invoiceId` int NOT NULL,
	`studentId` int NOT NULL,
	`amountCents` int NOT NULL,
	`currency` varchar(3) NOT NULL DEFAULT 'USD',
	`gateway` enum('simulated') NOT NULL DEFAULT 'simulated',
	`gatewayReference` varchar(64) NOT NULL,
	`gatewayStatus` enum('initiated','authorised','settled','failed') NOT NULL DEFAULT 'initiated',
	`reconciliationStatus` enum('pending','reconciled','exception') NOT NULL DEFAULT 'pending',
	`paidAt` timestamp,
	`reconciledAt` timestamp,
	`reconciledByUserId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `paymentTransactions_id` PRIMARY KEY(`id`),
	CONSTRAINT `payment_transactions_gateway_reference_unique` UNIQUE(`gatewayReference`)
);
--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `role` enum('user','admin','registrar','faculty','student','finance','non_teaching') NOT NULL DEFAULT 'student';--> statement-breakpoint
ALTER TABLE `paymentTransactions` ADD CONSTRAINT `paymentTransactions_invoiceId_invoices_id_fk` FOREIGN KEY (`invoiceId`) REFERENCES `invoices`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `paymentTransactions` ADD CONSTRAINT `paymentTransactions_studentId_students_id_fk` FOREIGN KEY (`studentId`) REFERENCES `students`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `paymentTransactions` ADD CONSTRAINT `paymentTransactions_reconciledByUserId_users_id_fk` FOREIGN KEY (`reconciledByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `payment_transactions_invoice_idx` ON `paymentTransactions` (`invoiceId`);--> statement-breakpoint
CREATE INDEX `payment_transactions_student_idx` ON `paymentTransactions` (`studentId`);--> statement-breakpoint
CREATE INDEX `payment_transactions_reconciliation_idx` ON `paymentTransactions` (`reconciliationStatus`);