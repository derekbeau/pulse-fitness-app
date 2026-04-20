import { randomUUID } from 'node:crypto';

import { sql } from 'drizzle-orm';
import { check, index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { exercises } from './exercises.js';
import type { WorkoutTemplateSectionType } from './workout-templates.js';
import { scheduledWorkouts } from './scheduled-workouts.js';

export type ScheduledWorkoutExerciseAgentNotesMeta = {
  author: string;
  generatedAt: string;
  scheduledDateAtGeneration: string;
  stale?: boolean;
};

export const scheduledWorkoutExercises = sqliteTable(
  'scheduled_workout_exercises',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    scheduledWorkoutId: text('scheduled_workout_id')
      .notNull()
      .references(() => scheduledWorkouts.id, { onDelete: 'cascade' }),
    exerciseId: text('exercise_id')
      .notNull()
      .references(() => exercises.id, { onDelete: 'restrict' }),
    section: text('section').$type<WorkoutTemplateSectionType>().notNull(),
    orderIndex: integer('order_index').notNull(),
    programmingNotes: text('programming_notes'),
    agentNotes: text('agent_notes'),
    agentNotesMeta: text('agent_notes_meta', {
      mode: 'json',
    }).$type<ScheduledWorkoutExerciseAgentNotesMeta | null>(),
    templateCues: text('template_cues', { mode: 'json' }).$type<string[] | null>(),
    supersetGroup: text('superset_group'),
    tempo: text('tempo'),
    restSeconds: integer('rest_seconds'),
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
    index('scheduled_workout_exercises_scheduled_workout_id_idx').on(table.scheduledWorkoutId),
    index('scheduled_workout_exercises_exercise_id_idx').on(table.exerciseId),
    check(
      'scheduled_workout_exercises_section_check',
      sql`${table.section} in ('warmup', 'main', 'cooldown', 'supplemental')`,
    ),
  ],
);
