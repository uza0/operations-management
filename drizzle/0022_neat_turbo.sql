CREATE TABLE `payment_templates` (
	`id` text PRIMARY KEY NOT NULL,
	`file_name` text NOT NULL,
	`bytes` blob NOT NULL,
	`size` integer NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`uploaded_by_id` text,
	`uploaded_by_name` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`uploaded_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
ALTER TABLE `event_expenses` ADD `team_member_id` text REFERENCES team_members(id);--> statement-breakpoint
ALTER TABLE `event_expenses` ADD `payout_id` text REFERENCES payouts(id);--> statement-breakpoint
CREATE INDEX `event_expenses_payout_idx` ON `event_expenses` (`payout_id`);--> statement-breakpoint
ALTER TABLE `payouts` ADD `expenses_total` real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `payouts` ADD `row_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `payouts` ADD `file_name` text;--> statement-breakpoint
ALTER TABLE `payouts` ADD `file_bytes` blob;