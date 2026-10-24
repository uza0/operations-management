CREATE TABLE `feedback_responses` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`role` text,
	`instructions_clear` integer,
	`knew_duties` text,
	`briefing_length` text,
	`organisation` integer,
	`staffing` text,
	`distribution_good` text,
	`unsure_moments` text,
	`unsure_why` text,
	`knew_who_to_ask` text,
	`support_speed` integer,
	`problem_kind` text,
	`problem_prevention` text,
	`guests_informed` text,
	`guest_common_issue` text,
	`guest_improvement` text,
	`overall` integer,
	`keep_doing` text,
	`hardest` text,
	`work_again` text,
	`more_responsibility` text,
	`free_note` text,
	`submitted_at` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `feedback_responses_event_idx` ON `feedback_responses` (`event_id`);--> statement-breakpoint
ALTER TABLE `event_members` ADD `feedback_at` integer;