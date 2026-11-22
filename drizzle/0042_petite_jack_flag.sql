ALTER TABLE `event_members` ADD `sales_role` text;
--> statement-breakpoint
UPDATE `events` SET `pay_default` = 35000 WHERE `pay_default` = 30000 AND `date` >= '2026-11-22';
