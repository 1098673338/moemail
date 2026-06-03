CREATE TABLE `deleted_message` (
	`id` text PRIMARY KEY NOT NULL,
	`email_id` text NOT NULL,
	`message_id` text NOT NULL,
	`deleted_at` integer NOT NULL,
	FOREIGN KEY (`email_id`) REFERENCES `email`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `deleted_message_email_message_unique` ON `deleted_message` (`email_id`,`message_id`);--> statement-breakpoint
CREATE INDEX `deleted_message_email_id_idx` ON `deleted_message` (`email_id`);--> statement-breakpoint
CREATE INDEX `deleted_message_message_id_idx` ON `deleted_message` (`message_id`);