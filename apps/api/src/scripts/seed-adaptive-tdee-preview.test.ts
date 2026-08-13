import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import Database from 'better-sqlite3';
import { count, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { afterEach, describe, expect, it } from 'vitest';

import * as schema from '../db/schema/index.js';
import { adaptiveNutritionPrograms, users } from '../db/schema/index.js';
import { createAdaptiveNutritionStore } from '../routes/adaptive-nutrition/store.js';

import {
  ADAPTIVE_PREVIEW_USERNAME_PREFIX,
  seedAdaptiveTdeePreviewFixtures,
} from './seed-adaptive-tdee-preview.js';

const migrationsFolder = fileURLToPath(new URL('../../drizzle', import.meta.url));
const tempDirectories: string[] = [];

afterEach(() => {
  for (const directory of tempDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

describe('Adaptive TDEE preview fixtures', () => {
  it('rebuilds every Coach state deterministically and includes a goal-completion path', () => {
    const directory = mkdtempSync(join(tmpdir(), 'pulse-adaptive-preview-'));
    tempDirectories.push(directory);
    const sqlite = new Database(join(directory, 'preview.db'));
    sqlite.pragma('foreign_keys = ON');
    const db = drizzle(sqlite, { schema });
    migrate(db, { migrationsFolder });
    const options = {
      anchorDate: '2026-08-13',
      db,
      now: new Date('2026-08-13T16:00:00.000Z'),
      passwordHash: 'fixture-password-hash',
      sqlite,
    };

    const first = seedAdaptiveTdeePreviewFixtures(options);
    const store = createAdaptiveNutritionStore({
      db,
      sqlite,
      now: () => new Date('2026-08-13T16:30:00.000Z'),
    });
    expect(
      Object.fromEntries(first.map((fixture) => [fixture.fixture, fixture.expectedState])),
    ).toEqual({
      setup: 'setup_required',
      baseline: 'baseline',
      learning: 'learning',
      updating: 'updating',
      holding: 'holding',
      pending: 'pending_recommendation',
      'goal-reached': 'pending_recommendation',
    });
    for (const fixture of first) {
      expect(store.getState(fixture.userId).state).toBe(fixture.expectedState);
    }
    const goal = first.find((fixture) => fixture.fixture === 'goal-reached');
    if (!goal) throw new Error('Goal fixture missing');
    const goalPending = store.getState(goal.userId).pendingCheckIn;
    expect(goalPending?.reasonCodes).toContain('GOAL_REACHED');
    store.acceptCheckIn(goal.userId, goalPending?.id ?? '', { replaceSameDateTarget: true });
    expect(
      db
        .select({ goalType: adaptiveNutritionPrograms.goalType })
        .from(adaptiveNutritionPrograms)
        .where(eq(adaptiveNutritionPrograms.userId, goal.userId))
        .get(),
    ).toEqual({ goalType: 'maintain' });

    const second = seedAdaptiveTdeePreviewFixtures(options);
    expect(second).toEqual(first);
    expect(
      db
        .select({ total: count() })
        .from(users)
        .where(eq(users.username, `${ADAPTIVE_PREVIEW_USERNAME_PREFIX}setup`))
        .get(),
    ).toEqual({ total: 1 });
    for (const fixture of second) {
      expect(store.getState(fixture.userId).state).toBe(fixture.expectedState);
    }
    sqlite.close();
  });
});
