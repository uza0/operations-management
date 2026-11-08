ALTER TABLE `users` ADD `system_developer` integer DEFAULT false NOT NULL;
--> statement-breakpoint
UPDATE `users` SET `system_developer` = 1 WHERE lower(`username`) = 'ameer' AND lower(`name`) = 'ameer dawod';
