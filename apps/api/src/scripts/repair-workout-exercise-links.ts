import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';

import { and, eq, isNotNull, isNull, ne, or, sql } from 'drizzle-orm';

import { db, sqlite } from '../db/index.js';
import {
  exercises,
  sessionSets,
  templateExercises,
  workoutSessions,
  workoutTemplates,
} from '../db/schema/index.js';

type Logger = Pick<Console, 'info' | 'warn' | 'error'>;

type LinkSource = 'session_sets' | 'template_exercises';

type OrphanLinkRow = {
  source: LinkSource;
  rowId: string;
  ownerId: string;
  ownerUserId: string;
  exerciseId: string;
  exerciseUserId: string | null;
  exerciseDeletedAt: string | null;
  exerciseName: string | null;
};

type RepairAction = 'restored-soft-deleted' | 'relinked-by-name' | 'created-placeholder' | 'manual-review';

type RepairResultRow = {
  source: LinkSource;
  rowId: string;
  ownerUserId: string;
  previousExerciseId: string;
  nextExerciseId: string;
  action: RepairAction;
  note: string;
};

export type RepairWorkoutExerciseLinksOptions = {
  userId: string | null;
  dryRun: boolean;
};

export type RepairWorkoutExerciseLinksResult = {
  dryRun: boolean;
  orphanCount: number;
  repairedCount: number;
  manualReviewCount: number;
  results: RepairResultRow[];
};

const usage =
  'Usage: npx tsx src/scripts/repair-workout-exercise-links.ts [--user <userId>] [--dry-run]';

const toTitleCase = (value: string): string =>
  value
    .split(' ')
    .filter((part) => part.length > 0)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');

const deriveExerciseNameFromId = (exerciseId: string): string => {
  const normalized = exerciseId
    .trim()
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (normalized.length === 0) {
    return 'Recovered Exercise';
  }

  return toTitleCase(normalized);
};

const normalizedName = (name: string) => name.trim().toLowerCase();

