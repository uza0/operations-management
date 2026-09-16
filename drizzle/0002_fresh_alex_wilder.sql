ALTER TABLE `attendance` ADD `check_in_time` text;--> statement-breakpoint
ALTER TABLE `attendance` ADD `check_out_time` text;--> statement-breakpoint
ALTER TABLE `event_members` ADD `credit_days` real;--> statement-breakpoint
ALTER TABLE `event_members` ADD `credit_note` text;--> statement-breakpoint
ALTER TABLE `events` ADD `credit_days_default` real DEFAULT 1 NOT NULL;