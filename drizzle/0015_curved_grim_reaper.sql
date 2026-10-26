CREATE TABLE `member_rates` (
	`id` text PRIMARY KEY NOT NULL,
	`team_member_id` text NOT NULL,
	`amount` real NOT NULL,
	`effective_from` text NOT NULL,
	`note` text,
	`created_by_id` text,
	`created_by_name` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`team_member_id`) REFERENCES `team_members`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `member_rates_member_idx` ON `member_rates` (`team_member_id`,`effective_from`);--> statement-breakpoint
CREATE TABLE `payouts` (
	`id` text PRIMARY KEY NOT NULL,
	`from_date` text NOT NULL,
	`to_date` text NOT NULL,
	`total_amount` real NOT NULL,
	`people_count` integer DEFAULT 0 NOT NULL,
	`note` text,
	`created_by_id` text,
	`created_by_name` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `payouts_range_idx` ON `payouts` (`from_date`,`to_date`);--> statement-breakpoint
ALTER TABLE `event_members` ADD `payout_id` text REFERENCES payouts(id);