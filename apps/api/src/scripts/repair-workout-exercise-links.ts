import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';

import { sqlite } from '../db/index.js';

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
  const rows = sqlite
    .prepare(
      `
      select
        'session_sets' as source,
        ss.id as row_id,
        ss.session_id as owner_id,
        ws.user_id as owner_user_id,
        ss.exercise_id as exercise_id,
        e.user_id as exercise_user_id,
        e.deleted_at as exercise_deleted_at,
        e.name as exercise_name
      from session_sets ss
      inner join workout_sessions ws on ws.id = ss.session_id
      left join exercises e on e.id = ss.exercise_id
      where (? is null or ws.user_id = ?)
        and (
          e.id is null
          or e.deleted_at is not null
          or (e.user_id is not null and e.user_id != ws.user_id)
        )
      union all
      select
        'template_exercises' as source,
        te.id as row_id,
        te.template_id as owner_id,
        wt.user_id as owner_user_id,
        te.exercise_id as exercise_id,
        e.user_id as exercise_user_id,
        e.deleted_at as exercise_deleted_at,
        e.name as exercise_name
      from template_exercises te
      inner join workout_templates wt on wt.id = te.template_id
      left join exercises e on e.id = te.exercise_id
      where (? is null or wt.user_id = ?)
        and (
          e.id is null
          or e.deleted_at is not null
          or (e.user_id is not null and e.user_id != wt.user_id)
        )
      `,
    )
    // Positional bindings:
    // 1-2 => session_sets user filter, 3-4 => template_exercises user filter.
    .all(userId, userId, userId, userId) as Array<{
    source: LinkSource;
    row_id: string;
    owner_id: string;
    owner_user_id: string;
    exercise_id: string;
    exercise_user_id: string | null;
    exercise_deleted_at: string | null;
    exercise_name: string | null;
  }>;

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
