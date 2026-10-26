ALTER TABLE `seat_setup_members` ADD `notified_at` integer;--> statement-breakpoint
ALTER TABLE `seat_setup_members` ADD `respond_by` integer;--> statement-breakpoint
ALTER TABLE `seat_setup_members` ADD `confirmed_at` integer;--> statement-breakpoint
ALTER TABLE `seat_setup_members` ADD `declined_at` integer;--> statement-breakpoint
ALTER TABLE `seat_setup_members` ADD `decline_reason` text;--> statement-breakpoint
ALTER TABLE `seat_setup_members` ADD `reported_arrival_at` integer;--> statement-breakpoint
ALTER TABLE `seat_setup_members` ADD `approved_at` integer;--> statement-breakpoint
ALTER TABLE `seat_setup_members` ADD `approved_by_id` text REFERENCES users(id);--> statement-breakpoint
ALTER TABLE `seat_setup_members` ADD `reported_departure_at` integer;