import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SQLiteSyncDialect } from 'drizzle-orm/sqlite-core';

import { bodyWeight } from '../../db/schema/index.js';

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

  const deleteRun = vi.fn();
  const deleteWhere = vi.fn(() => ({
    run: deleteRun,
  }));
  const deleteFrom = vi.fn(() => ({
    where: deleteWhere,
  }));

  const updateRun = vi.fn();
  const updateWhere = vi.fn(() => ({ run: updateRun }));
  const updateSet = vi.fn(() => ({ where: updateWhere }));
  const update = vi.fn(() => ({ set: updateSet }));

  const selectGet = vi.fn();
  const selectAll = vi.fn();
  const selectOffset = vi.fn(() => ({
    all: selectAll,
  }));
  const selectLimit = vi.fn(() => ({
    get: selectGet,
    offset: selectOffset,
  }));
  const selectOrderBy = vi.fn(() => ({
    all: selectAll,
    limit: selectLimit,
  }));
  const selectWhere = vi.fn(() => ({
    orderBy: selectOrderBy,
    limit: selectLimit,
    get: selectGet,
  }));
  const selectFrom = vi.fn(() => ({
    where: selectWhere,
  }));
  const select = vi.fn(() => ({
    from: selectFrom,
  }));

  return {
    db: {
      delete: deleteFrom,
      insert,
      select,
      update,
    },
    reset() {
      deleteFrom.mockClear();
      deleteWhere.mockClear();
      deleteRun.mockClear();
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
      selectOffset.mockClear();
      selectAll.mockClear();
      selectGet.mockClear();
      update.mockClear();
      updateSet.mockClear();
      updateWhere.mockClear();
      updateRun.mockClear();
    },
    deleteFrom,
    deleteWhere,
    deleteRun,
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
    selectOffset,
    selectAll,
    selectGet,
    update,
    updateSet,
    updateWhere,
    updateRun,
  };
});

vi.mock('../../db/index.js', () => ({
  db: testState.db,
}));

vi.mock('../../lib/user-time-zone.js', () => ({
  getUserLocalDate: vi.fn().mockResolvedValue('2026-03-07'),
}));

