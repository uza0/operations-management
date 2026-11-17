CREATE TABLE `survey_opens` (
	`survey_id` text NOT NULL,
	`team_member_id` text NOT NULL,
	`opened_at` integer NOT NULL,
	PRIMARY KEY(`survey_id`, `team_member_id`),
	FOREIGN KEY (`survey_id`) REFERENCES `surveys`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`team_member_id`) REFERENCES `team_members`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `surveys` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`url` text NOT NULL,
	`note` text,
	`expires_at` integer,
	`sent_to` integer DEFAULT 0 NOT NULL,
	`created_by_id` text,
	`created_by_name` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
