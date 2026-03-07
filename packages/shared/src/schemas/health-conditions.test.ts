import { describe, expect, it } from 'vitest';

import {
  conditionProtocolSchema,
  conditionSeverityPointSchema,
  conditionTimelineEventSchema,
  healthConditionSchema,
  type ConditionProtocol,
  type ConditionSeverityPoint,
  type ConditionTimelineEvent,
  type HealthCondition,
} from './health-conditions';

describe('healthConditionSchema', () => {
  it('parses a valid health condition payload', () => {
    const payload = healthConditionSchema.parse({
      id: 'condition-1',
      userId: 'user-1',
      name: ' Shoulder impingement ',
      bodyArea: ' Shoulder ',
      status: 'active',
      onsetDate: '2026-03-01',
      description: null,
      createdAt: 1,
      updatedAt: 2,
    });

    expect(payload).toEqual({
      id: 'condition-1',
      userId: 'user-1',
      name: 'Shoulder impingement',
      bodyArea: 'Shoulder',
      status: 'active',
      onsetDate: '2026-03-01',
      description: null,
      createdAt: 1,
      updatedAt: 2,
    });
  });

  it('rejects invalid status and onset dates', () => {
    expect(() =>
      healthConditionSchema.parse({
        id: 'condition-1',
        userId: 'user-1',
        name: 'Knee pain',
        bodyArea: 'Knee',
        status: 'paused',
        onsetDate: '03-01-2026',
        description: null,
        createdAt: 1,
        updatedAt: 2,
      }),
    ).toThrow();
  });

  it('infers the HealthCondition type from the schema', () => {
    const payload: HealthCondition = {
      id: 'condition-2',
      userId: 'user-1',
      name: 'Low back strain',
      bodyArea: 'Lower back',
      status: 'monitoring',
      onsetDate: '2026-02-14',
      description: 'Improving with mobility work',
      createdAt: 1,
      updatedAt: 1,
    };

    expect(payload.status).toBe('monitoring');
  });
});

describe('conditionTimelineEventSchema', () => {
  it('parses a valid timeline event payload', () => {
    const payload = conditionTimelineEventSchema.parse({
      id: 'event-1',
      conditionId: 'condition-1',
      date: '2026-03-02',
      event: ' First PT visit ',
      type: 'treatment',
      notes: null,
      createdAt: 1,
    });

    expect(payload).toEqual({
      id: 'event-1',
      conditionId: 'condition-1',
      date: '2026-03-02',
      event: 'First PT visit',
      type: 'treatment',
      notes: null,
      createdAt: 1,
    });
  });

  it('rejects unknown event types', () => {
    expect(() =>
      conditionTimelineEventSchema.parse({
        id: 'event-1',
        conditionId: 'condition-1',
        date: '2026-03-02',
        event: 'Unexpected change',
        type: 'setback',
        notes: null,
        createdAt: 1,
      }),
    ).toThrow();
  });

  it('infers the ConditionTimelineEvent type from the schema', () => {
    const payload: ConditionTimelineEvent = {
      id: 'event-2',
      conditionId: 'condition-1',
      date: '2026-03-03',
      event: 'Pain decreased',
      type: 'improvement',
      notes: 'Symptoms eased after rest day',
      createdAt: 1,
    };

    expect(payload.type).toBe('improvement');
  });
});

describe('conditionProtocolSchema', () => {
  it('parses a valid protocol payload', () => {
    const payload = conditionProtocolSchema.parse({
      id: 'protocol-1',
      conditionId: 'condition-1',
      name: ' Daily band work ',
      status: 'active',
      startDate: '2026-03-01',
      endDate: null,
      notes: 'Three times per week',
      createdAt: 1,
    });

    expect(payload).toEqual({
      id: 'protocol-1',
      conditionId: 'condition-1',
      name: 'Daily band work',
      status: 'active',
      startDate: '2026-03-01',
      endDate: null,
      notes: 'Three times per week',
      createdAt: 1,
    });
  });

  it('rejects invalid statuses and malformed end dates', () => {
    expect(() =>
      conditionProtocolSchema.parse({
        id: 'protocol-1',
        conditionId: 'condition-1',
        name: 'Mobility',
        status: 'paused',
        startDate: '2026-03-01',
        endDate: '2026/03/10',
        notes: null,
        createdAt: 1,
      }),
    ).toThrow();
  });

  it('infers the ConditionProtocol type from the schema', () => {
    const payload: ConditionProtocol = {
      id: 'protocol-2',
      conditionId: 'condition-1',
      name: 'Ice after training',
      status: 'completed',
      startDate: '2026-02-20',
      endDate: '2026-02-27',
      notes: null,
      createdAt: 1,
    };

    expect(payload.status).toBe('completed');
  });
});

describe('conditionSeverityPointSchema', () => {
  it('parses a valid severity point payload', () => {
    const payload = conditionSeverityPointSchema.parse({
      id: 'severity-1',
      conditionId: 'condition-1',
      date: '2026-03-04',
      value: 6,
      createdAt: 1,
    });

    expect(payload).toEqual({
      id: 'severity-1',
      conditionId: 'condition-1',
      date: '2026-03-04',
      value: 6,
      createdAt: 1,
    });
  });

  it('rejects out-of-range severity values', () => {
    expect(() =>
      conditionSeverityPointSchema.parse({
        id: 'severity-1',
        conditionId: 'condition-1',
        date: '2026-03-04',
        value: 11,
        createdAt: 1,
      }),
    ).toThrow();
  });

  it('infers the ConditionSeverityPoint type from the schema', () => {
    const payload: ConditionSeverityPoint = {
      id: 'severity-2',
      conditionId: 'condition-1',
      date: '2026-03-05',
      value: 3,
      createdAt: 1,
    };

    expect(payload.value).toBe(3);
  });
});
