import { randomUUID } from 'node:crypto';

import { sql } from 'drizzle-orm';
import { check, index, integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { scheduledWorkoutExercises } from './scheduled-workout-exercises.js';

export const scheduledWorkoutExerciseSets = sqliteTable(
  'scheduled_workout_exercise_sets',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    scheduledWorkoutExerciseId: text('scheduled_workout_exercise_id')
      .notNull()
      .references(() => scheduledWorkoutExercises.id, { onDelete: 'cascade' }),
    setNumber: integer('set_number').notNull(),
    repsMin: integer('reps_min'),
    repsMax: integer('reps_max'),
    reps: integer('reps'),
    targetWeight: real('target_weight'),
    targetWeightMin: real('target_weight_min'),
    targetWeightMax: real('target_weight_max'),
    targetSeconds: integer('target_seconds'),
    targetDistance: real('target_distance'),
    createdAt: integer('created_at', { mode: 'number' })
      .notNull()
      .default(sql`(unixepoch() * 1000)`)
      .$defaultFn(() => Date.now()),
  },
  (table) => [
    index('scheduled_workout_exercise_sets_exercise_id_idx').on(table.scheduledWorkoutExerciseId),
    check('scheduled_workout_exercise_sets_set_number_check', sql`${table.setNumber} > 0`),
    check(
      'scheduled_workout_exercise_sets_reps_range_check',
      sql`${table.repsMin} is null or ${table.repsMax} is null or ${table.repsMin} <= ${table.repsMax}`,
    ),
    check(
      'scheduled_workout_exercise_sets_target_weight_range_check',
      sql`${table.targetWeightMin} is null or ${table.targetWeightMax} is null or ${table.targetWeightMin} <= ${table.targetWeightMax}`,
    ),
  ],
);
