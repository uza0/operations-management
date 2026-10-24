ALTER TABLE `issues` ADD `client_id` text;--> statement-breakpoint
ALTER TABLE `issues` ADD `assignee_user_id` text REFERENCES users(id);--> statement-breakpoint
ALTER TABLE `issues` ADD `assigned_at` integer;--> statement-breakpoint
ALTER TABLE `issues` ADD `due_at` integer;--> statement-breakpoint
ALTER TABLE `issues` ADD `escalated_at` integer;--> statement-breakpoint
ALTER TABLE `issues` ADD `reopened_at` integer;--> statement-breakpoint
ALTER TABLE `issues` ADD `reopen_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX `issues_assignee_idx` ON `issues` (`assignee_user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `issues_client_id_unique` ON `issues` (`client_id`);