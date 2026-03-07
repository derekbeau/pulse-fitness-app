CREATE TABLE `foods` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`brand` text,
	`serving_size` text,
	`serving_grams` real,
	`calories` real NOT NULL,
	`protein` real NOT NULL,
	`carbs` real NOT NULL,
	`fat` real NOT NULL,
	`fiber` real,
	`sugar` real,
	`verified` integer DEFAULT false NOT NULL,
	`source` text,
	`notes` text,
	`last_used_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "foods_serving_grams_check" CHECK("foods"."serving_grams" is null or "foods"."serving_grams" > 0),
	CONSTRAINT "foods_macros_nonnegative_check" CHECK("foods"."calories" >= 0 and "foods"."protein" >= 0 and "foods"."carbs" >= 0 and "foods"."fat" >= 0),
	CONSTRAINT "foods_fiber_nonnegative_check" CHECK("foods"."fiber" is null or "foods"."fiber" >= 0),
	CONSTRAINT "foods_sugar_nonnegative_check" CHECK("foods"."sugar" is null or "foods"."sugar" >= 0)
);
--> statement-breakpoint
CREATE INDEX `foods_user_last_used_at_idx` ON `foods` (`user_id`,`last_used_at`);--> statement-breakpoint
CREATE TABLE `nutrition_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`date` text NOT NULL,
	`notes` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "nutrition_logs_date_format_check" CHECK("nutrition_logs"."date" glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `nutrition_logs_user_id_date_unique` ON `nutrition_logs` (`user_id`,`date`);--> statement-breakpoint
CREATE TABLE `meals` (
	`id` text PRIMARY KEY NOT NULL,
	`nutrition_log_id` text NOT NULL,
	`name` text NOT NULL,
	`time` text,
	`notes` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`nutrition_log_id`) REFERENCES `nutrition_logs`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "meals_time_format_check" CHECK("meals"."time" is null or "meals"."time" glob '[0-9][0-9]:[0-9][0-9]')
);
--> statement-breakpoint
CREATE INDEX `meals_nutrition_log_id_idx` ON `meals` (`nutrition_log_id`);--> statement-breakpoint
CREATE TABLE `meal_items` (
	`id` text PRIMARY KEY NOT NULL,
	`meal_id` text NOT NULL,
	`food_id` text,
	`name` text NOT NULL,
	`amount` real NOT NULL,
	`unit` text NOT NULL,
	`calories` real NOT NULL,
	`protein` real NOT NULL,
	`carbs` real NOT NULL,
	`fat` real NOT NULL,
	`fiber` real,
	`sugar` real,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`meal_id`) REFERENCES `meals`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`food_id`) REFERENCES `foods`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "meal_items_amount_check" CHECK("meal_items"."amount" > 0),
	CONSTRAINT "meal_items_macros_nonnegative_check" CHECK("meal_items"."calories" >= 0 and "meal_items"."protein" >= 0 and "meal_items"."carbs" >= 0 and "meal_items"."fat" >= 0),
	CONSTRAINT "meal_items_fiber_nonnegative_check" CHECK("meal_items"."fiber" is null or "meal_items"."fiber" >= 0),
	CONSTRAINT "meal_items_sugar_nonnegative_check" CHECK("meal_items"."sugar" is null or "meal_items"."sugar" >= 0)
);
--> statement-breakpoint
CREATE INDEX `meal_items_meal_id_idx` ON `meal_items` (`meal_id`);--> statement-breakpoint
CREATE INDEX `meal_items_food_id_idx` ON `meal_items` (`food_id`);
