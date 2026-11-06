ALTER TABLE `seat_setup_details` ADD `status` text DEFAULT 'PLANNING' NOT NULL;--> statement-breakpoint
ALTER TABLE `seat_setup_details` ADD `ready_version` integer DEFAULT 0 NOT NULL;