const parseCliArgs = (args: string[]): RepairWorkoutExerciseLinksOptions => {
  let userId: string | null = null;
  let dryRun = false;

  for (let index = 0; index < args.length; index += 1) {
    const current = args[index];

    if (current === '--dry-run') {
      dryRun = true;
      continue;
    }

    if (current === '--user') {
      const next = args[index + 1];
      if (!next || next.startsWith('--')) {
        throw new Error(`Missing value for --user. ${usage}`);
      }

      userId = next;
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${current}. ${usage}`);
  }

  return {
    userId,
    dryRun,
  };
};

const listOrphanRows = (userId: string | null): OrphanLinkRow[] => {
  const sessionSetOrphans = db
    .select({
      source: sql<LinkSource>`'session_sets'`.as('source'),
      row_id: sessionSets.id,
      owner_id: sessionSets.sessionId,
      owner_user_id: workoutSessions.userId,
      exercise_id: sessionSets.exerciseId,
      exercise_user_id: exercises.userId,
      exercise_deleted_at: exercises.deletedAt,
      exercise_name: exercises.name,
    })
    .from(sessionSets)
    .innerJoin(workoutSessions, eq(workoutSessions.id, sessionSets.sessionId))
    .leftJoin(exercises, eq(exercises.id, sessionSets.exerciseId))
    .where(
      and(
        userId ? eq(workoutSessions.userId, userId) : undefined,
        or(
          isNull(exercises.id),
          isNotNull(exercises.deletedAt),
          and(isNotNull(exercises.userId), ne(exercises.userId, workoutSessions.userId)),
        ),
      ),
    );

  const templateExerciseOrphans = db
    .select({
      source: sql<LinkSource>`'template_exercises'`.as('source'),
      row_id: templateExercises.id,
      owner_id: templateExercises.templateId,
      owner_user_id: workoutTemplates.userId,
      exercise_id: templateExercises.exerciseId,
      exercise_user_id: exercises.userId,
      exercise_deleted_at: exercises.deletedAt,
      exercise_name: exercises.name,
    })
    .from(templateExercises)
    .innerJoin(workoutTemplates, eq(workoutTemplates.id, templateExercises.templateId))
    .leftJoin(exercises, eq(exercises.id, templateExercises.exerciseId))
    .where(
      and(
        userId ? eq(workoutTemplates.userId, userId) : undefined,
        or(
          isNull(exercises.id),
          isNotNull(exercises.deletedAt),
          and(isNotNull(exercises.userId), ne(exercises.userId, workoutTemplates.userId)),
        ),
      ),
    );

  const rows = sessionSetOrphans.unionAll(templateExerciseOrphans).all();

  return rows.map((row) => ({
    source: row.source,
    rowId: row.row_id,
    ownerId: row.owner_id,
    ownerUserId: row.owner_user_id,
    exerciseId: row.exercise_id,
    exerciseUserId: row.exercise_user_id,
    exerciseDeletedAt: row.exercise_deleted_at,
    exerciseName: row.exercise_name,
  }));
};

const restoreExercise = (exerciseId: string) => {
  sqlite
    .prepare(
      `
      update exercises
      set deleted_at = null
      where id = ?
      `,
    )
    .run(exerciseId);
};

const relinkRow = ({ source, rowId, nextExerciseId }: { source: LinkSource; rowId: string; nextExerciseId: string }) => {
  if (source === 'session_sets') {
    sqlite
      .prepare(
        `
        update session_sets
        set exercise_id = ?
        where id = ?
        `,
      )
      .run(nextExerciseId, rowId);
    return;
  }

  sqlite
    .prepare(
      `
      update template_exercises
      set exercise_id = ?
      where id = ?
      `,
    )
    .run(nextExerciseId, rowId);
};

const findCandidateByName = ({
  name,
  ownerUserId,
}: {
  name: string;
  ownerUserId: string;
}): { id: string; deletedAt: string | null } | undefined => {
  const candidate = sqlite
    .prepare(
      `
      select id, deleted_at
      from exercises
      where lower(trim(name)) = ?
        and (user_id is null or user_id = ?)
      order by
        case when user_id = ? then 0 else 1 end,
        case when deleted_at is null then 0 else 1 end
      limit 1
      `,
    )
    .get(normalizedName(name), ownerUserId, ownerUserId) as
    | {
        id: string;
        deleted_at: string | null;
      }
    | undefined;

  if (!candidate) {
    return undefined;
  }

  return {
    id: candidate.id,
    deletedAt: candidate.deleted_at,
  };
};

const createPlaceholderExercise = ({
  ownerUserId,
  exerciseName,
}: {
  ownerUserId: string;
  exerciseName: string;
}): string => {
  const id = randomUUID();

  sqlite
    .prepare(
      `
      insert into exercises (
        id,
        user_id,
        name,
        muscle_groups,
        equipment,
        category,
        tracking_type,
        tags,
        form_cues,
        instructions
      ) values (?, ?, ?, json('[]'), 'unknown', 'compound', 'weight_reps', json('[]'), json('[]'), null)
      `,
    )
    // Use 'compound' as a neutral fallback for unknown legacy exercises.
    .run(id, ownerUserId, exerciseName);

  return id;
};

export const repairWorkoutExerciseLinks = async (
  options: RepairWorkoutExerciseLinksOptions,
  logger: Logger = console,
): Promise<RepairWorkoutExerciseLinksResult> => {
  if (options.dryRun) {
    sqlite.exec('BEGIN');
  }

  const results: RepairResultRow[] = [];

  try {
    const orphanRows = listOrphanRows(options.userId);

    for (const row of orphanRows) {
      const crossUserReference =
        row.exerciseUserId !== null && row.exerciseUserId !== row.ownerUserId;
      const canRestoreOriginal =
        row.exerciseDeletedAt !== null &&
        (row.exerciseUserId === null || row.exerciseUserId === row.ownerUserId);

      if (canRestoreOriginal) {
        restoreExercise(row.exerciseId);
        results.push({
          source: row.source,
          rowId: row.rowId,
          ownerUserId: row.ownerUserId,
          previousExerciseId: row.exerciseId,
          nextExerciseId: row.exerciseId,
          action: 'restored-soft-deleted',
          note: 'Restored soft-deleted exercise referenced by workout row.',
        });
        continue;
      }

      const nameHint =
        row.exerciseName && row.exerciseName.trim().length > 0
          ? row.exerciseName
          : deriveExerciseNameFromId(row.exerciseId);
      const candidate = findCandidateByName({
        name: nameHint,
        ownerUserId: row.ownerUserId,
      });

      if (candidate) {
        if (candidate.deletedAt !== null) {
          restoreExercise(candidate.id);
        }

        try {
          relinkRow({
            source: row.source,
            rowId: row.rowId,
            nextExerciseId: candidate.id,
          });
          results.push({
            source: row.source,
            rowId: row.rowId,
            ownerUserId: row.ownerUserId,
            previousExerciseId: row.exerciseId,
            nextExerciseId: candidate.id,
            action: 'relinked-by-name',
            note: crossUserReference
              ? 'Cross-user reference detected; relinked by exercise name match for owner scope.'
              : 'Relinked by exercise name match.',
          });
        } catch (error) {
          results.push({
            source: row.source,
            rowId: row.rowId,
            ownerUserId: row.ownerUserId,
            previousExerciseId: row.exerciseId,
            nextExerciseId: row.exerciseId,
            action: 'manual-review',
            note: `Relink failed and requires manual review: ${String(error)}`,
          });
        }
        continue;
      }

      const placeholderId = createPlaceholderExercise({
        ownerUserId: row.ownerUserId,
        exerciseName: nameHint,
      });

      try {
        relinkRow({
          source: row.source,
          rowId: row.rowId,
          nextExerciseId: placeholderId,
        });
        results.push({
          source: row.source,
          rowId: row.rowId,
          ownerUserId: row.ownerUserId,
          previousExerciseId: row.exerciseId,
          nextExerciseId: placeholderId,
          action: 'created-placeholder',
          note: crossUserReference
            ? 'Cross-user reference detected; created owner-scoped placeholder and relinked orphan row.'
            : 'Created placeholder exercise and relinked orphan row.',
        });
      } catch (error) {
        // Best effort cleanup: don't leave a newly created placeholder orphaned
        // when the follow-up relink fails.
        sqlite
          .prepare(
            `
            delete from exercises
            where id = ?
            `,
          )
          .run(placeholderId);
        results.push({
          source: row.source,
          rowId: row.rowId,
          ownerUserId: row.ownerUserId,
          previousExerciseId: row.exerciseId,
          nextExerciseId: row.exerciseId,
          action: 'manual-review',
          note: `Placeholder relink failed and requires manual review: ${String(error)}`,
        });
      }
    }

    if (options.dryRun) {
      sqlite.exec('ROLLBACK');
    }

    const summary = {
      dryRun: options.dryRun,
      orphanCount: orphanRows.length,
      repairedCount: results.filter((result) => result.action !== 'manual-review').length,
      manualReviewCount: results.filter((result) => result.action === 'manual-review').length,
      results,
    };

    logger.info(
      `Workout exercise link repair complete: ${summary.orphanCount} orphan rows, ${summary.repairedCount} repaired, ${summary.manualReviewCount} manual review.`,
    );

    return summary;
  } catch (error) {
    if (options.dryRun) {
      sqlite.exec('ROLLBACK');
    }
    throw error;
  }
};

const runCli = async () => {
  const options = parseCliArgs(process.argv.slice(2));
  const result = await repairWorkoutExerciseLinks(options, console);

  if (result.results.length > 0) {
    for (const row of result.results) {
      console.info(
        `[${row.source}] row=${row.rowId} user=${row.ownerUserId} ${row.previousExerciseId} -> ${row.nextExerciseId} (${row.action})`,
      );
    }
  }
};

const isMainModule = () => {
  if (!process.argv[1]) {
    return false;
  }

  return import.meta.url === pathToFileURL(process.argv[1]).href;
};

if (isMainModule()) {
  runCli().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
