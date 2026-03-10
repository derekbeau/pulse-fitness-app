import { randomUUID } from 'node:crypto';

import { sql } from 'drizzle-orm';
import { check, index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { users } from './users.js';

export type WorkoutExerciseCategory = 'compound' | 'isolation' | 'cardio' | 'mobility';
export type WorkoutExerciseTrackingType =
  | 'weight_reps'
  | 'weight_seconds'
  | 'bodyweight_reps'
  | 'reps_only'
  | 'reps_seconds'
  | 'seconds_only'
  | 'distance'
  | 'cardio';

export const exercises = sqliteTable(
  'exercises',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    // Null userId rows belong to the shared exercise library and should be included in user list queries.
    userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    muscleGroups: text('muscle_groups', { mode: 'json' }).$type<string[]>().notNull(),
    equipment: text('equipment').notNull(),
    category: text('category').$type<WorkoutExerciseCategory>().notNull(),
    trackingType: text('tracking_type')
      .$type<WorkoutExerciseTrackingType>()
      .notNull()
      .default('weight_reps'),
    instructions: text('instructions'),
    createdAt: integer('created_at', { mode: 'number' })
      .notNull()
      .default(sql`(unixepoch() * 1000)`)
      .$defaultFn(() => Date.now()),
    updatedAt: integer('updated_at', { mode: 'number' })
      .notNull()
      .default(sql`(unixepoch() * 1000)`)
      .$defaultFn(() => Date.now())
      .$onUpdateFn(() => Date.now()),
  },
  (table) => [
    index('exercises_user_id_idx').on(table.userId),
    check(
      'exercises_category_check',
      sql`${table.category} in ('compound', 'isolation', 'cardio', 'mobility')`,
    ),
  ],
);
