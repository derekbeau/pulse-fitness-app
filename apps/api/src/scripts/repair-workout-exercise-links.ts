import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

import Database from 'better-sqlite3';
import { z } from 'zod';

type Logger = Pick<Console, 'info'>;
type LinkSource = 'session_sets' | 'template_exercises';

const cloneMappingEntrySchema = z.object({
  exerciseId: z.string().trim().min(1),
  ownerUserId: z.string().trim().min(1),
  sourceExerciseId: z.string().trim().min(1),
  strategy: z.literal('clone'),
});

const relinkMappingEntrySchema = z.object({
  exerciseId: z.string().trim().min(1),
  ownerUserId: z.string().trim().min(1),
  sourceExerciseId: z.string().trim().min(1),
  strategy: z.literal('relink'),
});

const placeholderMappingEntrySchema = z.object({
  category: z.enum(['compound', 'isolation', 'cardio', 'cardio_flow', 'mobility']).optional(),
  equipment: z.string().trim().min(1).max(120).optional(),
  exerciseId: z.string().trim().min(1),
  muscleGroups: z.array(z.string().trim().min(1)).optional(),
  name: z.string().trim().min(1).max(120),
  ownerUserId: z.string().trim().min(1),
  strategy: z.literal('placeholder'),
  trackingType: z
    .enum([
      'weight_reps',
      'weight_seconds',
      'bodyweight_reps',
      'reps_only',
      'reps_seconds',
      'seconds_only',
      'duration',
      'distance',
      'cardio',
    ])
    .optional(),
});

export const workoutExerciseLinkRepairMapSchema = z
  .object({
    entries: z.array(
      z.discriminatedUnion('strategy', [
        cloneMappingEntrySchema,
        relinkMappingEntrySchema,
        placeholderMappingEntrySchema,
      ]),
    ),
    recoveredAt: z.string().datetime({ offset: true }),
    version: z.literal(1),
  })
  .superRefine((value, context) => {
    const seenExerciseIds = new Set<string>();
    for (const [index, entry] of value.entries.entries()) {
      if (seenExerciseIds.has(entry.exerciseId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Duplicate exerciseId in repair map',
          path: ['entries', index, 'exerciseId'],
        });
      }
      seenExerciseIds.add(entry.exerciseId);
    }
  });

export type WorkoutExerciseLinkRepairMap = z.infer<typeof workoutExerciseLinkRepairMapSchema>;

type MissingLinkRow = {
  exerciseId: string;
  ownerUserId: string;
  source: LinkSource;
};

type MissingExercise = {
  exerciseId: string;
  linkCount: number;
  ownerUserIds: Set<string>;
  sessionSetCount: number;
  templateExerciseCount: number;
};

type ResolvedRepair = {
  entry: WorkoutExerciseLinkRepairMap['entries'][number];
  missing: MissingExercise;
};

export type RepairWorkoutExerciseLinksOptions = {
  dryRun: boolean;
  map: WorkoutExerciseLinkRepairMap | null;
  mapSha256?: string | null;
  userId?: string | null;
};

export type RepairWorkoutExerciseLinksResult = {
  alreadyAppliedCount: number;
  dryRun: boolean;
  foreignKeyViolationCountBefore: number;
  mapSha256: string | null;
  missingExerciseCount: number;
  orphanLinkCount: number;
  proposedRepairCount: number;
  remainingForeignKeyViolationCount: number;
  sessionSetOrphanCount: number;
  templateExerciseOrphanCount: number;
  unresolvedExerciseCount: number;
};

class RepairPreflightError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RepairPreflightError';
  }
}

const usage =
  'Usage: pnpm --filter @pulse/api db:repair:workout-exercise-links -- [--dry-run|--apply] --map <path> [--user <userId>]';

const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');

