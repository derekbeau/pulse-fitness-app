import { beforeEach, describe, expect, it, vi } from 'vitest';

const testState = vi.hoisted(() => {
  const getQueue: unknown[] = [];
  const allQueue: unknown[] = [];
  const insertValues: unknown[] = [];
  const updateSets: unknown[] = [];
  const insertRunResults: Array<{ changes: number }> = [];
  const updateRunResults: Array<{ changes: number }> = [];

  const db = {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(() => ({
            get: vi.fn(() => getQueue.shift()),
          })),
          orderBy: vi.fn(() => ({
            all: vi.fn(() => allQueue.shift() ?? []),
          })),
          get: vi.fn(() => getQueue.shift()),
          all: vi.fn(() => allQueue.shift() ?? []),
        })),
      })),
    })),
    insert: vi.fn(() => ({
      values: vi.fn((values: unknown) => {
        insertValues.push(values);

        return {
          run: vi.fn(() => insertRunResults.shift() ?? { changes: 1 }),
        };
      }),
    })),
    update: vi.fn(() => ({
      set: vi.fn((values: unknown) => {
        updateSets.push(values);

        return {
          where: vi.fn(() => ({
            run: vi.fn(() => updateRunResults.shift() ?? { changes: 1 }),
          })),
        };
      }),
    })),
  };

  return {
    db,
    getQueue,
    allQueue,
    insertValues,
    updateSets,
    insertRunResults,
    updateRunResults,
    reset() {
      getQueue.length = 0;
      allQueue.length = 0;
      insertValues.length = 0;
      updateSets.length = 0;
      insertRunResults.length = 0;
      updateRunResults.length = 0;
      db.select.mockClear();
      db.insert.mockClear();
      db.update.mockClear();
    },
  };
});

vi.mock('../../db/index.js', () => ({
  db: testState.db,
}));

describe('habit entry store', () => {
  beforeEach(() => {
    testState.reset();
  });

  it('inserts a new habit entry when no entry exists for the habit and date', async () => {
    const { upsertHabitEntry } = await import('./store.js');

    testState.getQueue.push(undefined, {
      id: 'entry-1',
      habitId: 'habit-1',
      userId: 'user-1',
      date: '2026-03-07',
      completed: true,
      value: 8,
      createdAt: 1_700_000_000_000,
    });

    const entry = await upsertHabitEntry({
      id: 'entry-1',
      habitId: 'habit-1',
      userId: 'user-1',
      date: '2026-03-07',
      completed: true,
      value: 8,
    });

    expect(entry).toEqual({
      id: 'entry-1',
      habitId: 'habit-1',
      userId: 'user-1',
      date: '2026-03-07',
      completed: true,
      value: 8,
      createdAt: 1_700_000_000_000,
    });
    expect(testState.db.insert).toHaveBeenCalledOnce();
    expect(testState.db.update).not.toHaveBeenCalled();
    expect(testState.insertValues).toEqual([
      {
        id: 'entry-1',
        habitId: 'habit-1',
        userId: 'user-1',
        date: '2026-03-07',
        completed: true,
        value: 8,
      },
    ]);
  });

  it('updates an existing habit entry instead of inserting a duplicate for the same habit and date', async () => {
    const { upsertHabitEntry } = await import('./store.js');

    testState.getQueue.push(
      {
        id: 'entry-1',
        habitId: 'habit-1',
        userId: 'user-1',
        date: '2026-03-07',
        completed: true,
        value: 8,
        createdAt: 1_700_000_000_000,
      },
      {
        id: 'entry-1',
        habitId: 'habit-1',
        userId: 'user-1',
        date: '2026-03-07',
        completed: false,
        value: null,
        createdAt: 1_700_000_000_000,
      },
    );

    const entry = await upsertHabitEntry({
      id: 'entry-2',
      habitId: 'habit-1',
      userId: 'user-1',
      date: '2026-03-07',
      completed: false,
    });

    expect(entry).toEqual({
      id: 'entry-1',
      habitId: 'habit-1',
      userId: 'user-1',
      date: '2026-03-07',
      completed: false,
      value: null,
      createdAt: 1_700_000_000_000,
    });
    expect(testState.db.update).toHaveBeenCalledOnce();
    expect(testState.db.insert).not.toHaveBeenCalled();
    expect(testState.updateSets).toEqual([
      {
        completed: false,
        value: null,
      },
    ]);
  });

  it('returns the updated entry after a scoped patch update', async () => {
    const { updateHabitEntry } = await import('./store.js');

    testState.getQueue.push({
      id: 'entry-1',
      habitId: 'habit-1',
      userId: 'user-1',
      date: '2026-03-07',
      completed: false,
      value: 6,
      createdAt: 1_700_000_000_000,
    });

    const entry = await updateHabitEntry('entry-1', 'user-1', {
      completed: false,
      value: 6,
    });

    expect(entry).toEqual({
      id: 'entry-1',
      habitId: 'habit-1',
      userId: 'user-1',
      date: '2026-03-07',
      completed: false,
      value: 6,
      createdAt: 1_700_000_000_000,
    });
    expect(testState.updateSets).toEqual([
      {
        completed: false,
        value: 6,
      },
    ]);
  });

  it('returns undefined when a scoped patch update does not affect a row', async () => {
    const { updateHabitEntry } = await import('./store.js');

    testState.updateRunResults.push({ changes: 0 });

    const entry = await updateHabitEntry('entry-1', 'user-1', {
      completed: true,
    });

    expect(entry).toBeUndefined();
  });
});
