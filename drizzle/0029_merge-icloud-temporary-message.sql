-- Keep the existing D1 rows intact while making `message` the shared mailbox
-- table. This migration is intentionally additive except for rebuilding the
-- pre-existing `message` table: its legacy `emailId NOT NULL` constraint makes
-- an iCloud message (which has no temporary-email row) impossible to store.
PRAGMA defer_foreign_keys = true;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `mail_account` (
  `id` text PRIMARY KEY NOT NULL,
  `provider` text NOT NULL DEFAULT 'icloud',
  `email_address` text NOT NULL COLLATE NOCASE UNIQUE,
  `username` text NOT NULL,
  `encrypted_password` text NOT NULL,
  `status` text NOT NULL DEFAULT 'active',
  `uid_validity` text,
  `last_uid` integer NOT NULL DEFAULT 0,
  `last_sync_at` integer,
  `html_backfill_cursor` integer,
  `html_backfill_at` integer,
  `aliases_last_sync_at` integer,
  `aliases_active_count` integer NOT NULL DEFAULT 0,
  `aliases_inactive_count` integer NOT NULL DEFAULT 0,
  `sync_error` text,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `mail_account_status_idx` ON `mail_account` (`status`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `mail_address` (
  `id` text PRIMARY KEY NOT NULL,
  `address` text NOT NULL COLLATE NOCASE UNIQUE,
  `type` text NOT NULL,
  `status` text NOT NULL DEFAULT 'active',
  `provider` text NOT NULL,
  `provider_id` text,
  `provider_label` text,
  `provider_origin` text,
  `account_id` text REFERENCES `mail_account`(`id`) ON DELETE SET NULL,
  `label` text,
  `note` text,
  `phone_number` text,
  `phone_url` text,
  `tags_json` text NOT NULL DEFAULT '[]',
  `tag_color` text,
  `provider_created_at` integer,
  `added_at` integer,
  `last_received_at` integer,
  `disabled_at` integer,
  `deleted_at` integer,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `mail_address_status_idx` ON `mail_address` (`status`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `mail_address_type_idx` ON `mail_address` (`type`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `mail_address_account_idx` ON `mail_address` (`account_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `mail_address_provider_id_unique`
  ON `mail_address` (`provider`, `provider_id`) WHERE `provider_id` IS NOT NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `icloud_mailbox_state` (
  `account_id` text NOT NULL REFERENCES `mail_account`(`id`) ON DELETE CASCADE,
  `mailbox_path` text NOT NULL,
  `uid_validity` text,
  `last_uid` integer NOT NULL DEFAULT 0,
  `last_sync_at` integer,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  PRIMARY KEY (`account_id`, `mailbox_path`)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `icloud_mailbox_state_account_idx`
  ON `icloud_mailbox_state` (`account_id`);
--> statement-breakpoint
ALTER TABLE `message` RENAME TO `message_legacy_0029`;
--> statement-breakpoint
CREATE TABLE `message` (
  `id` text PRIMARY KEY NOT NULL,
  `source` text NOT NULL DEFAULT 'temporary',
  `account_id` text REFERENCES `mail_account`(`id`) ON DELETE SET NULL,
  `provider_uid` integer,
  `provider_mailbox` text,
  `provider_message_id` text,
  `sender_address` text NOT NULL DEFAULT '',
  `sender_name` text,
  `recipients_json` text NOT NULL DEFAULT '[]',
  `subject` text NOT NULL,
  `text_body` text NOT NULL DEFAULT '',
  `html_body` text,
  `raw_object_key` text,
  `received_at` integer NOT NULL,
  `is_read` integer NOT NULL DEFAULT 0,
  `automatic_tag_scanned_at` integer,
  `deleted_at` integer,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  `emailId` text REFERENCES `email`(`id`) ON DELETE CASCADE,
  `from_address` text,
  `to_address` text,
  `content` text NOT NULL DEFAULT '',
  `html` text,
  `type` text,
  `sent_at` integer NOT NULL
);
--> statement-breakpoint
INSERT INTO `message` (
  `id`, `source`, `account_id`, `provider_uid`, `provider_mailbox`,
  `provider_message_id`, `sender_address`, `sender_name`, `recipients_json`,
  `subject`, `text_body`, `html_body`, `raw_object_key`, `received_at`,
  `is_read`, `automatic_tag_scanned_at`, `deleted_at`, `created_at`,
  `updated_at`, `emailId`, `from_address`, `to_address`, `content`, `html`,
  `type`, `sent_at`
)
SELECT
  `id`, 'temporary', NULL, NULL, NULL, NULL,
  COALESCE(`from_address`, ''), NULL,
  CASE WHEN `to_address` IS NULL THEN '[]' ELSE json_array(`to_address`) END,
  `subject`, COALESCE(`content`, ''), `html`, NULL, `received_at`,
  0, NULL, NULL, `received_at`, `received_at`,
  `emailId`, `from_address`, `to_address`, COALESCE(`content`, ''), `html`,
  COALESCE(`type`, 'received'), COALESCE(`sent_at`, `received_at`)
FROM `message_legacy_0029`;
--> statement-breakpoint
DROP TABLE `message_legacy_0029`;
--> statement-breakpoint
CREATE UNIQUE INDEX `message_source_identity_unique`
  ON `message` (`source`, `account_id`, `provider_mailbox`, `provider_uid`, `provider_message_id`);
--> statement-breakpoint
CREATE INDEX `message_received_at_idx` ON `message` (`received_at`);
--> statement-breakpoint
CREATE INDEX `message_account_idx` ON `message` (`account_id`);
--> statement-breakpoint
CREATE INDEX `message_automatic_tag_scan_idx`
  ON `message` (`account_id`, `automatic_tag_scanned_at`);
--> statement-breakpoint
CREATE INDEX `message_temporary_email_received_idx`
  ON `message` (`emailId`, `received_at`, `type`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `message_recipient` (
  `message_id` text NOT NULL REFERENCES `message`(`id`) ON DELETE CASCADE,
  `address_id` text NOT NULL REFERENCES `mail_address`(`id`) ON DELETE CASCADE,
  `recipient_type` text NOT NULL DEFAULT 'to',
  `created_at` integer NOT NULL,
  PRIMARY KEY (`message_id`, `address_id`)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `message_recipient_address_idx`
  ON `message_recipient` (`address_id`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `address_event` (
  `id` text PRIMARY KEY NOT NULL,
  `address_id` text NOT NULL REFERENCES `mail_address`(`id`) ON DELETE CASCADE,
  `action` text NOT NULL,
  `detail` text,
  `created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `address_event_address_idx`
  ON `address_event` (`address_id`, `created_at`);
