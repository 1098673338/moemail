CREATE INDEX IF NOT EXISTS `message_icloud_active_received_idx`
  ON `message` (`received_at` DESC)
  WHERE `source` = 'icloud' AND `deleted_at` IS NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `message_icloud_pending_tag_scan_idx`
  ON `message` (`account_id`, `automatic_tag_scanned_at`)
  WHERE `source` = 'icloud' AND `deleted_at` IS NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `message_icloud_reconcile_idx`
  ON `message` (`account_id`, `provider_mailbox`, `provider_uid`)
  WHERE `source` = 'icloud' AND `deleted_at` IS NULL AND `provider_uid` IS NOT NULL;
