ALTER TABLE `event_members` ADD `pay_mode` text DEFAULT 'EVENT' NOT NULL;--> statement-breakpoint
ALTER TABLE `team_members` ADD `salaried` integer DEFAULT false NOT NULL;