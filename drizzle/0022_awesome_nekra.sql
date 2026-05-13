ALTER TABLE `email_group` ADD `sort_order` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
UPDATE `email_group`
SET `sort_order` = (
	SELECT count(*)
	FROM `email_group` AS `earlier`
	WHERE `earlier`.`user_id` = `email_group`.`user_id`
		AND (
			`earlier`.`created_at` < `email_group`.`created_at`
			OR (
				`earlier`.`created_at` = `email_group`.`created_at`
				AND `earlier`.`name` < `email_group`.`name`
			)
			OR (
				`earlier`.`created_at` = `email_group`.`created_at`
				AND `earlier`.`name` = `email_group`.`name`
				AND `earlier`.`id` < `email_group`.`id`
			)
		)
);--> statement-breakpoint
CREATE INDEX `email_group_user_sort_order_idx` ON `email_group` (`user_id`,`sort_order`);
