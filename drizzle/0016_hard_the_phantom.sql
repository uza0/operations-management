DROP INDEX `seat_setup_details_event_unique`;--> statement-breakpoint
CREATE INDEX `seat_setup_details_event_idx` ON `seat_setup_details` (`event_id`,`date`);