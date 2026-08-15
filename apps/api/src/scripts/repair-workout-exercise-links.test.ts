import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  parseRepairWorkoutExerciseLinksCliArgs,
  repairWorkoutExerciseLinks,
  type WorkoutExerciseLinkRepairMap,
} from './repair-workout-exercise-links.js';

const tempDirs: string[] = [];
let sqlite: Database.Database;

const createRepairMap = (
  entries: WorkoutExerciseLinkRepairMap['entries'],
): WorkoutExerciseLinkRepairMap => ({
  entries,
  recoveredAt: '2026-08-14T22:00:00.000Z',
  version: 1,
});

const getTotalChanges = (): number =>
  sqlite.prepare('select total_changes()').pluck().get() as number;

const seedLegacyOrphan = ({
  exerciseId,
  ownerUserId = 'user-1',
  rowId,
  source,
}: {
  exerciseId: string;
  ownerUserId?: string;
  rowId: string;
  source: 'session_sets' | 'template_exercises';
}) => {
  sqlite.pragma('foreign_keys = OFF');
  if (source === 'session_sets') {
    sqlite
      .prepare(`insert into session_sets (id, session_id, exercise_id) values (?, ?, ?)`)
      .run(rowId, ownerUserId === 'user-1' ? 'session-1' : 'session-2', exerciseId);
  } else {
    sqlite
      .prepare(`insert into template_exercises (id, template_id, exercise_id) values (?, ?, ?)`)
      .run(rowId, ownerUserId === 'user-1' ? 'template-1' : 'template-2', exerciseId);
  }
  sqlite.pragma('foreign_keys = ON');
};

