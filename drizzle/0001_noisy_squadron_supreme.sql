ALTER TABLE `event_members` ADD `notified_at` integer;--> statement-breakpoint
ALTER TABLE `event_members` ADD `notified_by_id` text REFERENCES users(id);--> statement-breakpoint
ALTER TABLE `venues` ADD `location_url` text;--> statement-breakpoint
ALTER TABLE `venues` ADD `latitude` real;--> statement-breakpoint
ALTER TABLE `venues` ADD `longitude` real;