ALTER TABLE `events` ADD `seat_pay_detached_at` integer;--> statement-breakpoint
ALTER TABLE `events` ADD `seat_pay_detached_by` text REFERENCES users(id);--> statement-breakpoint
ALTER TABLE `events` ADD `seat_pay_detached_reason` text;--> statement-breakpoint
ALTER TABLE `seat_setup_members` ADD `payout_id` text REFERENCES payouts(id);--> statement-breakpoint
CREATE INDEX `seat_setup_members_payout_idx` ON `seat_setup_members` (`payout_id`);