describe('weight store', () => {
  beforeEach(() => {
    testState.reset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('upserts by user and date and returns the persisted entry', async () => {
    const updatedAt = 1_700_000_000_123;
    vi.spyOn(Date, 'now').mockReturnValue(updatedAt);
    testState.insertReturningGet.mockReturnValue({
      id: 'entry-1',
      date: '2026-03-05',
      weightKg: 82.916685236,
      unitAtEntry: 'lbs',
      notes: null,
      createdAt: 1_700_000_000_000,
      updatedAt,
    });

    const { upsertBodyWeightEntry } = await import('./store.js');
    const entry = await upsertBodyWeightEntry(
      'user-1',
      {
        date: '2026-03-05',
        weight: 182.8,
        notes: undefined,
      },
      'lbs',
    );

    expect(entry).toEqual({
      id: 'entry-1',
      date: '2026-03-05',
      weightKg: 82.916685236,
      unitAtEntry: 'lbs',
      notes: null,
      createdAt: 1_700_000_000_000,
      updatedAt,
    });
    expect(testState.insert).toHaveBeenCalledWith(bodyWeight);
    expect(testState.insertValues).toHaveBeenCalledWith({
      userId: 'user-1',
      date: '2026-03-05',
      weight: 182.8,
      weightKg: 82.916685236,
      unitAtEntry: 'lbs',
      notes: null,
    });
    expect(testState.insertOnConflictDoUpdate).toHaveBeenCalledOnce();
    const conflict = (
      testState.insertOnConflictDoUpdate.mock.calls[0] as unknown as [
        {
          set: Record<string, unknown>;
          target: unknown[];
        },
      ]
    )[0];
    expect(conflict).toMatchObject({
      target: [bodyWeight.userId, bodyWeight.date],
      set: {
        weight: 182.8,
        weightKg: 82.916685236,
        unitAtEntry: 'lbs',
        notes: null,
      },
    });
    expect(new SQLiteSyncDialect().sqlToQuery(conflict?.set.updatedAt as never)).toEqual({
      sql: 'max("body_weight"."updated_at" + 1, ?)',
      params: [updatedAt],
      typings: ['none'],
    });
    expect(testState.insertReturning).toHaveBeenCalledOnce();
  });

  it('canonicalizes an explicit kg write while keeping compatibility pounds', async () => {
    const compatibilityPounds = 80 / 0.45359237;
    testState.insertReturningGet.mockReturnValue({
      id: 'entry-kg',
      date: '2026-03-06',
      weightKg: 80,
      unitAtEntry: 'kg',
      notes: null,
      createdAt: 1,
      updatedAt: 1,
    });

    const { upsertBodyWeightEntry } = await import('./store.js');
    await upsertBodyWeightEntry('user-1', { date: '2026-03-06', weight: 80 }, 'kg');

    expect(testState.insertValues).toHaveBeenCalledWith({
      userId: 'user-1',
      date: '2026-03-06',
      weight: compatibilityPounds,
      weightKg: 80,
      unitAtEntry: 'kg',
      notes: null,
    });
  });

  it('changes response display units without rewriting canonical storage', async () => {
    const { toBodyWeightEntry } = await import('./store.js');
    const canonical = {
      id: 'entry-1',
      date: '2026-03-06',
      weightKg: 80,
      unitAtEntry: 'kg' as const,
      notes: null,
      createdAt: 1,
      updatedAt: 1,
    };

    expect(toBodyWeightEntry(canonical, 'kg')).toMatchObject({ weight: 80, unit: 'kg' });
    expect(toBodyWeightEntry(canonical, 'lbs')).toMatchObject({
      weight: 176.36980975,
      unit: 'lbs',
    });
    expect(canonical).toMatchObject({ weightKg: 80, unitAtEntry: 'kg' });
  });

  it('makes a same-millisecond patch timestamp monotonic', async () => {
    const updatedAt = 1_700_000_000_123;
    vi.spyOn(Date, 'now').mockReturnValue(updatedAt);
    testState.updateRun.mockReturnValue({ changes: 1 });
    testState.selectGet.mockReturnValue({
      id: 'entry-1',
      date: '2026-03-06',
      weightKg: 80,
      unitAtEntry: 'kg',
      notes: 'Corrected',
      createdAt: updatedAt,
      updatedAt: updatedAt + 1,
    });

    const { patchBodyWeightEntryById } = await import('./store.js');
    await expect(
      patchBodyWeightEntryById('entry-1', 'user-1', { notes: 'Corrected' }, 'kg'),
    ).resolves.toMatchObject({ updatedAt: updatedAt + 1 });

    const updates = (
      testState.updateSet.mock.calls as unknown as [[Record<string, unknown>]]
    )[0][0];
    expect(updates).toMatchObject({ notes: 'Corrected' });
    expect(new SQLiteSyncDialect().sqlToQuery(updates.updatedAt as never)).toEqual({
      sql: 'max("body_weight"."updated_at" + 1, ?)',
      params: [updatedAt],
      typings: ['none'],
    });
  });

  it('finds a body weight entry by user and date or returns null', async () => {
    testState.selectGet
      .mockReturnValueOnce({
        id: 'entry-1',
        date: '2026-03-05',
        weight: 182.8,
        notes: null,
        createdAt: 1_700_000_000_000,
        updatedAt: 1_700_000_000_123,
      })
      .mockReturnValueOnce(undefined);

    const { findBodyWeightEntryByDate } = await import('./store.js');

    await expect(findBodyWeightEntryByDate('user-1', '2026-03-05')).resolves.toEqual({
      id: 'entry-1',
      date: '2026-03-05',
      weight: 182.8,
      notes: null,
      createdAt: 1_700_000_000_000,
      updatedAt: 1_700_000_000_123,
    });
    await expect(findBodyWeightEntryByDate('user-1', '2026-03-06')).resolves.toBeNull();
  });

  it('throws when an upsert does not yield a persisted row', async () => {
    testState.insertReturningGet.mockReturnValue(undefined);

    const { upsertBodyWeightEntry } = await import('./store.js');

    await expect(
      upsertBodyWeightEntry(
        'user-1',
        {
          date: '2026-03-05',
          weight: 182.8,
          notes: 'Fasted',
        },
        'lbs',
      ),
    ).rejects.toThrow('Failed to persist body weight entry');
  });

  it('lists entries in ascending date order for the requested query range', async () => {
    testState.selectAll.mockReturnValue([
      {
        id: 'entry-2',
        date: '2026-03-03',
        weight: 183.6,
        notes: 'After training',
        createdAt: 1_700_000_000_100,
        updatedAt: 1_700_000_000_100,
      },
      {
        id: 'entry-3',
        date: '2026-03-05',
        weight: 183.1,
        notes: null,
        createdAt: 1_700_000_000_200,
        updatedAt: 1_700_000_000_200,
      },
    ]);

    const { listBodyWeightEntries } = await import('./store.js');
    const entries = await listBodyWeightEntries('user-1', {
      from: '2026-03-02',
      to: '2026-03-05',
    });

    expect(entries).toEqual([
      {
        id: 'entry-2',
        date: '2026-03-03',
        weight: 183.6,
        notes: 'After training',
        createdAt: 1_700_000_000_100,
        updatedAt: 1_700_000_000_100,
      },
      {
        id: 'entry-3',
        date: '2026-03-05',
        weight: 183.1,
        notes: null,
        createdAt: 1_700_000_000_200,
        updatedAt: 1_700_000_000_200,
      },
    ]);
    expect(testState.selectOrderBy).toHaveBeenCalledOnce();
  });

  it('returns the latest entry for a user or null when none exist', async () => {
    testState.selectGet
      .mockReturnValueOnce({
        id: 'entry-4',
        date: '2026-03-07',
        weight: 182.4,
        notes: null,
        createdAt: 1_700_000_000_300,
        updatedAt: 1_700_000_000_300,
      })
      .mockReturnValueOnce(undefined);

    const { getLatestBodyWeightEntry } = await import('./store.js');

    await expect(getLatestBodyWeightEntry('user-1')).resolves.toEqual({
      id: 'entry-4',
      date: '2026-03-07',
      weight: 182.4,
      notes: null,
      createdAt: 1_700_000_000_300,
      updatedAt: 1_700_000_000_300,
    });
    await expect(getLatestBodyWeightEntry('user-1')).resolves.toBeNull();
    expect(testState.selectLimit).toHaveBeenCalledTimes(2);
  });

  it('applies database pagination and returns total count for paginated listing', async () => {
    testState.selectAll.mockReturnValue([
      {
        id: 'entry-5',
        date: '2026-03-08',
        weight: 182.1,
        notes: null,
        createdAt: 1_700_000_000_400,
        updatedAt: 1_700_000_000_400,
      },
    ]);
    testState.selectGet.mockReturnValue({ total: 12 });

    const { listBodyWeightEntriesPaginated } = await import('./store.js');
    const result = await listBodyWeightEntriesPaginated(
      'user-1',
      {
        from: '2026-03-01',
        to: '2026-03-31',
      },
      {
        limit: 10,
        offset: 10,
      },
    );

    expect(result).toEqual({
      entries: [
        {
          id: 'entry-5',
          date: '2026-03-08',
          weight: 182.1,
          notes: null,
          createdAt: 1_700_000_000_400,
          updatedAt: 1_700_000_000_400,
        },
      ],
      total: 12,
    });
    expect(testState.selectLimit).toHaveBeenCalledWith(10);
    expect(testState.selectOffset).toHaveBeenCalledWith(10);
    expect(testState.selectGet).toHaveBeenCalledTimes(1);
  });

  it('deletes an entry only when id and userId match', async () => {
    testState.deleteRun.mockReturnValueOnce({ changes: 1 }).mockReturnValueOnce({ changes: 0 });

    const { deleteBodyWeightEntryById } = await import('./store.js');

    await expect(deleteBodyWeightEntryById('entry-1', 'user-1')).resolves.toBe(true);
    await expect(deleteBodyWeightEntryById('entry-1', 'other-user')).resolves.toBe(false);
    expect(testState.deleteFrom).toHaveBeenCalledWith(bodyWeight);
    expect(testState.deleteWhere).toHaveBeenCalledTimes(2);
  });
});
