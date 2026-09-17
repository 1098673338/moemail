DROP INDEX IF EXISTS `message_icloud_active_received_idx`;
--> statement-breakpoint
CREATE INDEX `message_icloud_active_received_idx`
  ON `message` (`source`, `deleted_at`, `received_at` DESC);
