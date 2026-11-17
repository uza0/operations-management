CREATE TABLE `deleted_events` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`name` text NOT NULL,
	`date` text,
	`deleted_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`deleted_by_id` text,
	`deleted_by_name` text,
	`payload` text NOT NULL,
	FOREIGN KEY (`deleted_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
