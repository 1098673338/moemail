CREATE TABLE `external_mail_account` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`email_id` text NOT NULL,
	`provider` text DEFAULT 'icloud' NOT NULL,
	`email_address` text NOT NULL,
	`username` text NOT NULL,
	`password_encrypted` text NOT NULL,
	`imap_host` text DEFAULT 'imap.mail.me.com' NOT NULL,
	`imap_port` integer DEFAULT 993 NOT NULL,
	`smtp_host` text DEFAULT 'smtp.mail.me.com' NOT NULL,
	`smtp_port` integer DEFAULT 587 NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`last_uid` integer DEFAULT 0 NOT NULL,
	`last_sync_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`email_id`) REFERENCES `email`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `external_mail_account_user_id_idx` ON `external_mail_account` (`user_id`);--> statement-breakpoint
CREATE INDEX `external_mail_account_email_id_idx` ON `external_mail_account` (`email_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `external_mail_account_user_email_address_unique` ON `external_mail_account` (`user_id`,`email_address`);--> statement-breakpoint
CREATE UNIQUE INDEX `external_mail_account_email_id_unique` ON `external_mail_account` (`email_id`);