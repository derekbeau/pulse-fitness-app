UPDATE `exercises`
SET `category` = 'isolation'
WHERE `category` = 'mobility'
  AND `name` IN (
    'Band Pull-Aparts',
    'Band Pull-Aparts (Underhand)',
    'Bird Dogs',
    'Dead Bug',
    'Spanish Squat'
  );

--> statement-breakpoint
-- Project taxonomy currently maps accessory core stability work (for example
-- Bird Dogs and Dead Bug) to `isolation` because the enum has no `stability`
-- category yet.
UPDATE `exercises`
SET `category` = 'isolation'
WHERE `name` = 'Single-Leg Glute Bridge'
  AND `category` = 'compound';
