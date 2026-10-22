ALTER TABLE `event_members` ADD `pay_amount` real;--> statement-breakpoint
ALTER TABLE `events` ADD `pay_default` real DEFAULT 30000 NOT NULL;