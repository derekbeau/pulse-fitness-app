import { describe, expect, it } from 'vitest';

import {
  dataQualityCalendarQuerySchema,
  dataQualityCalendarSchema,
  dataQualityCorrectionStateSchema,
  type DataQualityCalendar,
} from './data-quality-calendar.js';

const day = (date: string): DataQualityCalendar['days'][number] => ({
  date,
  isToday: false,
  nutrition: {
    qualityState: 'no_records',
    evidenceState: 'missing',
    logId: null,
    explicitStatus: null,
    totals: null,
    mealCount: null,
    itemCount: null,
    createdAt: null,
    statusUpdatedAt: null,
    updatedAt: null,
    provenance: {
      type: 'not_recorded',
      label: 'Not recorded',
      agentTokenId: null,
      limitation: 'No source.',
    },
    reasonCodes: [],
    actions: [],
  },
  weight: {
    evidenceState: 'missing',
    entryId: null,
    weight: null,
    unit: null,
    trendWeight: null,
    correctionState: 'not_applicable',
    suspect: false,
    stale: false,
    createdAt: null,
    updatedAt: null,
    provenance: {
      type: 'not_recorded',
      label: 'Not recorded',
      agentTokenId: null,
      limitation: 'No source.',
    },
    reasonCodes: [],
    actions: [],
  },
  workouts: [],
  algorithm: {
    state: 'no_program',
    nutritionEvidenceState: 'not_applicable',
    weightEvidenceState: 'not_applicable',
    reasonCodes: [],
    events: [],
    omittedEventCount: 0,
  },
  contexts: [],
  omittedWorkoutCount: 0,
  omittedContextCount: 0,
});

const response = (): DataQualityCalendar => ({
  range: { startDate: '2026-03-07', endDate: '2026-03-09' },
  today: '2026-03-08',
  timeZone: 'America/Detroit',
  days: [day('2026-03-07'), day('2026-03-08'), day('2026-03-09')],
  summary: {
    nutrition: { complete: 0, partial: 0, unknown: 0, missing: 3, pending: 0, excluded: 0 },
    weight: { logged: 0, missing: 3, pending: 0, excluded: 0 },
    workout: { planned: 0, active: 0, completed: 0, cancelled: 0 },
    algorithm: { learning: 0, updating: 0, holding: 0, pendingReview: 0 },
    contextDays: 0,
    intervalLabel: 'Visible calendar grid',
  },
});

describe('dataQualityCalendarQuerySchema', () => {
  it('accepts a bounded DST-spanning range and supported IANA zone', () => {
    expect(dataQualityCalendarQuerySchema.parse({})).toEqual({});
    expect(
      dataQualityCalendarQuerySchema.parse({
        start: '2026-03-07',
        end: '2026-03-09',
        timeZone: 'America/Detroit',
      }),
    ).toEqual({
      start: '2026-03-07',
      end: '2026-03-09',
      timeZone: 'America/Detroit',
    });
    expect(
      dataQualityCalendarQuerySchema.parse({
        start: '2026-08-01',
        end: '2026-08-01',
        timeZone: 'UTC',
      }).timeZone,
    ).toBe('UTC');
  });

  it('rejects reversed, oversized, invalid-zone, and unknown-field queries', () => {
    expect(() =>
      dataQualityCalendarQuerySchema.parse({ start: '2026-08-02', end: '2026-08-01' }),
    ).toThrow(/start must be on or before end/);
    expect(() =>
      dataQualityCalendarQuerySchema.parse({ start: '2026-01-01', end: '2026-02-12' }),
    ).toThrow(/limited to 42 days/);
    expect(() =>
      dataQualityCalendarQuerySchema.parse({
        start: '2026-08-01',
        end: '2026-08-02',
        timeZone: 'Detroit',
      }),
    ).toThrow(/valid IANA/);
    expect(() =>
      dataQualityCalendarQuerySchema.parse({
        start: '2026-08-01',
        end: '2026-08-02',
        extra: true,
      }),
    ).toThrow();
  });
});