export const loadWorkoutExerciseLinkRepairMap = (
  mapPath: string,
): { map: WorkoutExerciseLinkRepairMap; sha256: string } => {
  const rawMap = readFileSync(mapPath, 'utf8');
  return {
    map: workoutExerciseLinkRepairMapSchema.parse(JSON.parse(rawMap)),
    sha256: sha256(rawMap),
  };
};

const listMissingLinkRows = (sqlite: Database.Database, userId: string | null): MissingLinkRow[] =>
  sqlite
    .prepare(
      `
        select
          'session_sets' as source,
          ss.exercise_id as exerciseId,
          ws.user_id as ownerUserId
        from session_sets ss
        join workout_sessions ws on ws.id = ss.session_id
        left join exercises e on e.id = ss.exercise_id
        where ss.exercise_id is not null
          and e.id is null
          and (? is null or ws.user_id = ?)

        union all

        select
          'template_exercises' as source,
          te.exercise_id as exerciseId,
          wt.user_id as ownerUserId
        from template_exercises te
        join workout_templates wt on wt.id = te.template_id
        left join exercises e on e.id = te.exercise_id
        where e.id is null
          and (? is null or wt.user_id = ?)
      `,
    )
    .all(userId, userId, userId, userId) as MissingLinkRow[];

const groupMissingExercises = (rows: MissingLinkRow[]): MissingExercise[] => {
  const grouped = new Map<string, MissingExercise>();

  for (const row of rows) {
    const missing = grouped.get(row.exerciseId) ?? {
      exerciseId: row.exerciseId,
      linkCount: 0,
      ownerUserIds: new Set<string>(),
      sessionSetCount: 0,
      templateExerciseCount: 0,
    };
    missing.linkCount += 1;
    missing.ownerUserIds.add(row.ownerUserId);
    if (row.source === 'session_sets') {
      missing.sessionSetCount += 1;
    } else {
      missing.templateExerciseCount += 1;
    }
    grouped.set(row.exerciseId, missing);
  }

  return [...grouped.values()];
};

const countForeignKeyViolations = (sqlite: Database.Database): number =>
  (sqlite.prepare('pragma foreign_key_check').all() as unknown[]).length;

const assertQuickCheck = (sqlite: Database.Database): void => {
  const rows = sqlite.prepare('pragma quick_check').all() as Array<{
    quick_check: string;
  }>;
  if (rows.length !== 1 || rows[0]?.quick_check !== 'ok') {
    throw new RepairPreflightError('Refusing workout-link repair because quick_check failed');
  }
};

const assertOnlyTargetViolations = (
  sqlite: Database.Database,
  expectedWorkoutLinkCount: number,
): number => {
  const rows = sqlite.prepare('pragma foreign_key_check').all() as Array<{
    parent: string;
    table: string;
  }>;
  const unexpectedCount = rows.filter(
    (row) =>
      row.parent !== 'exercises' ||
      (row.table !== 'session_sets' && row.table !== 'template_exercises'),
  ).length;

  if (unexpectedCount > 0 || rows.length !== expectedWorkoutLinkCount) {
    throw new RepairPreflightError(
      'Refusing workout-link repair because unrelated or unclassified foreign-key violations exist',
    );
  }

  return rows.length;
};

type ExerciseOwnerRow = {
  deletedAt: string | null;
  userId: string | null;
};

const getExerciseOwner = (
  sqlite: Database.Database,
  exerciseId: string,
): ExerciseOwnerRow | undefined =>
  sqlite
    .prepare(`select user_id as userId, deleted_at as deletedAt from exercises where id = ?`)
    .get(exerciseId) as ExerciseOwnerRow | undefined;

