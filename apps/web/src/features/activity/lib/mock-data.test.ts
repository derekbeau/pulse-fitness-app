import { describe, expect, it } from 'vitest';
import {
  Bike,
  Flower2,
  Footprints,
  MoreHorizontal,
  Mountain,
  StretchHorizontal,
  Timer,
  Waves,
} from 'lucide-react';

import {
  activityTypeOptions,
  getActivityTypeBadgeClasses,
  getActivityTypeIcon,
  getActivityTypeLabel,
  mockActivities,
} from '@/features/activity';

describe('activity mock data', () => {
  it('provides 10-12 realistic activities spanning multiple weeks', () => {
    expect(mockActivities).toHaveLength(11);
    expect(mockActivities[0]?.date).toBe('2026-03-04');
    expect(mockActivities.at(-1)?.date).toBe('2026-02-17');

    expect(mockActivities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ durationMinutes: 30, name: 'Morning Walk', type: 'walking' }),
        expect.objectContaining({ durationMinutes: 20, name: 'Evening Walk', type: 'walking' }),
        expect.objectContaining({
          durationMinutes: 15,
          name: 'Morning Stretch Routine',
          type: 'stretching',
        }),
        expect.objectContaining({
          durationMinutes: 20,
          name: 'Hip Opener Flow',
          type: 'stretching',
        }),
        expect.objectContaining({ durationMinutes: 45, name: 'Yoga with Adriene', type: 'yoga' }),
        expect.objectContaining({ durationMinutes: 25, name: 'Zone 2 Run', type: 'running' }),
        expect.objectContaining({ durationMinutes: 30, name: 'Peloton Ride', type: 'cycling' }),
        expect.objectContaining({
          durationMinutes: 90,
          name: 'Trail Hike - Blue Ridge',
          type: 'hiking',
        }),
      ]),
    );
  });

  it('links some activities back to journal previews', () => {
    const linkedActivities = mockActivities.filter(
      (activity) => activity.linkedJournalEntries.length > 0,
    );

    expect(linkedActivities.length).toBeGreaterThanOrEqual(5);
    expect(linkedActivities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          linkedJournalEntries: expect.arrayContaining([
            expect.objectContaining({ title: 'Feeling More Energetic' }),
          ]),
        }),
        expect.objectContaining({
          linkedJournalEntries: expect.arrayContaining([
            expect.objectContaining({ title: 'First 5K Completed!' }),
          ]),
        }),
      ]),
    );
  });

  it('exposes icon, color, and label helpers for every activity type', () => {
    const expectedIcons = {
      cycling: Bike,
      hiking: Mountain,
      other: MoreHorizontal,
      running: Timer,
      stretching: StretchHorizontal,
      swimming: Waves,
      walking: Footprints,
      yoga: Flower2,
    } as const;

    activityTypeOptions.forEach((type) => {
      expect(getActivityTypeIcon(type)).toBe(expectedIcons[type]);
      expect(getActivityTypeBadgeClasses(type)).toContain('border-transparent');
      expect(getActivityTypeLabel(type)).toMatch(/[A-Z]/);
    });
  });
});