describe('repair-workout-exercise-links', () => {
  beforeEach(() => {
    const tempDir = mkdtempSync(join(tmpdir(), 'pulse-workout-link-repair-'));
    tempDirs.push(tempDir);
    sqlite = new Database(join(tempDir, 'repair.db'));
    sqlite.pragma('foreign_keys = ON');
    sqlite.exec(`
      create table users (id text primary key not null);
      create table exercises (
        id text primary key not null,
        user_id text,
        name text not null,
        muscle_groups text not null,
        equipment text not null,
        category text not null,
        tracking_type text not null,
        tags text not null,
        form_cues text not null,
        instructions text,
        coaching_notes text,
        related_exercise_ids text not null,
        deleted_at text,
        created_at integer not null,
        updated_at integer not null,
        foreign key (user_id) references users(id)
      );
      create table workout_sessions (
        id text primary key not null,
        user_id text not null,
        foreign key (user_id) references users(id)
      );
      create table workout_templates (
        id text primary key not null,
        user_id text not null,
        foreign key (user_id) references users(id)
      );
      create table session_sets (
        id text primary key not null,
        session_id text not null,
        exercise_id text,
        foreign key (session_id) references workout_sessions(id),
        foreign key (exercise_id) references exercises(id) on delete set null
      );
      create table template_exercises (
        id text primary key not null,
        template_id text not null,
        exercise_id text not null,
        foreign key (template_id) references workout_templates(id),
        foreign key (exercise_id) references exercises(id) on delete restrict
      );
      insert into users (id) values ('user-1'), ('user-2');
      insert into workout_sessions (id, user_id)
      values ('session-1', 'user-1'), ('session-2', 'user-2');
      insert into workout_templates (id, user_id)
      values ('template-1', 'user-1'), ('template-2', 'user-2');
      insert into exercises (
        id, user_id, name, muscle_groups, equipment, category, tracking_type,
        tags, form_cues, instructions, coaching_notes, related_exercise_ids,
        deleted_at, created_at, updated_at
      ) values (
        'known-source', 'user-1', 'Known Movement', '["core"]', 'bodyweight',
        'mobility', 'reps_only', '["rehab"]', '["slow"]', 'Instructions',
        'Coaching', '[]', null, 100, 100
      );
    `);
  });

  afterEach(() => {
    sqlite.close();
    while (tempDirs.length > 0) {
      const tempDir = tempDirs.pop();
      if (tempDir) {
        rmSync(tempDir, { recursive: true, force: true });
      }
    }
  });

  it('performs a read-only dry run and logs only aggregate evidence', () => {
    seedLegacyOrphan({
      exerciseId: 'missing-clone',
      rowId: 'set-1',
      source: 'session_sets',
    });
    seedLegacyOrphan({
      exerciseId: 'missing-placeholder',
      rowId: 'template-row-1',
      source: 'template_exercises',
    });
    const map = createRepairMap([
      {
        exerciseId: 'missing-clone',
        ownerUserId: 'user-1',
        sourceExerciseId: 'known-source',
        strategy: 'clone',
      },
      {
        exerciseId: 'missing-placeholder',
        name: 'Recovered deleted exercise',
        ownerUserId: 'user-1',
        strategy: 'placeholder',
      },
    ]);
    const logger = { info: vi.fn() };
    const changesBefore = getTotalChanges();

    const result = repairWorkoutExerciseLinks(
      sqlite,
      { dryRun: true, map, mapSha256: 'safe-map-sha' },
      logger,
    );

    expect(result).toMatchObject({
      dryRun: true,
      foreignKeyViolationCountBefore: 2,
      missingExerciseCount: 2,
      orphanLinkCount: 2,
      proposedRepairCount: 2,
      remainingForeignKeyViolationCount: 2,
      sessionSetOrphanCount: 1,
      templateExerciseOrphanCount: 1,
      unresolvedExerciseCount: 0,
    });
    expect(getTotalChanges()).toBe(changesBefore);
    expect(
      sqlite.prepare(`select count(*) from exercises where id like 'missing-%'`).pluck().get(),
    ).toBe(0);

    const logged = JSON.stringify(logger.info.mock.calls);
    expect(logged).toContain('safe-map-sha');
    expect(logged).not.toContain('missing-clone');
    expect(logged).not.toContain('missing-placeholder');
    expect(logged).not.toContain('user-1');
    expect(logged).not.toContain('Recovered deleted exercise');
  });

  it('restores original parent IDs transactionally without rewriting child links', () => {
    seedLegacyOrphan({
      exerciseId: 'missing-clone',
      rowId: 'set-1',
      source: 'session_sets',
    });
    seedLegacyOrphan({
      exerciseId: 'missing-placeholder',
      rowId: 'template-row-1',
      source: 'template_exercises',
    });
    const map = createRepairMap([
      {
        exerciseId: 'missing-clone',
        ownerUserId: 'user-1',
        sourceExerciseId: 'known-source',
        strategy: 'clone',
      },
      {
        exerciseId: 'missing-placeholder',
        name: 'Recovered deleted exercise',
        ownerUserId: 'user-1',
        strategy: 'placeholder',
      },
    ]);

    const result = repairWorkoutExerciseLinks(sqlite, { dryRun: false, map });

    expect(result.remainingForeignKeyViolationCount).toBe(0);
    expect(sqlite.prepare('pragma quick_check').pluck().get()).toBe('ok');
    expect(sqlite.prepare('pragma foreign_key_check').all()).toEqual([]);
    expect(
      sqlite.prepare(`select exercise_id from session_sets where id = 'set-1'`).pluck().get(),
    ).toBe('missing-clone');
    expect(
      sqlite
        .prepare(`select exercise_id from template_exercises where id = 'template-row-1'`)
        .pluck()
        .get(),
    ).toBe('missing-placeholder');
    expect(
      sqlite
        .prepare(
          `select user_id as userId, name, muscle_groups as muscleGroups, deleted_at as deletedAt
           from exercises where id = 'missing-clone'`,
        )
        .get(),
    ).toEqual({
      deletedAt: '2026-08-14T22:00:00.000Z',
      muscleGroups: '["core"]',
      name: 'Known Movement',
      userId: 'user-1',
    });
    expect(
      sqlite
        .prepare(
          `select user_id as userId, name, deleted_at as deletedAt
           from exercises where id = 'missing-placeholder'`,
        )
        .get(),
    ).toEqual({
      deletedAt: '2026-08-14T22:00:00.000Z',
      name: 'Recovered deleted exercise',
      userId: 'user-1',
    });
  });

  it('is replayable and makes no changes after the map has already been applied', () => {
    seedLegacyOrphan({
      exerciseId: 'missing-placeholder',
      rowId: 'set-1',
      source: 'session_sets',
    });
    const map = createRepairMap([
      {
        exerciseId: 'missing-placeholder',
        name: 'Recovered deleted exercise',
        ownerUserId: 'user-1',
        strategy: 'placeholder',
      },
    ]);
    repairWorkoutExerciseLinks(sqlite, { dryRun: false, map });
    const changesBeforeReplay = getTotalChanges();

    const replay = repairWorkoutExerciseLinks(sqlite, { dryRun: false, map });

    expect(replay).toMatchObject({
      alreadyAppliedCount: 1,
      foreignKeyViolationCountBefore: 0,
      missingExerciseCount: 0,
      orphanLinkCount: 0,
      proposedRepairCount: 0,
      remainingForeignKeyViolationCount: 0,
      unresolvedExerciseCount: 0,
    });
    expect(getTotalChanges()).toBe(changesBeforeReplay);
  });

  it('relinks an exact canonical match while preserving the template row', () => {
    seedLegacyOrphan({
      exerciseId: 'missing-template-exercise',
      rowId: 'template-row-1',
      source: 'template_exercises',
    });
    const map = createRepairMap([
      {
        exerciseId: 'missing-template-exercise',
        ownerUserId: 'user-1',
        sourceExerciseId: 'known-source',
        strategy: 'relink',
      },
    ]);

    const result = repairWorkoutExerciseLinks(sqlite, { dryRun: false, map });

    expect(result).toMatchObject({
      proposedRepairCount: 1,
      remainingForeignKeyViolationCount: 0,
    });
    expect(
      sqlite
        .prepare(
          `select id, template_id as templateId, exercise_id as exerciseId
           from template_exercises where id = 'template-row-1'`,
        )
        .get(),
    ).toEqual({
      exerciseId: 'known-source',
      id: 'template-row-1',
      templateId: 'template-1',
    });
    expect(
      sqlite
        .prepare(`select count(*) from exercises where id = 'missing-template-exercise'`)
        .pluck()
        .get(),
    ).toBe(0);

    const replay = repairWorkoutExerciseLinks(sqlite, { dryRun: false, map });
    expect(replay).toMatchObject({
      alreadyAppliedCount: 1,
      proposedRepairCount: 0,
      remainingForeignKeyViolationCount: 0,
    });
  });

  it('rolls back every parent restore if any insert fails', () => {
    seedLegacyOrphan({
      exerciseId: 'missing-one',
      rowId: 'set-1',
      source: 'session_sets',
    });
    seedLegacyOrphan({
      exerciseId: 'missing-two',
      rowId: 'template-row-1',
      source: 'template_exercises',
    });
    sqlite.exec(`
      create trigger fail_second_restore
      before insert on exercises
      when new.id = 'missing-two'
      begin
        select raise(abort, 'forced restore failure');
      end;
    `);
    const map = createRepairMap([
      {
        exerciseId: 'missing-one',
        name: 'Recovered one',
        ownerUserId: 'user-1',
        strategy: 'placeholder',
      },
      {
        exerciseId: 'missing-two',
        name: 'Recovered two',
        ownerUserId: 'user-1',
        strategy: 'placeholder',
      },
    ]);

    expect(() => repairWorkoutExerciseLinks(sqlite, { dryRun: false, map })).toThrow(
      'forced restore failure',
    );
    expect(
      sqlite.prepare(`select count(*) from exercises where id like 'missing-%'`).pluck().get(),
    ).toBe(0);
    expect(sqlite.prepare('pragma foreign_key_check').all()).toHaveLength(2);
  });

  it('refuses ambiguous ownership, incomplete maps, and unrelated violations', () => {
    seedLegacyOrphan({
      exerciseId: 'shared-missing',
      rowId: 'set-1',
      source: 'session_sets',
    });
    seedLegacyOrphan({
      exerciseId: 'shared-missing',
      ownerUserId: 'user-2',
      rowId: 'template-row-2',
      source: 'template_exercises',
    });
    const ambiguousMap = createRepairMap([
      {
        exerciseId: 'shared-missing',
        name: 'Recovered',
        ownerUserId: 'user-1',
        strategy: 'placeholder',
      },
    ]);

    const dryRun = repairWorkoutExerciseLinks(sqlite, {
      dryRun: true,
      map: ambiguousMap,
    });
    expect(dryRun.unresolvedExerciseCount).toBe(1);
    expect(() => repairWorkoutExerciseLinks(sqlite, { dryRun: false, map: ambiguousMap })).toThrow(
      'explicit map does not resolve every missing exercise',
    );

    sqlite.pragma('foreign_keys = OFF');
    sqlite.exec(`
      create table unrelated_child (
        id text primary key,
        user_id text not null references users(id)
      );
      insert into unrelated_child (id, user_id) values ('bad', 'missing-user');
    `);
    sqlite.pragma('foreign_keys = ON');

    expect(() => repairWorkoutExerciseLinks(sqlite, { dryRun: true, map: ambiguousMap })).toThrow(
      'unrelated or unclassified foreign-key violations',
    );
  });

  it('requires a map and accepts explicit dry-run or apply CLI modes', () => {
    expect(parseRepairWorkoutExerciseLinksCliArgs(['--map', '/tmp/map.json'])).toEqual({
      apply: false,
      mapPath: '/tmp/map.json',
      userId: null,
    });
    expect(
      parseRepairWorkoutExerciseLinksCliArgs([
        '--apply',
        '--map',
        '/tmp/map.json',
        '--user',
        'user-1',
      ]),
    ).toEqual({ apply: true, mapPath: '/tmp/map.json', userId: 'user-1' });
    expect(() => parseRepairWorkoutExerciseLinksCliArgs([])).toThrow(
      'explicit repair map is required',
    );
    expect(() =>
      parseRepairWorkoutExerciseLinksCliArgs(['--dry-run', '--apply', '--map', '/tmp/map.json']),
    ).toThrow('Choose exactly one mode');
  });
});
