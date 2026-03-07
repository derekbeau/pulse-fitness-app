import { describe, expect, it } from 'vitest';

import {
  journalEntrySchema,
  type JournalEntry,
  type JournalEntryCreatedBy,
  type JournalEntryType,
} from './journal';

describe('journalEntrySchema', () => {
  it('parses a valid journal entry payload', () => {
    const payload = journalEntrySchema.parse({
      id: 'journal-1',
      userId: 'user-1',
      date: '2026-03-07',
      title: ' Post-workout reflection ',
      type: 'post-workout',
      content: 'Felt strong on deadlifts today.',
      createdBy: 'agent',
      createdAt: 1,
      updatedAt: 2,
    });

    expect(payload).toEqual({
      id: 'journal-1',
      userId: 'user-1',
      date: '2026-03-07',
      title: 'Post-workout reflection',
      type: 'post-workout',
      content: 'Felt strong on deadlifts today.',
      createdBy: 'agent',
      createdAt: 1,
      updatedAt: 2,
    });
  });

  it('rejects invalid type, createdBy, and date values', () => {
    expect(() =>
      journalEntrySchema.parse({
        id: 'journal-1',
        userId: 'user-1',
        date: '03-07-2026',
        title: 'Weekly note',
        type: 'recap',
        content: 'Still recovering well.',
        createdBy: 'coach',
        createdAt: 1,
        updatedAt: 2,
      }),
    ).toThrow();
  });

  it('infers the journal entry types from the schema', () => {
    const type: JournalEntryType = 'milestone';
    const createdBy: JournalEntryCreatedBy = 'user';
    const payload: JournalEntry = {
      id: 'journal-2',
      userId: 'user-1',
      date: '2026-03-08',
      title: 'Hit a new PR',
      type,
      content: 'Front squat moved cleanly.',
      createdBy,
      createdAt: 2,
      updatedAt: 3,
    };

    expect(payload.type).toBe('milestone');
    expect(payload.createdBy).toBe('user');
  });
});
