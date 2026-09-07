import { sql } from 'drizzle-orm';

import { meals, nutritionLogs } from './schema/nutrition.js';

// A log can exist solely to hold day context. Only meals or an explicit status
// make it nutrition evidence; clearing its note must not change that decision.
// Keep this predicate independent of the note text and all learning formulas.
export const hasNutritionEvidence = sql`(
  ${nutritionLogs.status} != 'unknown'
  or ${nutritionLogs.statusUpdatedAt} is not null
  or exists (
    select 1 from ${meals}
    where ${meals.nutritionLogId} = ${nutritionLogs.id}
  )
)`;