const resolveRepairPlan = ({
  map,
  missingExercises,
  sqlite,
}: {
  map: WorkoutExerciseLinkRepairMap | null;
  missingExercises: MissingExercise[];
  sqlite: Database.Database;
}): {
  alreadyAppliedCount: number;
  repairs: ResolvedRepair[];
  unresolvedExerciseCount: number;
} => {
  const mapEntries = new Map(map?.entries.map((entry) => [entry.exerciseId, entry]) ?? []);
  const repairs: ResolvedRepair[] = [];
  let unresolvedExerciseCount = 0;

  for (const missing of missingExercises) {
    const entry = mapEntries.get(missing.exerciseId);
    if (!entry || missing.ownerUserIds.size !== 1 || !missing.ownerUserIds.has(entry.ownerUserId)) {
      unresolvedExerciseCount += 1;
      continue;
    }

    if (entry.strategy === 'clone' || entry.strategy === 'relink') {
      const source = getExerciseOwner(sqlite, entry.sourceExerciseId);
      if (
        !source ||
        (source.userId !== null && source.userId !== entry.ownerUserId) ||
        (entry.strategy === 'relink' && source.deletedAt !== null)
      ) {
        unresolvedExerciseCount += 1;
        continue;
      }
    }

    repairs.push({ entry, missing });
  }

  let alreadyAppliedCount = 0;
  for (const entry of map?.entries ?? []) {
    if (missingExercises.some((missing) => missing.exerciseId === entry.exerciseId)) {
      continue;
    }

    const existing = getExerciseOwner(sqlite, entry.exerciseId);
    const relinkSource =
      entry.strategy === 'relink' ? getExerciseOwner(sqlite, entry.sourceExerciseId) : undefined;
    if (
      (entry.strategy === 'relink' &&
        !existing &&
        relinkSource &&
        relinkSource.deletedAt === null &&
        (relinkSource.userId === null || relinkSource.userId === entry.ownerUserId)) ||
      (entry.strategy !== 'relink' &&
        existing?.userId === entry.ownerUserId &&
        existing.deletedAt !== null)
    ) {
      alreadyAppliedCount += 1;
      continue;
    }

    unresolvedExerciseCount += 1;
  }

  return { alreadyAppliedCount, repairs, unresolvedExerciseCount };
};

const insertClonedExercise = ({
  entry,
  recoveredAt,
  sqlite,
}: {
  entry: z.infer<typeof cloneMappingEntrySchema>;
  recoveredAt: string;
  sqlite: Database.Database;
}): void => {
  const recoveredAtMs = Date.parse(recoveredAt);
  const result = sqlite
    .prepare(
      `
        insert into exercises (
          id, user_id, name, muscle_groups, equipment, category, tracking_type,
          tags, form_cues, instructions, coaching_notes, related_exercise_ids,
          deleted_at, created_at, updated_at
        )
        select
          ?, ?, name, muscle_groups, equipment, category, tracking_type,
          tags, form_cues, instructions, coaching_notes, json('[]'),
          ?, ?, ?
        from exercises
        where id = ?
          and (user_id is null or user_id = ?)
      `,
    )
    .run(
      entry.exerciseId,
      entry.ownerUserId,
      recoveredAt,
      recoveredAtMs,
      recoveredAtMs,
      entry.sourceExerciseId,
      entry.ownerUserId,
    );

  if (result.changes !== 1) {
    throw new RepairPreflightError('A clone repair source became unavailable during apply');
  }
};

const insertPlaceholderExercise = ({
  entry,
  recoveredAt,
  sqlite,
}: {
  entry: z.infer<typeof placeholderMappingEntrySchema>;
  recoveredAt: string;
  sqlite: Database.Database;
}): void => {
  const recoveredAtMs = Date.parse(recoveredAt);
  sqlite
    .prepare(
      `
        insert into exercises (
          id, user_id, name, muscle_groups, equipment, category, tracking_type,
          tags, form_cues, instructions, coaching_notes, related_exercise_ids,
          deleted_at, created_at, updated_at
        ) values (
          ?, ?, ?, ?, ?, ?, ?,
          json('[]'), json('[]'), ?, null, json('[]'), ?, ?, ?
        )
      `,
    )
    .run(
      entry.exerciseId,
      entry.ownerUserId,
      entry.name,
      JSON.stringify(entry.muscleGroups ?? []),
      entry.equipment ?? 'unknown',
      entry.category ?? 'compound',
      entry.trackingType ?? 'weight_reps',
      'Recovered from an orphaned workout reference; original exercise metadata was unavailable.',
      recoveredAt,
      recoveredAtMs,
      recoveredAtMs,
    );
};