describe('dataQualityCalendarSchema', () => {
  const firstDay = (value: ReturnType<typeof response>) => {
    const day = value.days[0];
    if (!day) throw new Error('Expected a calendar day fixture');
    return day;
  };

  it('parses one strict day for every literal local date', () => {
    expect(dataQualityCalendarSchema.parse(response())).toEqual(response());
  });

  it('rejects correction claims and counters when no correction ledger exists', () => {
    expect(() => dataQualityCorrectionStateSchema.parse('confirmed')).toThrow();
    expect(() => dataQualityCorrectionStateSchema.parse('not_corrected')).toThrow();

    const value = response();
    expect(() =>
      dataQualityCalendarSchema.parse({
        ...value,
        summary: {
          ...value.summary,
          weight: { ...value.summary.weight, corrected: 1 },
        },
      }),
    ).toThrow(/Unrecognized key/);
  });

  it('rejects fabricated nutrition and partial weight source precision', () => {
    const withMissingCalories = response();
    firstDay(withMissingCalories).nutrition.totals = {
      calories: 0,
      protein: 0,
      carbs: 0,
      fat: 0,
    };
    expect(() => dataQualityCalendarSchema.parse(withMissingCalories)).toThrow(
      /missing nutrition day cannot include numeric totals/i,
    );

    const withPartialWeight = response();
    firstDay(withPartialWeight).weight.entryId = 'weight-1';
    expect(() => dataQualityCalendarSchema.parse(withPartialWeight)).toThrow(
      /Weight source fields must be all present or all absent/,
    );
  });

  it('rejects suspected partial without an explicit complete source status', () => {
    const value = response();
    const day = firstDay(value);
    day.nutrition = {
      ...day.nutrition,
      qualityState: 'suspected_partial',
      evidenceState: 'excluded',
      logId: 'nutrition-1',
      explicitStatus: 'partial',
      totals: { calories: 900, protein: 50, carbs: 90, fat: 20 },
      mealCount: 2,
      itemCount: 4,
      createdAt: 9,
      updatedAt: 10,
    };
    expect(() => dataQualityCalendarSchema.parse(value)).toThrow(
      /Only an explicitly complete day can be flagged as suspected partial/,
    );
  });

  it('requires honest source provenance in every calendar domain', () => {
    for (const domain of ['nutrition', 'weight'] as const) {
      const value = response();
      firstDay(value)[domain].provenance = {
        type: 'agent_token',
        label: 'Connected agent',
        agentTokenId: null,
        limitation: null,
      };
      expect(() => dataQualityCalendarSchema.parse(value)).toThrow(
        /Only AgentToken provenance may include an agent token ID/,
      );
    }

    const withWorkout = response();
    firstDay(withWorkout).workouts = [
      {
        id: 'session-1',
        kind: 'workout_session',
        state: 'completed',
        name: 'Strength',
        sessionStatus: 'completed',
        scheduledWorkoutId: null,
        sessionId: 'session-1',
        plannedDate: null,
        sessionDate: '2026-03-07',
        relation: 'unlinked',
        relationLimitation: null,
        correctionState: 'history_unavailable',
        startedAt: 1,
        completedAt: 2,
        createdAt: 1,
        updatedAt: 2,
        provenance: {
          type: 'not_recorded',
          label: 'Not recorded',
          agentTokenId: null,
          limitation: null,
        },
        reasonCodes: [],
        actions: [],
      },
    ];
    expect(() => dataQualityCalendarSchema.parse(withWorkout)).toThrow(
      /Unrecorded provenance must explain its limitation/,
    );

    const withAlgorithm = response();
    firstDay(withAlgorithm).algorithm.events = [
      {
        id: 'check-in-1',
        kind: 'check_in',
        state: 'accepted',
        effectiveDate: '2026-03-07',
        createdAt: 1,
        reasonCodes: [],
        provenance: {
          type: 'system_derived',
          label: 'Pulse algorithm',
          agentTokenId: 'token-1',
          limitation: null,
        },
        actions: [],
      },
    ];
    expect(() => dataQualityCalendarSchema.parse(withAlgorithm)).toThrow(
      /Only AgentToken provenance may include an agent token ID/,
    );
  });

  it('rejects duplicate, missing, or out-of-range calendar days', () => {
    const duplicate = response();
    duplicate.days[2] = day('2026-03-08');
    expect(() => dataQualityCalendarSchema.parse(duplicate)).toThrow(/unique and inside/);

    const incomplete = response();
    incomplete.days.pop();
    expect(() => dataQualityCalendarSchema.parse(incomplete)).toThrow(/one day for every/);
  });
});
