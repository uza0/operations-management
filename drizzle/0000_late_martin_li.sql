CREATE TABLE `announcements` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`title` text NOT NULL,
	`message` text NOT NULL,
	`priority` text DEFAULT 'NORMAL' NOT NULL,
	`audience` text DEFAULT 'EVENT' NOT NULL,
	`gate_id` text,
	`working_point_id` text,
	`event_member_id` text,
	`created_by_id` text,
	`created_by_name` text NOT NULL,
	`expires_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`gate_id`) REFERENCES `gates`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`working_point_id`) REFERENCES `working_points`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`event_member_id`) REFERENCES `event_members`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `announcements_event_idx` ON `announcements` (`event_id`);--> statement-breakpoint
CREATE INDEX `announcements_priority_idx` ON `announcements` (`priority`);--> statement-breakpoint
CREATE TABLE `assignment_changes` (
	`id` text PRIMARY KEY NOT NULL,
	`assignment_id` text NOT NULL,
	`from_location` text,
	`to_location` text,
	`from_task` text,
	`to_task` text,
	`from_arrival` text,
	`to_arrival` text,
	`reason` text,
	`changed_by_id` text,
	`changed_by_name` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`assignment_id`) REFERENCES `assignments`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`changed_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `assignment_changes_assignment_idx` ON `assignment_changes` (`assignment_id`);--> statement-breakpoint
CREATE TABLE `assignments` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`event_member_id` text NOT NULL,
	`gate_id` text,
	`working_point_id` text,
	`task` text NOT NULL,
	`arrival_time` text NOT NULL,
	`shift_start` text NOT NULL,
	`shift_end` text NOT NULL,
	`is_gate_leader` integer DEFAULT false NOT NULL,
	`notes` text,
	`status` text DEFAULT 'ASSIGNED' NOT NULL,
	`created_by_id` text,
	`updated_by_id` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`event_member_id`) REFERENCES `event_members`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`gate_id`) REFERENCES `gates`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`working_point_id`) REFERENCES `working_points`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`updated_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `assignments_event_idx` ON `assignments` (`event_id`);--> statement-breakpoint
CREATE INDEX `assignments_member_idx` ON `assignments` (`event_member_id`);--> statement-breakpoint
CREATE INDEX `assignments_gate_idx` ON `assignments` (`gate_id`);--> statement-breakpoint
CREATE INDEX `assignments_wp_idx` ON `assignments` (`working_point_id`);--> statement-breakpoint
CREATE INDEX `assignments_status_idx` ON `assignments` (`status`);--> statement-breakpoint
CREATE TABLE `attendance` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`event_member_id` text NOT NULL,
	`status` text DEFAULT 'PENDING' NOT NULL,
	`check_in_at` integer,
	`check_out_at` integer,
	`recorded_by_id` text,
	`notes` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`event_member_id`) REFERENCES `event_members`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`recorded_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `attendance_member_unique` ON `attendance` (`event_member_id`);--> statement-breakpoint