const relinkExerciseReferences = ({
  entry,
  expectedLinkCount,
  sqlite,
}: {
  entry: z.infer<typeof relinkMappingEntrySchema>;
  expectedLinkCount: number;
  sqlite: Database.Database;
}): void => {
  const sessionResult = sqlite
    .prepare(
      `
        update session_sets
        set exercise_id = ?
        where exercise_id = ?
          and exists (
            select 1
            from workout_sessions ws
            where ws.id = session_sets.session_id
              and ws.user_id = ?
          )
      `,
    )
    .run(entry.sourceExerciseId, entry.exerciseId, entry.ownerUserId);
  const templateResult = sqlite
    .prepare(
      `
        update template_exercises
        set exercise_id = ?
        where exercise_id = ?
          and exists (
            select 1
            from workout_templates wt
            where wt.id = template_exercises.template_id
              and wt.user_id = ?
          )
      `,
    )
    .run(entry.sourceExerciseId, entry.exerciseId, entry.ownerUserId);

  if (sessionResult.changes + templateResult.changes !== expectedLinkCount) {
    throw new RepairPreflightError('A relink repair target changed during apply');
  }
};

export const repairWorkoutExerciseLinks = (
  sqlite: Database.Database,
  options: RepairWorkoutExerciseLinksOptions,
  logger: Logger = console,
): RepairWorkoutExerciseLinksResult => {
  const userId = options.userId ?? null;
  const parsedMap = options.map ? workoutExerciseLinkRepairMapSchema.parse(options.map) : null;
  const mapSha256 = parsedMap ? (options.mapSha256 ?? sha256(JSON.stringify(parsedMap))) : null;

  assertQuickCheck(sqlite);
  if (sqlite.pragma('foreign_keys', { simple: true }) !== 1) {
    throw new RepairPreflightError(
      'Refusing workout-link repair while foreign-key enforcement is disabled',
    );
  }

  const missingRows = listMissingLinkRows(sqlite, userId);
  const missingExercises = groupMissingExercises(missingRows);
  const foreignKeyViolationCountBefore = assertOnlyTargetViolations(sqlite, missingRows.length);
  const { alreadyAppliedCount, repairs, unresolvedExerciseCount } = resolveRepairPlan({
    map: parsedMap,
    missingExercises,
    sqlite,
  });

  if (!options.dryRun && unresolvedExerciseCount > 0) {
    throw new RepairPreflightError(
      'Refusing workout-link repair because the explicit map does not resolve every missing exercise',
    );
  }

  let remainingForeignKeyViolationCount = foreignKeyViolationCountBefore;
  if (!options.dryRun && repairs.length > 0) {
    if (!parsedMap) {
      throw new RepairPreflightError('Applying workout-link repair requires an explicit map');
    }

    sqlite.transaction(() => {
      for (const repair of repairs) {
        if (repair.entry.strategy === 'clone') {
          insertClonedExercise({
            entry: repair.entry,
            recoveredAt: parsedMap.recoveredAt,
            sqlite,
          });
        } else if (repair.entry.strategy === 'relink') {
          relinkExerciseReferences({
            entry: repair.entry,
            expectedLinkCount: repair.missing.linkCount,
            sqlite,
          });
        } else {
          insertPlaceholderExercise({
            entry: repair.entry,
            recoveredAt: parsedMap.recoveredAt,
            sqlite,
          });
        }
      }

      remainingForeignKeyViolationCount = countForeignKeyViolations(sqlite);
      if (remainingForeignKeyViolationCount !== 0) {
        throw new RepairPreflightError(
          'Workout-link repair did not clear every foreign-key violation; transaction rolled back',
        );
      }
    })();
  } else if (!options.dryRun) {
    remainingForeignKeyViolationCount = countForeignKeyViolations(sqlite);
  }

  const result: RepairWorkoutExerciseLinksResult = {
    alreadyAppliedCount,
    dryRun: options.dryRun,
    foreignKeyViolationCountBefore,
    mapSha256,
    missingExerciseCount: missingExercises.length,
    orphanLinkCount: missingRows.length,
    proposedRepairCount: repairs.length,
    remainingForeignKeyViolationCount,
    sessionSetOrphanCount: missingRows.filter((row) => row.source === 'session_sets').length,
    templateExerciseOrphanCount: missingRows.filter((row) => row.source === 'template_exercises')
      .length,
    unresolvedExerciseCount,
  };

  logger.info(
    {
      alreadyAppliedCount: result.alreadyAppliedCount,
      dryRun: result.dryRun,
      foreignKeyViolationCountBefore: result.foreignKeyViolationCountBefore,
      mapSha256: result.mapSha256,
      missingExerciseCount: result.missingExerciseCount,
      orphanLinkCount: result.orphanLinkCount,
      proposedRepairCount: result.proposedRepairCount,
      remainingForeignKeyViolationCount: result.remainingForeignKeyViolationCount,
      sessionSetOrphanCount: result.sessionSetOrphanCount,
      templateExerciseOrphanCount: result.templateExerciseOrphanCount,
      unresolvedExerciseCount: result.unresolvedExerciseCount,
    },
    'Workout exercise link repair preflight complete',
  );

  return result;
};

