import { describe, expect, it } from 'vitest';
import { calendarFoundationProjection, calendarRuntimeSchema } from './calendar-runtime.js';
import { calendarReadModelSchema } from './activity-journal-contracts.js';

const model = {
  contractVersion: 'activity-journal-v1',
  subjectUserId: 'owner',
  from: '2026-03-08',
  to: '2026-03-08',
  timeZone: 'America/Detroit',
  filters: { domain: [], state: [] },
  items: [
    {
      id: 'nutrition-day:2026-03-08',
      subjectUserId: 'owner',
      domain: 'nutrition',
      record: {
        kind: 'nutrition_log',
        id: 'nutrition-day:2026-03-08',
        subjectUserId: 'owner',
        revisionId: null,
      },
      localDate: '2026-03-08',
      timeZone: 'America/Detroit',
      occurrenceAt: null,
      state: 'summary',
      title: 'Nutrition',
      nutrition: {
        status: null,
        actual: null,
        target: { calories: 2000, protein: 0, carbs: 200, fat: 70 },
      },
    },
  ],
} as const;
describe('calendar runtime projection', () => {
  it('accepts date-only target identity without a source token and preserves the foundation projection', () => {
    const parsed = calendarRuntimeSchema.parse(model);
    expect(calendarReadModelSchema.safeParse(calendarFoundationProjection(parsed)).success).toBe(
      true,
    );
    expect(parsed.items[0]?.sourceReference).toBeUndefined();
  });
  it('rejects extra score, schedule, and nutrition keys', () => {
    expect(
      calendarRuntimeSchema.safeParse({
        ...model,
        items: [{ ...model.items[0], recoveryScore: 80 }],
      }).success,
    ).toBe(false);
    expect(
      calendarRuntimeSchema.safeParse({
        ...model,
        items: [{ ...model.items[0], secondScheduleId: 'x' }],
      }).success,
    ).toBe(false);
    expect(
      calendarRuntimeSchema.safeParse({
        ...model,
        items: [{ ...model.items[0], nutrition: { ...model.items[0].nutrition, totalLoad: 1 } }],
      }).success,
    ).toBe(false);
  });
});
