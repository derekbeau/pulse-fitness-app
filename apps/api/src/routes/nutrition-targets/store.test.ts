import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { nutritionTargets } from '../../db/schema/index.js';

const testState = vi.hoisted(() => {
  const insertReturningGet = vi.fn();
  const insertReturning = vi.fn(() => ({
    get: insertReturningGet,
  }));
  const insertOnConflictDoUpdate = vi.fn(() => ({
    returning: insertReturning,
  }));
  const insertValues = vi.fn(() => ({
    onConflictDoUpdate: insertOnConflictDoUpdate,
  }));
  const insert = vi.fn(() => ({
    values: insertValues,
  }));

  const selectGet = vi.fn();
  const selectAll = vi.fn();
  const selectLimit = vi.fn(() => ({
    get: selectGet,
  }));
  const selectOrderBy = vi.fn(() => ({
    all: selectAll,
    limit: selectLimit,
  }));
  const selectWhere = vi.fn(() => ({
    orderBy: selectOrderBy,
    limit: selectLimit,
  }));
  const selectFrom = vi.fn(() => ({
    where: selectWhere,
  }));
  const select = vi.fn(() => ({
    from: selectFrom,
  }));

  return {
    db: {
      insert,
      select,
    },
    reset() {
      insert.mockClear();
      insertValues.mockClear();
      insertOnConflictDoUpdate.mockClear();
      insertReturning.mockClear();
      insertReturningGet.mockClear();
      select.mockClear();
      selectFrom.mockClear();
      selectWhere.mockClear();
      selectOrderBy.mockClear();
      selectLimit.mockClear();
      selectAll.mockClear();
      selectGet.mockClear();
    },
    insert,
    insertValues,
    insertOnConflictDoUpdate,
    insertReturning,
    insertReturningGet,
    select,
    selectFrom,
    selectWhere,
    selectOrderBy,
    selectLimit,
    selectAll,
    selectGet,
  };
});

vi.mock('../../db/index.js', () => ({
  db: testState.db,
}));

describe('nutrition targets store', () => {
  beforeEach(() => {
    testState.reset();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('upserts by user and effective date and returns the persisted target', async () => {
    const updatedAt = 1_700_000_000_123;
    vi.spyOn(Date, 'now').mockReturnValue(updatedAt);
    testState.insertReturningGet.mockReturnValue({
      id: 'target-1',
      calories: 2200,
      protein: 180,
      carbs: 250,
      fat: 70,
      effectiveDate: '2026-03-07',
      createdAt: 1_700_000_000_000,
      updatedAt,
    });

    const { upsertNutritionTarget } = await import('./store.js');
    const target = await upsertNutritionTarget('user-1', {
      calories: 2200,
      protein: 180,
      carbs: 250,
      fat: 70,
      effectiveDate: '2026-03-07',
    });

    expect(target).toEqual({
      id: 'target-1',
      calories: 2200,
      protein: 180,
      carbs: 250,
      fat: 70,
      effectiveDate: '2026-03-07',
      createdAt: 1_700_000_000_000,
      updatedAt,
    });
    expect(testState.insert).toHaveBeenCalledWith(nutritionTargets);
    expect(testState.insertValues).toHaveBeenCalledWith({
      userId: 'user-1',
      calories: 2200,
      protein: 180,
      carbs: 250,
      fat: 70,
      effectiveDate: '2026-03-07',
    });
    expect(testState.insertOnConflictDoUpdate).toHaveBeenCalledWith({
      target: [nutritionTargets.userId, nutritionTargets.effectiveDate],
      set: {
        calories: 2200,
        protein: 180,
        carbs: 250,
        fat: 70,
        updatedAt,
      },
    });
    expect(testState.insertReturning).toHaveBeenCalledOnce();
  });

  it('throws when an upsert does not yield a persisted row', async () => {
    testState.insertReturningGet.mockReturnValue(undefined);

    const { upsertNutritionTarget } = await import('./store.js');

    await expect(
      upsertNutritionTarget('user-1', {
        calories: 2200,
        protein: 180,
        carbs: 250,
        fat: 70,
        effectiveDate: '2026-03-07',
      }),
    ).rejects.toThrow('Failed to persist nutrition target');
  });

  it('lists target history in descending effective date order', async () => {
    testState.selectAll.mockReturnValue([
      {
        id: 'target-2',
        calories: 2250,
        protein: 185,
        carbs: 240,
        fat: 72,
        effectiveDate: '2026-03-07',
        createdAt: 1_700_000_000_100,
        updatedAt: 1_700_000_000_100,
      },
      {
        id: 'target-1',
        calories: 2200,
        protein: 180,
        carbs: 250,
        fat: 70,
        effectiveDate: '2026-02-01',
        createdAt: 1_699_000_000_000,
        updatedAt: 1_699_000_000_000,
      },
    ]);

    const { listNutritionTargets } = await import('./store.js');
    const targets = await listNutritionTargets('user-1');

    expect(targets).toEqual([
      {
        id: 'target-2',
        calories: 2250,
        protein: 185,
        carbs: 240,
        fat: 72,
        effectiveDate: '2026-03-07',
        createdAt: 1_700_000_000_100,
        updatedAt: 1_700_000_000_100,
      },
      {
        id: 'target-1',
        calories: 2200,
        protein: 180,
        carbs: 250,
        fat: 70,
        effectiveDate: '2026-02-01',
        createdAt: 1_699_000_000_000,
        updatedAt: 1_699_000_000_000,
      },
    ]);
    expect(testState.selectOrderBy).toHaveBeenCalledOnce();
  });

  it('returns the current effective target or null when none exist', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-07T14:30:00Z'));
    testState.selectGet
      .mockReturnValueOnce({
        id: 'target-2',
        calories: 2250,
        protein: 185,
        carbs: 240,
        fat: 72,
        effectiveDate: '2026-03-07',
        createdAt: 1_700_000_000_100,
        updatedAt: 1_700_000_000_100,
      })
      .mockReturnValueOnce(undefined);

    const { getCurrentNutritionTarget } = await import('./store.js');

    await expect(getCurrentNutritionTarget('user-1')).resolves.toEqual({
      id: 'target-2',
      calories: 2250,
      protein: 185,
      carbs: 240,
      fat: 72,
      effectiveDate: '2026-03-07',
      createdAt: 1_700_000_000_100,
      updatedAt: 1_700_000_000_100,
    });
    await expect(getCurrentNutritionTarget('user-1')).resolves.toBeNull();
    expect(testState.selectLimit).toHaveBeenCalledTimes(2);
  });
});
