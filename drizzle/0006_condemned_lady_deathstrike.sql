CREATE TABLE `event_feedback` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`event_member_id` text NOT NULL,
	`rating` integer NOT NULL,
	`went_well` text,
	`problems` text,
	`suggestions` text,
	`submitted_at` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`event_member_id`) REFERENCES `event_members`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `event_feedback_member_unique` ON `event_feedback` (`event_id`,`event_member_id`);--> statement-breakpoint
CREATE INDEX `event_feedback_event_idx` ON `event_feedback` (`event_id`);--> statement-breakpoint
CREATE TABLE `main_gate_details` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`name` text NOT NULL,
	`start_time` text NOT NULL,
	`end_time` text NOT NULL,
	`notes` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `main_gate_details_event_unique` ON `main_gate_details` (`event_id`);--> statement-breakpoint
CREATE TABLE `main_gate_members` (
	`id` text PRIMARY KEY NOT NULL,
	`detail_id` text NOT NULL,
	`event_id` text NOT NULL,
	`event_member_id` text NOT NULL,
	`task` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`detail_id`) REFERENCES `main_gate_details`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`event_member_id`) REFERENCES `event_members`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `main_gate_members_unique` ON `main_gate_members` (`detail_id`,`event_member_id`);--> statement-breakpoint
CREATE INDEX `main_gate_members_event_idx` ON `main_gate_members` (`event_id`);