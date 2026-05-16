ALTER TABLE `email` ADD `sort_order` integer;--> statement-breakpoint
CREATE INDEX `email_user_sort_order_idx` ON `email` (`userId`,`sort_order`);