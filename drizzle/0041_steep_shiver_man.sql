DROP INDEX `event_members_event_person_unique`;--> statement-breakpoint
ALTER TABLE `event_members` ADD `chair_setup_only` integer DEFAULT false NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `event_members_event_person_unique` ON `event_members` (`event_id`,`team_member_id`) WHERE "event_members"."chair_setup_only" = 0;