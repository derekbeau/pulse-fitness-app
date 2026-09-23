import type Database from 'better-sqlite3';

import { getApplicationNow } from '../../lib/clock.js';

const DAY_MS = 86_400_000;
const toUtcDay = (date: string): number => {
  const [yearText, monthText, dayText] = date.split('-');
  return Math.trunc(
    Date.UTC(
      Number.parseInt(yearText ?? '', 10),
      Number.parseInt(monthText ?? '', 10) - 1,
      Number.parseInt(dayText ?? '', 10),
    ) / DAY_MS,
  );
};

export type ScheduledWorkoutGuardConflictReason =
  | 'stale_revision'
  | 'linked_session'
  | 'ineligible_date';

export class ScheduledWorkoutGuardConflictError extends Error {
  constructor(
    readonly reason: ScheduledWorkoutGuardConflictReason,
    readonly currentUpdatedAt?: number,
  ) {
    super(
      reason === 'stale_revision'
        ? 'Scheduled workout changed.'
        : reason === 'linked_session'
          ? 'Started or completed scheduled workouts cannot be rescheduled.'
          : 'Scheduled workout date is no longer eligible for this change.',
    );
  }
}

export const rescheduleScheduledWorkoutGuarded = ({
  sqlite,
  userId,
  scheduledWorkoutId,
  expectedUpdatedAt,
  minimumLocalDate,
  plannedLocalDate,
}: {
  sqlite: Database.Database;
  userId: string;
  scheduledWorkoutId: string;
  expectedUpdatedAt: number;
  minimumLocalDate?: string;
  plannedLocalDate: string;
}) => {
  const current = sqlite
    .prepare(
      `select date,session_id as sessionId,updated_at as updatedAt
         from scheduled_workouts where id=? and user_id=?`,
    )
    .get(scheduledWorkoutId, userId) as
    | { date: string; sessionId: string | null; updatedAt: number }
    | undefined;
  if (!current || current.updatedAt !== expectedUpdatedAt) {
    throw new ScheduledWorkoutGuardConflictError('stale_revision', current?.updatedAt);
  }
  if (plannedLocalDate === current.date) {
    return { changed: false, id: scheduledWorkoutId, updatedAt: current.updatedAt };
  }
  const reverseLinkedSession = sqlite
    .prepare(
      `select 1 from workout_sessions where user_id=? and scheduled_workout_id=?
       and deleted_at is null and status != 'cancelled' limit 1`,
    )
    .get(userId, scheduledWorkoutId);
  if (current.sessionId !== null || reverseLinkedSession) {
    throw new ScheduledWorkoutGuardConflictError('linked_session', current.updatedAt);
  }
  if (
    minimumLocalDate !== undefined &&
    (current.date < minimumLocalDate || plannedLocalDate < minimumLocalDate)
  ) {
    throw new ScheduledWorkoutGuardConflictError('ineligible_date', current.updatedAt);
  }

  const nextUpdatedAt = Math.max(getApplicationNow().getTime(), expectedUpdatedAt + 1);
  const result = sqlite
    .prepare(
      `update scheduled_workouts set date=?,updated_at=?
        where id=? and user_id=? and date=? and updated_at=? and session_id is null
          and not exists (select 1 from workout_sessions ws where ws.user_id=scheduled_workouts.user_id
            and ws.scheduled_workout_id=scheduled_workouts.id and ws.deleted_at is null and ws.status != 'cancelled')`,
    )
    .run(
      plannedLocalDate,
      nextUpdatedAt,
      scheduledWorkoutId,
      userId,
      current.date,
      expectedUpdatedAt,
    );
  if (result.changes !== 1) {
    const latest = sqlite
      .prepare('select updated_at as updatedAt from scheduled_workouts where id=? and user_id=?')
      .get(scheduledWorkoutId, userId) as { updatedAt: number } | undefined;
    throw new ScheduledWorkoutGuardConflictError('stale_revision', latest?.updatedAt);
  }

  const notes = sqlite
    .prepare(
      `select id,agent_notes_meta as agentNotesMeta from scheduled_workout_exercises
        where scheduled_workout_id=? and agent_notes_meta is not null`,
    )
    .all(scheduledWorkoutId) as Array<{ agentNotesMeta: string; id: string }>;
  const update = sqlite.prepare(
    'update scheduled_workout_exercises set agent_notes_meta=?,updated_at=? where id=?',
  );
  for (const note of notes) {
    const metadata = JSON.parse(note.agentNotesMeta) as {
      scheduledDateAtGeneration: string;
      stale?: boolean;
      [key: string]: unknown;
    };
    if (Math.abs(toUtcDay(plannedLocalDate) - toUtcDay(metadata.scheduledDateAtGeneration)) <= 2) {
      continue;
    }
    update.run(JSON.stringify({ ...metadata, stale: true }), nextUpdatedAt, note.id);
  }
  return { changed: true, id: scheduledWorkoutId, updatedAt: nextUpdatedAt };
};
