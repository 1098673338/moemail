CREATE TABLE `email_group` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `email_group_user_id_idx` ON `email_group` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `email_group_user_name_unique` ON `email_group` (`user_id`,`name`);--> statement-breakpoint
ALTER TABLE `email` ADD `group_id` text REFERENCES email_group(id);--> statement-breakpoint
CREATE INDEX `email_group_id_idx` ON `email` (`group_id`);