import { randomUUID } from 'node:crypto';

import { sql } from 'drizzle-orm';
import { check, index, integer, real, sqliteTable, text, unique } from 'drizzle-orm/sqlite-core';

import { exercises } from './exercises.js';
import type { WorkoutTemplateSectionType } from './workout-templates.js';
import { workoutTemplates } from './workout-templates.js';
import { users } from './users.js';

export type WorkoutSessionStatus =
  | 'scheduled'
  | 'in-progress'
  | 'paused'
  | 'cancelled'
  | 'completed';

export type WorkoutSessionTimeSegment = {
  start: string;
  end: string | null;
};

export type WorkoutSessionFeedback = {
  energy: 1 | 2 | 3 | 4 | 5;
  recovery: 1 | 2 | 3 | 4 | 5;
  technique: 1 | 2 | 3 | 4 | 5;
  notes?: string;
  responses?: Array<
    | {
        id: string;
        label: string;
        type: 'scale' | 'slider';
        value: number;
        notes?: string;
      }
    | {
        id: string;
        label: string;
        type: 'yes_no';
        value: boolean;
        notes?: string;
      }
    | {
        id: string;
        label: string;
        type: 'emoji';
        value: string;
        notes?: string;
      }
    | {
        id: string;
        label: string;
        type: 'text';
        value: string | null;
        notes?: string;
      }
    | {
        id: string;
        label: string;
        type: 'multi_select';
        value: string[];
        notes?: string;
      }
  >;
};

export const workoutSessions = sqliteTable(
  'workout_sessions',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    templateId: text('template_id').references(() => workoutTemplates.id, {
      onDelete: 'set null',
    }),
    name: text('name').notNull(),
    date: text('date').notNull(),
    status: text('status').$type<WorkoutSessionStatus>().notNull().default('in-progress'),
    startedAt: integer('started_at', { mode: 'number' }).notNull(),
    completedAt: integer('completed_at', { mode: 'number' }),
    duration: integer('duration', { mode: 'number' }).$type<number>(),
    // JSON-encoded WorkoutSessionTimeSegment[]; use the serializer helpers when reading or writing.
    timeSegments: text('time_segments').notNull().default('[]').$type<string>(),
    // JSON-encoded WorkoutSessionFeedback; use the serializer helpers when reading or writing.
    feedback: text('feedback'),
    notes: text('notes'),
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
    index('workout_sessions_user_id_idx').on(table.userId),
    index('workout_sessions_date_idx').on(table.date),
    check(
      'workout_sessions_date_format_check',
      sql`${table.date} glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'`,
    ),
    check(
      'workout_sessions_status_check',
      sql`${table.status} in ('scheduled', 'in-progress', 'paused', 'cancelled', 'completed')`,
    ),
    check(
      'workout_sessions_completed_at_check',
      sql`(${table.status} != 'completed' or ${table.completedAt} is not null) and (${table.completedAt} is null or ${table.completedAt} >= ${table.startedAt})`,
    ),
  ],
);

export const sessionSets = sqliteTable(
  'session_sets',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    sessionId: text('session_id')
      .notNull()
      .references(() => workoutSessions.id, { onDelete: 'cascade' }),
    exerciseId: text('exercise_id')
      .notNull()
      .references(() => exercises.id, { onDelete: 'restrict' }),
    setNumber: integer('set_number').notNull(),
    weight: real('weight'),
    reps: integer('reps'),
    completed: integer('completed', { mode: 'boolean' }).notNull().default(false),
    skipped: integer('skipped', { mode: 'boolean' }).notNull().default(false),
    section: text('section').$type<WorkoutTemplateSectionType>(),
    notes: text('notes'),
    createdAt: integer('created_at', { mode: 'number' })
      .notNull()
      .default(sql`(unixepoch() * 1000)`)
      .$defaultFn(() => Date.now()),
  },
  (table) => [
    index('session_sets_session_id_idx').on(table.sessionId),
    unique('session_sets_session_exercise_set_number_unique').on(
      table.sessionId,
      table.exerciseId,
      table.setNumber,
    ),
    check('session_sets_set_number_check', sql`${table.setNumber} > 0`),
    check(
      'session_sets_section_check',
      sql`${table.section} is null or ${table.section} in ('warmup', 'main', 'cooldown')`,
    ),
    check(
      'session_sets_completion_state_check',
      sql`not (${table.completed} and ${table.skipped})`,
    ),
  ],
);