CREATE INDEX `attendance_event_idx` ON `attendance` (`event_id`);--> statement-breakpoint
CREATE INDEX `attendance_status_idx` ON `attendance` (`status`);--> statement-breakpoint
CREATE TABLE `audit_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text,
	`actor_id` text,
	`actor_name` text NOT NULL,
	`action` text NOT NULL,
	`entity` text NOT NULL,
	`entity_id` text,
	`entity_label` text,
	`old_values` text,
	`new_values` text,
	`reason` text,
	`summary` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `audit_event_idx` ON `audit_logs` (`event_id`);--> statement-breakpoint
CREATE INDEX `audit_entity_idx` ON `audit_logs` (`entity`,`entity_id`);--> statement-breakpoint
CREATE INDEX `audit_created_idx` ON `audit_logs` (`created_at`);--> statement-breakpoint
CREATE TABLE `event_access` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text NOT NULL,
	`gate_id` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `event_access_user_idx` ON `event_access` (`user_id`);--> statement-breakpoint
CREATE INDEX `event_access_event_idx` ON `event_access` (`event_id`);--> statement-breakpoint
CREATE TABLE `event_members` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`team_member_id` text NOT NULL,
	`status` text DEFAULT 'INVITED' NOT NULL,
	`token` text NOT NULL,
	`token_expires_at` integer,
	`is_reserve` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`team_member_id`) REFERENCES `team_members`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `event_members_token_unique` ON `event_members` (`token`);--> statement-breakpoint
CREATE UNIQUE INDEX `event_members_event_person_unique` ON `event_members` (`event_id`,`team_member_id`);--> statement-breakpoint
CREATE INDEX `event_members_event_idx` ON `event_members` (`event_id`);--> statement-breakpoint
CREATE TABLE `events` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`venue_id` text NOT NULL,
	`date` text NOT NULL,
	`start_time` text NOT NULL,
	`team_arrival_time` text NOT NULL,
	`description` text,
	`status` text DEFAULT 'DRAFT' NOT NULL,
	`map_image_url` text,
	`report_notes` text,
	`created_by_id` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`venue_id`) REFERENCES `venues`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `events_status_idx` ON `events` (`status`);--> statement-breakpoint
CREATE INDEX `events_date_idx` ON `events` (`date`);--> statement-breakpoint
CREATE TABLE `gates` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`name` text NOT NULL,
	`type` text DEFAULT 'GENERAL' NOT NULL,
	`description` text,
	`capacity` integer,
	`required_staff` integer DEFAULT 1 NOT NULL,
	`status` text DEFAULT 'INACTIVE' NOT NULL,
	`gate_leader_id` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `gates_event_name_unique` ON `gates` (`event_id`,`name`);--> statement-breakpoint
CREATE INDEX `gates_event_idx` ON `gates` (`event_id`);--> statement-breakpoint
CREATE TABLE `issues` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`type` text NOT NULL,
	`description` text NOT NULL,
	`priority` text DEFAULT 'MEDIUM' NOT NULL,
	`status` text DEFAULT 'OPEN' NOT NULL,
	`gate_id` text,
	`working_point_id` text,
	`reported_by_member_id` text,
	`reported_by_user_id` text,
	`reporter_name` text NOT NULL,
	`acknowledged_at` integer,
	`resolved_at` integer,
	`resolved_by_id` text,
	`resolution_note` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`gate_id`) REFERENCES `gates`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`working_point_id`) REFERENCES `working_points`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`reported_by_member_id`) REFERENCES `event_members`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`reported_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`resolved_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `issues_event_idx` ON `issues` (`event_id`);--> statement-breakpoint
CREATE INDEX `issues_status_idx` ON `issues` (`status`);--> statement-breakpoint
CREATE TABLE `map_markers` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`type` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`x` real NOT NULL,
	`y` real NOT NULL,
	`gate_id` text,
	`working_point_id` text,
	`event_member_id` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`gate_id`) REFERENCES `gates`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`working_point_id`) REFERENCES `working_points`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`event_member_id`) REFERENCES `event_members`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `map_markers_event_idx` ON `map_markers` (`event_id`);--> statement-breakpoint
CREATE TABLE `team_members` (
	`id` text PRIMARY KEY NOT NULL,
	`full_name` text NOT NULL,
	`phone` text,
	`employee_code` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`notes` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `team_members_code_unique` ON `team_members` (`employee_code`);--> statement-breakpoint
CREATE INDEX `team_members_active_idx` ON `team_members` (`active`);--> statement-breakpoint
CREATE TABLE `timeline_items` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`scheduled_time` text NOT NULL,
	`status` text DEFAULT 'UPCOMING' NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `timeline_event_idx` ON `timeline_items` (`event_id`);--> statement-breakpoint
CREATE TABLE `uploads` (
	`name` text PRIMARY KEY NOT NULL,
	`content_type` text NOT NULL,
	`size` integer NOT NULL,
	`data` blob NOT NULL,
	`uploaded_by_id` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`uploaded_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`email` text,
	`name` text NOT NULL,
	`password_hash` text NOT NULL,
	`role` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`team_member_id` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`team_member_id`) REFERENCES `team_members`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_unique` ON `users` (`username`);--> statement-breakpoint
CREATE INDEX `users_role_idx` ON `users` (`role`);--> statement-breakpoint
CREATE TABLE `venues` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`address` text,
	`description` text,
	`map_image_url` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `working_points` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`name` text NOT NULL,
	`type` text DEFAULT 'OTHER' NOT NULL,
	`description` text,
	`required_staff` integer DEFAULT 1 NOT NULL,
	`status` text DEFAULT 'INACTIVE' NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `working_points_event_name_unique` ON `working_points` (`event_id`,`name`);--> statement-breakpoint
CREATE INDEX `working_points_event_idx` ON `working_points` (`event_id`);