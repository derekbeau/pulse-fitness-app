import type Database from 'better-sqlite3';

type ForeignKeyCheckRow = {
  fkid: number;
  parent: string;
  rowid: number | null;
  table: string;
};

export type DatabaseIntegrityReport = {
  foreignKeyEnforcementEnabled: boolean;
  foreignKeyViolationCount: number;
  foreignKeyViolationsByRelation: Array<{
    childTable: string;
    count: number;
    parentTable: string;
  }>;
  ownershipViolationCount: number;
  ownershipViolationsByRelation: Array<{
    relation: 'session_sets.exercise_id' | 'template_exercises.exercise_id';
    count: number;
  }>;
  quickCheck: string[];
};

export class DatabaseIntegrityError extends Error {
  readonly report: DatabaseIntegrityReport;
  readonly stage: string;

  constructor(stage: string, report: DatabaseIntegrityReport) {
    super(
      `Database integrity check failed during ${stage}: quick_check=${report.quickCheck.join(',')}; ` +
        `foreign_key_violations=${report.foreignKeyViolationCount}; ` +
        `ownership_violations=${report.ownershipViolationCount}; ` +
        `foreign_keys=${report.foreignKeyEnforcementEnabled ? 'on' : 'off'}`,
    );
    this.name = 'DatabaseIntegrityError';
    this.report = report;
    this.stage = stage;
  }
}

const tableExists = (sqlite: Database.Database, tableName: string): boolean =>
  Boolean(
    sqlite
      .prepare(`select 1 from sqlite_master where type = 'table' and name = ? limit 1`)
      .get(tableName),
  );

const inspectWorkoutExerciseOwnership = (
  sqlite: Database.Database,
): DatabaseIntegrityReport['ownershipViolationsByRelation'] => {
  const requiredTables = [
    'exercises',
    'session_sets',
    'template_exercises',
    'workout_sessions',
    'workout_templates',
  ];
  if (!requiredTables.every((tableName) => tableExists(sqlite, tableName))) {
    return [];
  }

  const sessionCount = sqlite
    .prepare(
      `
        select count(*) as count
        from session_sets ss
        join workout_sessions ws on ws.id = ss.session_id
        join exercises e on e.id = ss.exercise_id
        where ss.exercise_id is not null
          and e.user_id is not null
          and e.user_id <> ws.user_id
      `,
    )
    .pluck()
    .get() as number;
  const templateCount = sqlite
    .prepare(
      `
        select count(*) as count
        from template_exercises te
        join workout_templates wt on wt.id = te.template_id
        join exercises e on e.id = te.exercise_id
        where e.user_id is not null
          and e.user_id <> wt.user_id
      `,
    )
    .pluck()
    .get() as number;

  return [
    { relation: 'session_sets.exercise_id' as const, count: sessionCount },
    { relation: 'template_exercises.exercise_id' as const, count: templateCount },
  ].filter((entry) => entry.count > 0);
};

export const inspectDatabaseIntegrity = (sqlite: Database.Database): DatabaseIntegrityReport => {
  const quickCheckRows = sqlite.prepare('pragma quick_check').all() as Array<{
    quick_check: string;
  }>;
  const foreignKeyRows = sqlite.prepare('pragma foreign_key_check').all() as ForeignKeyCheckRow[];
  const relationCounts = new Map<string, number>();

  for (const row of foreignKeyRows) {
    const key = `${row.table}\u0000${row.parent}`;
    relationCounts.set(key, (relationCounts.get(key) ?? 0) + 1);
  }

  const ownershipViolationsByRelation = inspectWorkoutExerciseOwnership(sqlite);

  return {
    foreignKeyEnforcementEnabled: sqlite.pragma('foreign_keys', { simple: true }) === 1,
    foreignKeyViolationCount: foreignKeyRows.length,
    foreignKeyViolationsByRelation: [...relationCounts.entries()]
      .map(([key, count]) => {
        const [childTable, parentTable] = key.split('\u0000');
        return {
          childTable: childTable ?? 'unknown',
          count,
          parentTable: parentTable ?? 'unknown',
        };
      })
      .sort((left, right) =>
        `${left.childTable}:${left.parentTable}`.localeCompare(
          `${right.childTable}:${right.parentTable}`,
        ),
      ),
    ownershipViolationCount: ownershipViolationsByRelation.reduce(
      (total, entry) => total + entry.count,
      0,
    ),
    ownershipViolationsByRelation,
    quickCheck: quickCheckRows.map((row) => row.quick_check),
  };
};

export const assertDatabaseIntegrity = (
  sqlite: Database.Database,
  stage: string,
): DatabaseIntegrityReport => {
  const report = inspectDatabaseIntegrity(sqlite);
  const quickCheckPassed = report.quickCheck.length === 1 && report.quickCheck[0] === 'ok';

  if (
    !quickCheckPassed ||
    !report.foreignKeyEnforcementEnabled ||
    report.foreignKeyViolationCount > 0 ||
    report.ownershipViolationCount > 0
  ) {
    throw new DatabaseIntegrityError(stage, report);
  }

  return report;
};

export const runWithForeignKeysDisabled = <T>(sqlite: Database.Database, operation: () => T): T => {
  if (sqlite.pragma('foreign_keys', { simple: true }) !== 1) {
    throw new Error('Refusing to run migrations while foreign-key enforcement is already disabled');
  }

  sqlite.pragma('foreign_keys = OFF');
  try {
    return operation();
  } finally {
    sqlite.pragma('foreign_keys = ON');
  }
};
