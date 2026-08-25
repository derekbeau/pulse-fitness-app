import type Database from 'better-sqlite3';

import { adaptiveProgramCalculationSchema, type AdaptiveProgramCalculation } from '@pulse/shared';

export type UnresolvedProgramRevision = {
  id: string;
  programId?: string;
  userId?: string;
  sequence: number;
  effectiveAt: number;
  snapshot: AdaptiveProgramCalculation;
  createdAt?: number;
};

export type EffectiveProgramRevision = UnresolvedProgramRevision & {
  effectiveLocalDate: string;
};

type RawRevision = Omit<UnresolvedProgramRevision, 'snapshot'> & {
  programId: string;
  userId: string;
  snapshot: string | unknown;
  createdAt: number;
};

export type ProgramRevisionProjectionRow = EffectiveProgramRevision & {
  programId: string;
  userId: string;
  createdAt: number;
};

export const getDateKeyInTimeZone = (date: Date, timeZone: string) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;
  if (!year || !month || !day) throw new RangeError('Unable to format program time zone');
  return `${year}-${month}-${day}`;
};

export const resolveNextEffectiveProgramRevision = (
  previous: EffectiveProgramRevision | undefined,
  revision: UnresolvedProgramRevision,
): EffectiveProgramRevision => {
  const expectedSequence = (previous?.sequence ?? 0) + 1;
  if (revision.sequence !== expectedSequence) {
    throw new Error('Adaptive nutrition program revision sequence is not contiguous');
  }
  if (previous && revision.effectiveAt < previous.effectiveAt) {
    throw new Error('Adaptive nutrition program revision timestamps are not causal');
  }
  const effectiveAt = new Date(revision.effectiveAt);
  const candidateDates = [getDateKeyInTimeZone(effectiveAt, revision.snapshot.timeZone)];
  if (previous) {
    candidateDates.push(
      previous.effectiveLocalDate,
      getDateKeyInTimeZone(effectiveAt, previous.snapshot.timeZone),
    );
  }
  return {
    ...revision,
    effectiveLocalDate: candidateDates.reduce((latest, candidate) =>
      candidate > latest ? candidate : latest,
    ),
  };
};

export const resolveEffectiveProgramRevisions = (
  revisions: UnresolvedProgramRevision[],
): EffectiveProgramRevision[] => {
  const resolved: EffectiveProgramRevision[] = [];
  for (const revision of revisions) {
    resolved.push(resolveNextEffectiveProgramRevision(resolved.at(-1), revision));
  }
  return resolved;
};

const parseRawRevision = (
  revision: RawRevision,
): UnresolvedProgramRevision & {
  programId: string;
  userId: string;
  createdAt: number;
} => ({
  ...revision,
  snapshot: adaptiveProgramCalculationSchema.parse(
    typeof revision.snapshot === 'string' ? JSON.parse(revision.snapshot) : revision.snapshot,
  ),
});

export const planAdaptiveProgramRevisionProjection = (
  sqlite: Database.Database,
): ProgramRevisionProjectionRow[] => {
  const raw = sqlite
    .prepare(
      `select id,
              program_id as programId,
              user_id as userId,
              sequence,
              effective_at as effectiveAt,
              snapshot,
              created_at as createdAt
         from adaptive_nutrition_program_revisions
        order by program_id, sequence`,
    )
    .all() as RawRevision[];

  const expected: ProgramRevisionProjectionRow[] = [];
  let currentProgramId: string | undefined;
  let current: EffectiveProgramRevision | undefined;
  for (const rawRevision of raw) {
    const revision = parseRawRevision(rawRevision);
    if (currentProgramId !== revision.programId) {
      currentProgramId = revision.programId;
      current = undefined;
    }
    current = resolveNextEffectiveProgramRevision(current, revision);
    expected.push(current as ProgramRevisionProjectionRow);
  }

  return expected;
};

const readProjectionRows = (sqlite: Database.Database) =>
  sqlite
    .prepare(
      `select revision_id as revisionId,
              program_id as programId,
              user_id as userId,
              sequence,
              effective_local_date as effectiveLocalDate,
              created_at as createdAt
         from adaptive_nutrition_program_revision_dates
        order by program_id, sequence`,
    )
    .all() as Array<{
    revisionId: string;
    programId: string;
    userId: string;
    sequence: number;
    effectiveLocalDate: string;
    createdAt: number;
  }>;

