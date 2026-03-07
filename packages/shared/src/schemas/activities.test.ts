import { describe, expect, it } from 'vitest';

import { activitySchema, type Activity, type ActivityType } from './activities';

describe('activitySchema', () => {
  it('parses a valid activity payload', () => {
    const payload = activitySchema.parse({
      id: 'activity-1',
      userId: 'user-1',
      date: '2026-03-07',
      type: 'walking',
      name: ' Evening walk ',
      durationMinutes: 35,
      notes: null,
      createdAt: 1,
      updatedAt: 2,
    });

    expect(payload).toEqual({
      id: 'activity-1',
      userId: 'user-1',
      date: '2026-03-07',
      type: 'walking',
      name: 'Evening walk',
      durationMinutes: 35,
      notes: null,
      createdAt: 1,
      updatedAt: 2,
    });
  });

  it('rejects invalid type, date, and duration values', () => {
    expect(() =>
      activitySchema.parse({
        id: 'activity-1',
        userId: 'user-1',
        date: '2026/03/07',
        type: 'rowing',
        name: 'Cardio',
        durationMinutes: 0,
        notes: null,
        createdAt: 1,
        updatedAt: 2,
      }),
    ).toThrow();
  });

  it('infers the Activity type from the schema', () => {
    const type: ActivityType = 'yoga';
    const payload: Activity = {
      id: 'activity-2',
      userId: 'user-1',
      date: '2026-03-08',
      type,
      name: 'Mobility flow',
      durationMinutes: 20,
      notes: 'Focused on hips and shoulders',
      createdAt: 2,
      updatedAt: 3,
    };

    expect(payload.type).toBe('yoga');
  });
});
