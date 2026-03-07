CREATE TABLE `entity_links` (
	`id` text PRIMARY KEY NOT NULL,
	`source_type` text NOT NULL,
	`source_id` text NOT NULL,
	`target_type` text NOT NULL,
	`target_id` text NOT NULL,
	`target_name` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	CONSTRAINT "entity_links_source_type_check" CHECK("entity_links"."source_type" in ('journal', 'activity', 'resource')),
	CONSTRAINT "entity_links_target_type_check" CHECK("entity_links"."target_type" in ('workout', 'activity', 'habit', 'injury', 'exercise', 'protocol'))
);
--> statement-breakpoint
CREATE INDEX `entity_links_source_type_source_id_idx` ON `entity_links` (`source_type`,`source_id`);--> statement-breakpoint
CREATE INDEX `entity_links_target_type_target_id_idx` ON `entity_links` (`target_type`,`target_id`);--> statement-breakpoint
CREATE TABLE `equipment_locations` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`notes` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `equipment_locations_user_id_idx` ON `equipment_locations` (`user_id`);--> statement-breakpoint
CREATE TABLE `equipment_items` (
	`id` text PRIMARY KEY NOT NULL,
	`location_id` text NOT NULL,
	`name` text NOT NULL,
	`category` text NOT NULL,
	`details` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`location_id`) REFERENCES `equipment_locations`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "equipment_items_category_check" CHECK("equipment_items"."category" in ('free-weights', 'machines', 'cables', 'cardio', 'accessories'))
);
--> statement-breakpoint
CREATE INDEX `equipment_items_location_id_idx` ON `equipment_items` (`location_id`);--> statement-breakpoint
CREATE TABLE `resources` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`title` text NOT NULL,
	`type` text NOT NULL,
	`author` text NOT NULL,
	`description` text,
	`tags` text DEFAULT '[]' NOT NULL,
	`principles` text DEFAULT '[]' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "resources_type_check" CHECK("resources"."type" in ('program', 'book', 'creator'))
);
--> statement-breakpoint
CREATE INDEX `resources_user_id_idx` ON `resources` (`user_id`);
