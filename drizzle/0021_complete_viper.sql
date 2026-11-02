CREATE TABLE `member_login_attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`phone_key` text NOT NULL,
	`attempted_at` integer NOT NULL,
	`succeeded` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE INDEX `member_login_attempts_phone_idx` ON `member_login_attempts` (`phone_key`,`attempted_at`);--> statement-breakpoint
CREATE TABLE `member_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`team_member_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`device_label` text,
	`created_at` integer NOT NULL,
	`last_seen_at` integer NOT NULL,
	`revoked_at` integer,
	FOREIGN KEY (`team_member_id`) REFERENCES `team_members`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `member_sessions_token_unique` ON `member_sessions` (`token_hash`);--> statement-breakpoint
CREATE INDEX `member_sessions_member_idx` ON `member_sessions` (`team_member_id`);--> statement-breakpoint
ALTER TABLE `team_members` ADD `access_code_hash` text;--> statement-breakpoint
ALTER TABLE `team_members` ADD `access_code_set_at` integer;--> statement-breakpoint
ALTER TABLE `team_members` ADD `access_code_revoked_at` integer;