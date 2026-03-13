ALTER TABLE `meals` ADD `summary` text;--> statement-breakpoint
UPDATE `meals`
SET `summary` = (
  SELECT group_concat(`ordered_items`.`name`, ', ')
  FROM (
    SELECT `meal_items`.`name` AS `name`
    FROM `meal_items`
    WHERE `meal_items`.`meal_id` = `meals`.`id`
    ORDER BY `meal_items`.`created_at` ASC, `meal_items`.`id` ASC
  ) AS `ordered_items`
)
WHERE `summary` IS NULL;