type CliOptions = {
  apply: boolean;
  mapPath: string | null;
  userId: string | null;
};

export const parseRepairWorkoutExerciseLinksCliArgs = (args: string[]): CliOptions => {
  let apply = false;
  let modeSeen = false;
  let mapPath: string | null = null;
  let userId: string | null = null;

  for (let index = 0; index < args.length; index += 1) {
    const current = args[index];
    if (current === '--apply' || current === '--dry-run') {
      if (modeSeen) {
        throw new Error(`Choose exactly one mode. ${usage}`);
      }
      apply = current === '--apply';
      modeSeen = true;
      continue;
    }

    if (current === '--map' || current === '--user') {
      const next = args[index + 1];
      if (!next || next.startsWith('--')) {
        throw new Error(`Missing value for ${current}. ${usage}`);
      }
      if (current === '--map') {
        mapPath = next;
      } else {
        userId = next;
      }
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument. ${usage}`);
  }

  if (!mapPath) {
    throw new Error(`An explicit repair map is required. ${usage}`);
  }

  return { apply, mapPath, userId };
};

const runCli = async (): Promise<void> => {
  const cli = parseRepairWorkoutExerciseLinksCliArgs(process.argv.slice(2));
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL must explicitly identify the database to inspect or repair');
  }

  const loadedMap = loadWorkoutExerciseLinkRepairMap(cli.mapPath ?? '');
  const sqlite = new Database(databaseUrl, {
    fileMustExist: true,
    readonly: !cli.apply,
  });
  sqlite.pragma('foreign_keys = ON');

  try {
    const result = repairWorkoutExerciseLinks(
      sqlite,
      {
        dryRun: !cli.apply,
        map: loadedMap.map,
        mapSha256: loadedMap.sha256,
        userId: cli.userId,
      },
      console,
    );

    if (result.unresolvedExerciseCount > 0) {
      process.exitCode = 2;
    }
  } finally {
    sqlite.close();
  }
};

const isMainModule = (): boolean =>
  Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1] ?? '').href;

if (isMainModule()) {
  runCli().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'Workout exercise link repair failed');
    process.exitCode = 1;
  });
}
