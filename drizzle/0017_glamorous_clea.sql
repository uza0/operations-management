ALTER TABLE `attendance` ADD `reported_arrival_at` integer;--> statement-breakpoint
ALTER TABLE `attendance` ADD `approved_at` integer;--> statement-breakpoint
ALTER TABLE `attendance` ADD `approved_by_id` text REFERENCES users(id);--> statement-breakpoint
ALTER TABLE `attendance` ADD `reported_departure_at` integer;--> statement-breakpoint
ALTER TABLE `event_members` ADD `respond_by` integer;--> statement-breakpoint
ALTER TABLE `event_members` ADD `confirmed_at` integer;--> statement-breakpoint
ALTER TABLE `event_members` ADD `declined_at` integer;--> statement-breakpoint
ALTER TABLE `event_members` ADD `decline_reason` text;--> statement-breakpoint
ALTER TABLE `events` ADD `response_window_hours` integer;