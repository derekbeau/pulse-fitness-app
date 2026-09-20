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

export class ScheduledWorkoutGuardConflictError extends Error {}

export const rescheduleScheduledWorkoutGuarded = ({
  sqlite,
  userId,
  scheduledWorkoutId,
  expectedUpdatedAt,
  plannedLocalDate,
}: {
  sqlite: Database.Database;
  userId: string;
  scheduledWorkoutId: string;
  expectedUpdatedAt: number;
  plannedLocalDate: string;
}) => {
  const nextUpdatedAt = Math.max(getApplicationNow().getTime(), expectedUpdatedAt + 1);
  const result = sqlite
    .prepare(
      `update scheduled_workouts set date=?,updated_at=?
        where id=? and user_id=? and updated_at=? and session_id is null`,
    )
    .run(plannedLocalDate, nextUpdatedAt, scheduledWorkoutId, userId, expectedUpdatedAt);
  if (result.changes !== 1) {
    throw new ScheduledWorkoutGuardConflictError('Scheduled workout changed.');
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
  return { id: scheduledWorkoutId, updatedAt: nextUpdatedAt };
};
