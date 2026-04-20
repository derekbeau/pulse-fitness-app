import { eq, isNotNull } from 'drizzle-orm';

import { scheduledWorkouts, workoutTemplates } from '../schema/index.js';
import { writeSnapshot } from '../../routes/scheduled-workouts/snapshot-store.js';

type PulseDb = typeof import('../index.js').db;

type BackfillLogger = {
  info: (message: string) => void;
  warn: (message: string) => void;
};

export type ScheduledWorkoutSnapshotBackfillSummary = {
  processed: number;
  skipped: number;
  snapshotRowsWritten: number;
  setRowsWritten: number;
};

const defaultLogger: BackfillLogger = {
  info: (message) => console.info(message),
  warn: (message) => console.warn(message),
};

export const backfillScheduledWorkoutSnapshots = async ({
  database,
  logger = defaultLogger,
}: {
  database: PulseDb;
  logger?: BackfillLogger;
}): Promise<ScheduledWorkoutSnapshotBackfillSummary> => {
  const scheduledWorkoutRows = database
    .select({
      scheduledWorkoutId: scheduledWorkouts.id,
      templateId: scheduledWorkouts.templateId,
      resolvedTemplateId: workoutTemplates.id,
      templateDeletedAt: workoutTemplates.deletedAt,
    })
    .from(scheduledWorkouts)
    .leftJoin(workoutTemplates, eq(workoutTemplates.id, scheduledWorkouts.templateId))
    .where(isNotNull(scheduledWorkouts.templateId))
    .all();

  let processed = 0;
  let skipped = 0;
  let snapshotRowsWritten = 0;
  let setRowsWritten = 0;

  for (const row of scheduledWorkoutRows) {
    const templateId = row.templateId;
    if (!templateId) {
      skipped += 1;
      continue;
    }

    if (!row.resolvedTemplateId || row.templateDeletedAt !== null) {
      logger.warn(
        `Skipping scheduled workout ${row.scheduledWorkoutId}: template ${templateId} is missing or soft-deleted`,
      );
      skipped += 1;
      continue;
    }

    const snapshotResult = await writeSnapshot({
      scheduledWorkoutId: row.scheduledWorkoutId,
      templateId,
      database,
    });

    processed += 1;
    snapshotRowsWritten += snapshotResult.exerciseCount;
    setRowsWritten += snapshotResult.setCount;
  }

  logger.info(
    `Scheduled workout snapshot backfill complete: processed=${processed}, skipped=${skipped}, exercises=${snapshotRowsWritten}, sets=${setRowsWritten}`,
  );

  return {
    processed,
    skipped,
    snapshotRowsWritten,
    setRowsWritten,
  };
};
