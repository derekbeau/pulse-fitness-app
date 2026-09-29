import { describe, expect, it } from 'vitest';
import {
  correctJournalObservationApiInputSchema,
  createJournalObservationApiInputSchema,
} from './journal-runtime.js';

const input = {
  localDate: '2026-09-19',
  title: 'A meaningful observation',
  content: 'A longer recovery window after walking.',
  category: 'health',
  sourceReferences: [{ kind: 'body_concern', id: 'concern', revisionId: 'revision' }],
  source: {
    class: 'user_observation',
    sourceId: 'conversation',
    sourceLabel: 'Conversation',
    sourceOccurredAt: null,
    uncertainty: 'unknown',
    freshness: { state: 'unknown', asOf: null, reasons: ['not reported'] },
  },
  idempotencyKey: 'key-123456',
};
describe('Journal runtime API inputs', () => {
  it('keeps subject, actor, and server capture fields out of external capture', () => {
    expect(createJournalObservationApiInputSchema.safeParse(input).success).toBe(true);
    for (const extra of ['subjectUserId', 'actor', 'timeZone', 'capturedAt'])
      expect(
        createJournalObservationApiInputSchema.safeParse({ ...input, [extra]: 'spoof' }).success,
      ).toBe(false);
    expect(
      createJournalObservationApiInputSchema.safeParse({ ...input, category: 'weekly_reflection' })
        .success,
    ).toBe(false);
    expect(
      createJournalObservationApiInputSchema.safeParse({
        ...input,
        sourceReferences: [{ kind: 'journal_entry', id: 'self', revisionId: 'r' }],
      }).success,
    ).toBe(false);
  });
  it('requires a nonempty correction and preserves source shape', () => {
    const correction = {
      expectedRevisionId: 'r1',
      correctedFields: { content: 'Clarified response.' },
      reason: 'User clarified',
      idempotencyKey: 'correct-123',
    };
    expect(correctJournalObservationApiInputSchema.safeParse(correction).success).toBe(true);
    expect(
      correctJournalObservationApiInputSchema.safeParse({ ...correction, correctedFields: {} })
        .success,
    ).toBe(false);
    expect(
      correctJournalObservationApiInputSchema.safeParse({
        ...correction,
        correctedFields: { category: 'weekly_reflection' },
      }).success,
    ).toBe(false);
  });
});
