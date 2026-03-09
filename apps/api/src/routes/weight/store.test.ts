import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
      weight: 182.8,
      notes: null,
      createdAt: 1_700_000_000_000,
      updatedAt,
    });

    const { upsertBodyWeightEntry } = await import('./store.js');
    const entry = await upsertBodyWeightEntry('user-1', {
      date: '2026-03-05',
      weight: 182.8,
      notes: undefined,
    });

    expect(entry).toEqual({
      id: 'entry-1',
      date: '2026-03-05',
      weight: 182.8,
      notes: null,
      createdAt: 1_700_000_000_000,
      updatedAt,
    });
    expect(testState.insert).toHaveBeenCalledWith(bodyWeight);
    expect(testState.insertValues).toHaveBeenCalledWith({
      userId: 'user-1',
      date: '2026-03-05',
      weight: 182.8,
      notes: null,
    });
    expect(testState.insertOnConflictDoUpdate).toHaveBeenCalledWith({
      target: [bodyWeight.userId, bodyWeight.date],
      set: {
        weight: 182.8,
        notes: null,
        updatedAt,
      },
    });
    expect(testState.insertReturning).toHaveBeenCalledOnce();
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
      upsertBodyWeightEntry('user-1', {
        date: '2026-03-05',
        weight: 182.8,
        notes: 'Fasted',
      }),
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
});
