ALTER TABLE `events` ADD `board_published_at` integer;--> statement-breakpoint
ALTER TABLE `events` ADD `board_published_by_id` text REFERENCES users(id);