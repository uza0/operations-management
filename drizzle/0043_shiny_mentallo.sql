UPDATE `events` SET `pay_default` = `pay_default`;
--> statement-breakpoint
ALTER TABLE `events` ALTER COLUMN `pay_default` TO `pay_default` real DEFAULT 35000 NOT NULL;
--> statement-breakpoint
UPDATE `seat_setup_details` SET `pay_amount` = 30000 WHERE `pay_amount` = 35000 AND `date` >= '2026-11-22' AND NOT EXISTS (SELECT 1 FROM `seat_setup_members` WHERE `seat_setup_members`.`detail_id` = `seat_setup_details`.`id` AND `seat_setup_members`.`payout_id` IS NOT NULL);
--> statement-breakpoint
UPDATE `events` SET `pay_default` = 35000 WHERE `pay_default` = 0 AND `date` = '2026-12-20' AND `status` = 'PLANNING';
