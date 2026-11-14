CREATE TABLE `event_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`seats_url` text NOT NULL,
	`date` text,
	`venue_id` text,
	`status` text DEFAULT 'PENDING' NOT NULL,
	`event_id` text,
	`created_by_id` text,
	`created_by_name` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`venue_id`) REFERENCES `venues`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
