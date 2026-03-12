PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_meal_items` (
	`id` text PRIMARY KEY NOT NULL,
	`meal_id` text NOT NULL,
	`food_id` text,
	`name` text NOT NULL,
	`amount` real NOT NULL,
	`unit` text NOT NULL,
	`display_quantity` real,
	`display_unit` text,
	`calories` real NOT NULL,
	`protein` real NOT NULL,
	`carbs` real NOT NULL,
	`fat` real NOT NULL,
	`fiber` real,
	`sugar` real,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`meal_id`) REFERENCES `meals`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`food_id`) REFERENCES `foods`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "meal_items_amount_check" CHECK("__new_meal_items"."amount" > 0),
	CONSTRAINT "meal_items_display_quantity_check" CHECK("__new_meal_items"."display_quantity" is null or "__new_meal_items"."display_quantity" > 0),
	CONSTRAINT "meal_items_macros_nonnegative_check" CHECK("__new_meal_items"."calories" >= 0 and "__new_meal_items"."protein" >= 0 and "__new_meal_items"."carbs" >= 0 and "__new_meal_items"."fat" >= 0),
	CONSTRAINT "meal_items_fiber_nonnegative_check" CHECK("__new_meal_items"."fiber" is null or "__new_meal_items"."fiber" >= 0),
	CONSTRAINT "meal_items_sugar_nonnegative_check" CHECK("__new_meal_items"."sugar" is null or "__new_meal_items"."sugar" >= 0)
);
--> statement-breakpoint
INSERT INTO `__new_meal_items`(
	"id",
	"meal_id",
	"food_id",
	"name",
	"amount",
	"unit",
	"display_quantity",
	"display_unit",
	"calories",
	"protein",
	"carbs",
	"fat",
	"fiber",
	"sugar",
	"created_at"
)
SELECT
	"id",
	"meal_id",
	"food_id",
	"name",
	"amount",
	"unit",
	"display_quantity",
	"display_unit",
	"calories",
	"protein",
	"carbs",
	"fat",
	"fiber",
	"sugar",
	"created_at"
FROM `meal_items`;--> statement-breakpoint
DROP TABLE `meal_items`;--> statement-breakpoint
ALTER TABLE `__new_meal_items` RENAME TO `meal_items`;--> statement-breakpoint
CREATE INDEX `meal_items_meal_id_idx` ON `meal_items` (`meal_id`);--> statement-breakpoint
CREATE INDEX `meal_items_food_id_idx` ON `meal_items` (`food_id`);--> statement-breakpoint
PRAGMA foreign_keys=ON;
