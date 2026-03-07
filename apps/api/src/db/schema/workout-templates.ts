import { randomUUID } from 'node:crypto';

import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  sqliteTable,
  text,
  unique,
} from 'drizzle-orm/sqlite-core';

import { exercises } from './exercises.js';
import { users } from './users.js';

export type WorkoutTemplateSectionType = 'warmup' | 'main' | 'cooldown';

export const workoutTemplates = sqliteTable(
  'workout_templates',
  {
    id: text('id').primaryKey().$defaultFn(() => randomUUID()),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description'),
    tags: text('tags').$type<string[]>().notNull(),
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
  (table) => [index('workout_templates_user_id_idx').on(table.userId)],
);

export const templateExercises = sqliteTable(
  'template_exercises',
  {
    id: text('id').primaryKey().$defaultFn(() => randomUUID()),
    templateId: text('template_id')
      .notNull()
      .references(() => workoutTemplates.id, { onDelete: 'cascade' }),
    exerciseId: text('exercise_id')
      .notNull()
      .references(() => exercises.id, { onDelete: 'restrict' }),
    orderIndex: integer('order_index').notNull(),
    sets: integer('sets'),
    repsMin: integer('reps_min'),
    repsMax: integer('reps_max'),
    tempo: text('tempo'),
    restSeconds: integer('rest_seconds'),
    supersetGroup: text('superset_group'),
    section: text('section').$type<WorkoutTemplateSectionType>().notNull(),
    notes: text('notes'),
    cues: text('cues').$type<string[]>(),
  },
  (table) => [
    index('template_exercises_template_id_idx').on(table.templateId),
    index('template_exercises_exercise_id_idx').on(table.exerciseId),
    unique('template_exercises_template_section_order_unique').on(
      table.templateId,
      table.section,
      table.orderIndex,
    ),
    check(
      'template_exercises_section_check',
      sql`${table.section} in ('warmup', 'main', 'cooldown')`,
    ),
    check(
      'template_exercises_reps_range_check',
      sql`${table.repsMin} is null or ${table.repsMax} is null or ${table.repsMin} <= ${table.repsMax}`,
    ),
  ],
);
