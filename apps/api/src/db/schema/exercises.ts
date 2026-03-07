import { randomUUID } from 'node:crypto';

import { sql } from 'drizzle-orm';
import { check, index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { users } from './users.js';

export type WorkoutExerciseCategory =
  | 'compound'
  | 'isolation'
  | 'cardio'
  | 'mobility';

export const exercises = sqliteTable(
  'exercises',
  {
    id: text('id').primaryKey().$defaultFn(() => randomUUID()),
    userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    muscleGroups: text('muscle_groups').$type<string[]>().notNull(),
    equipment: text('equipment').notNull(),
    category: text('category').$type<WorkoutExerciseCategory>().notNull(),
    instructions: text('instructions'),
    createdAt: integer('created_at', { mode: 'number' })
      .notNull()
      .default(sql`(unixepoch() * 1000)`)
      .$defaultFn(() => Date.now()),
  },
  (table) => [
    index('exercises_user_id_idx').on(table.userId),
    check(
      'exercises_category_check',
      sql`${table.category} in ('compound', 'isolation', 'cardio', 'mobility')`,
    ),
  ],
);