export const assertAdaptiveProgramRevisionProjection = (
  sqlite: Database.Database,
  expected = planAdaptiveProgramRevisionProjection(sqlite),
) => {
  const existing = readProjectionRows(sqlite);
  if (existing.length !== expected.length) {
    throw new Error('Adaptive nutrition program revision projection row count is inconsistent');
  }
  for (let index = 0; index < expected.length; index += 1) {
    const source = expected[index];
    const projection = existing[index];
    if (
      !source ||
      !projection ||
      source.id !== projection.revisionId ||
      source.programId !== projection.programId ||
      source.userId !== projection.userId ||
      source.sequence !== projection.sequence ||
      source.effectiveLocalDate !== projection.effectiveLocalDate ||
      source.createdAt !== projection.createdAt
    ) {
      throw new Error('Adaptive nutrition program revision projection is inconsistent');
    }
  }
  return { revisions: expected.length };
};

export const populateAdaptiveProgramRevisionProjection = (
  sqlite: Database.Database,
  expected: ProgramRevisionProjectionRow[],
) => {
  const existing = readProjectionRows(sqlite);
  const expectedById = new Map(expected.map((entry) => [entry.id, entry]));
  for (const row of existing) {
    const match = expectedById.get(row.revisionId);
    if (
      !match ||
      match.programId !== row.programId ||
      match.userId !== row.userId ||
      match.sequence !== row.sequence ||
      match.effectiveLocalDate !== row.effectiveLocalDate ||
      match.createdAt !== row.createdAt
    ) {
      throw new Error('Adaptive nutrition program revision projection is inconsistent');
    }
  }

  const existingIds = new Set(existing.map((entry) => entry.revisionId));
  const insert = sqlite.prepare(
    `insert into adaptive_nutrition_program_revision_dates (
       revision_id, program_id, user_id, sequence, effective_local_date, created_at
     ) values (@revisionId, @programId, @userId, @sequence, @effectiveLocalDate, @createdAt)`,
  );
  let inserted = 0;
  for (const entry of expected) {
    if (existingIds.has(entry.id)) continue;
    insert.run({
      revisionId: entry.id,
      programId: entry.programId,
      userId: entry.userId,
      sequence: entry.sequence,
      effectiveLocalDate: entry.effectiveLocalDate,
      createdAt: entry.createdAt,
    });
    inserted += 1;
  }
  assertAdaptiveProgramRevisionProjection(sqlite, expected);
  return { inserted, revisions: expected.length };
};

export const backfillAdaptiveProgramRevisionProjection = (sqlite: Database.Database) => {
  const expected = planAdaptiveProgramRevisionProjection(sqlite);

  const transaction = sqlite.transaction(() =>
    populateAdaptiveProgramRevisionProjection(sqlite, expected),
  );

  return transaction.immediate();
};

export const insertAdaptiveProgramRevisionProjection = (
  sqlite: Database.Database,
  revision: UnresolvedProgramRevision & { programId: string; userId: string; createdAt: number },
) => {
  const previousRow = sqlite
    .prepare(
      `select revision.id,
              revision.program_id as programId,
              revision.user_id as userId,
              revision.sequence,
              revision.effective_at as effectiveAt,
              revision.snapshot,
              revision.created_at as createdAt,
              projection.effective_local_date as effectiveLocalDate
         from adaptive_nutrition_program_revision_dates projection
         join adaptive_nutrition_program_revisions revision
           on revision.id = projection.revision_id
        where projection.user_id = @userId
          and projection.program_id = @programId
        order by projection.sequence desc
        limit 1`,
    )
    .get({ programId: revision.programId, userId: revision.userId }) as
    | (RawRevision & { effectiveLocalDate: string })
    | undefined;
  const previous = previousRow
    ? ({
        ...parseRawRevision(previousRow),
        effectiveLocalDate: previousRow.effectiveLocalDate,
      } satisfies EffectiveProgramRevision)
    : undefined;
  const resolved = resolveNextEffectiveProgramRevision(previous, revision);
  sqlite
    .prepare(
      `insert into adaptive_nutrition_program_revision_dates (
         revision_id, program_id, user_id, sequence, effective_local_date, created_at
       ) values (@revisionId, @programId, @userId, @sequence, @effectiveLocalDate, @createdAt)`,
    )
    .run({
      revisionId: resolved.id,
      programId: resolved.programId,
      userId: resolved.userId,
      sequence: resolved.sequence,
      effectiveLocalDate: resolved.effectiveLocalDate,
      createdAt: resolved.createdAt,
    });
  return resolved;
};
