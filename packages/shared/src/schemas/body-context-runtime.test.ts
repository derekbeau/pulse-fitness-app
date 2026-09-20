import { describe, expect, it } from 'vitest';

import {
  createPlanChangeProposalApiInputSchema,
  recordBodyFlareApiInputSchema,
} from './body-context-runtime.js';

const source = {
  class: 'user_observation' as const,
  sourceId: 'conversation-178',
  sourceLabel: 'User report',
  sourceOccurredAt: '2026-11-01T01:30:00.000-04:00',
  uncertainty: 'known' as const,
  freshness: {
    state: 'current' as const,
    asOf: '2026-11-01T01:30:00.000-04:00',
    reasons: [],
  },
};

describe('body-context runtime contracts', () => {
  it('keeps occurrence local date distinct from capture time across DST', () => {
    expect(
      recordBodyFlareApiInputSchema.parse({
        occurredAt: '2026-11-01T01:30:00.000-04:00',
        localDate: '2026-11-01',
        timeZone: 'America/Detroit',
        observation: 'Shoulder soreness returned.',
        source,
        followUpQuestions: [],
        idempotencyKey: 'flare-dst-178',
      }).localDate,
    ).toBe('2026-11-01');
    expect(() =>
      recordBodyFlareApiInputSchema.parse({
        occurredAt: '2026-11-02T05:30:00.000Z',
        localDate: '2026-11-01',
        timeZone: 'America/Detroit',
        observation: 'Late flare belongs to the next local date.',
        source,
        followUpQuestions: [],
        idempotencyKey: 'flare-bad-date-178',
      }),
    ).toThrow('localDate must match occurredAt in timeZone');
  });

  it('accepts only typed plan effects and rejects routine-authority smuggling', () => {
    const base = {
      summary: 'Move one upcoming walk.',
      effects: [
        {
          kind: 'activity_assignment_reschedule' as const,
          assignmentId: 'assignment-1',
          expectedRevision: 1,
          plannedLocalDate: '2026-09-24',
          timeZone: 'America/Detroit',
          reason: 'Exact proposed move',
        },
      ],
      sourceReferences: [],
      idempotencyKey: 'proposal-schema-178',
    };
    expect(createPlanChangeProposalApiInputSchema.parse(base).effects).toHaveLength(1);
    expect(() =>
      createPlanChangeProposalApiInputSchema.parse({
        ...base,
        effects: [
          {
            ...base.effects[0],
            diagnosis: 'impingement',
            markConcernResolved: true,
          },
        ],
      }),
    ).toThrow();
  });
});
