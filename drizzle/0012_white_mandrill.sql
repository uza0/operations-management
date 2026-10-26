CREATE TABLE `seat_setup_details` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`date` text NOT NULL,
	`start_time` text NOT NULL,
	`end_time` text,
	`notes` text,
	`pay_amount` real DEFAULT 30000 NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `seat_setup_details_event_unique` ON `seat_setup_details` (`event_id`);--> statement-breakpoint
CREATE TABLE `seat_setup_members` (
	`id` text PRIMARY KEY NOT NULL,
	`detail_id` text NOT NULL,
	`event_id` text NOT NULL,
	`event_member_id` text NOT NULL,
	`check_in_time` text,
	`check_out_time` text,
	`attended` integer DEFAULT false NOT NULL,
	`notes` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`detail_id`) REFERENCES `seat_setup_details`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`event_member_id`) REFERENCES `event_members`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `seat_setup_members_unique` ON `seat_setup_members` (`detail_id`,`event_member_id`);--> statement-breakpoint
CREATE INDEX `seat_setup_members_event_idx` ON `seat_setup_members` (`event_id`);