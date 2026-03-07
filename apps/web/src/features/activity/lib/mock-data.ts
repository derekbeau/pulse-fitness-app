import type { LucideIcon } from 'lucide-react';
import {
  Bike,
  Flower2,
  Footprints,
  Mountain,
  MoreHorizontal,
  StretchHorizontal,
  Timer,
  Waves,
} from 'lucide-react';

import type { Activity, ActivityType } from '../types';

type ActivityTypeMetadata = {
  badgeClassName: string;
  icon: LucideIcon;
  label: string;
};

const activityTypeMetadata: Record<ActivityType, ActivityTypeMetadata> = {
  walking: {
    badgeClassName:
      'border-transparent bg-emerald-200 text-emerald-950 dark:bg-emerald-500/20 dark:text-emerald-400',
    icon: Footprints,
    label: 'Walking',
  },
  running: {
    badgeClassName:
      'border-transparent bg-rose-200 text-rose-950 dark:bg-rose-500/20 dark:text-rose-400',
    icon: Timer,
    label: 'Running',
  },
  stretching: {
    badgeClassName:
      'border-transparent bg-sky-200 text-sky-950 dark:bg-sky-500/20 dark:text-sky-400',
    icon: StretchHorizontal,
    label: 'Stretching',
  },
  yoga: {
    badgeClassName:
      'border-transparent bg-violet-200 text-violet-950 dark:bg-violet-500/20 dark:text-violet-400',
    icon: Flower2,
    label: 'Yoga',
  },
  cycling: {
    badgeClassName:
      'border-transparent bg-amber-200 text-amber-950 dark:bg-amber-500/20 dark:text-amber-400',
    icon: Bike,
    label: 'Cycling',
  },
  swimming: {
    badgeClassName:
      'border-transparent bg-cyan-200 text-cyan-950 dark:bg-cyan-500/20 dark:text-cyan-400',
    icon: Waves,
    label: 'Swimming',
  },
  hiking: {
    badgeClassName:
      'border-transparent bg-lime-200 text-lime-950 dark:bg-lime-500/20 dark:text-lime-400',
    icon: Mountain,
    label: 'Hiking',
  },
  other: {
    badgeClassName:
      'border-transparent bg-slate-200 text-slate-950 dark:bg-slate-500/20 dark:text-slate-300',
    icon: MoreHorizontal,
    label: 'Other',
  },
};

export const activityTypeOptions: ActivityType[] = [
  'walking',
  'running',
  'stretching',
  'yoga',
  'cycling',
  'swimming',
  'hiking',
  'other',
];

export const mockActivities: Activity[] = [
  {
    id: 'activity-peloton-ride-2026-03-04',
    date: '2026-03-04',
    type: 'cycling',
    name: 'Peloton Ride',
    durationMinutes: 30,
    notes: 'Low-impact ride with a steady Zone 2 effort before breakfast.',
    linkedJournalEntries: [
      {
        id: 'journal-week-12-summary',
        title: 'Week 12 Summary',
      },
    ],
  },
  {
    id: 'activity-evening-walk-2026-03-03',
    date: '2026-03-03',
    type: 'walking',
    name: 'Evening Walk',
    durationMinutes: 20,
    notes: 'Easy neighborhood loop to unwind after dinner.',
    linkedJournalEntries: [],
  },
  {
    id: 'activity-hip-opener-flow-2026-03-02',
    date: '2026-03-02',
    type: 'stretching',
    name: 'Hip Opener Flow',
    durationMinutes: 20,
    notes: 'Focused on hips, calves, and thoracic rotation after leg day.',
    linkedJournalEntries: [
      {
        id: 'journal-week-12-summary',
        title: 'Week 12 Summary',
      },
    ],
  },
  {
    id: 'activity-blue-ridge-hike-2026-03-01',
    date: '2026-03-01',
    type: 'hiking',
    name: 'Trail Hike - Blue Ridge',
    durationMinutes: 90,
    notes: 'Rolling trail loop with a few steep climbs and plenty of recovery stops.',
    linkedJournalEntries: [
      {
        id: 'journal-week-12-summary',
        title: 'Week 12 Summary',
      },
    ],
  },
  {
    id: 'activity-zone-2-run-2026-02-28',
    date: '2026-02-28',
    type: 'running',
    name: 'Zone 2 Run',
    durationMinutes: 25,
    notes: 'Kept pace conversational and finished with a controlled final kilometer.',
    linkedJournalEntries: [
      {
        id: 'journal-first-5k-completed',
        title: 'First 5K Completed!',
      },
    ],
  },
  {
    id: 'activity-yoga-with-adriene-2026-02-27',
    date: '2026-02-27',
    type: 'yoga',
    name: 'Yoga with Adriene',
    durationMinutes: 45,
    notes: 'Full-body flow with balance work and a long cooldown on the mat.',
    linkedJournalEntries: [],
  },
  {
    id: 'activity-morning-walk-2026-02-25',
    date: '2026-02-25',
    type: 'walking',
    name: 'Morning Walk',
    durationMinutes: 30,
    notes: 'Brisk walk before work with a few short hills to raise heart rate.',
    linkedJournalEntries: [
      {
        id: 'journal-feeling-more-energetic',
        title: 'Feeling More Energetic',
      },
    ],
  },
  {
    id: 'activity-morning-stretch-routine-2026-02-23',
    date: '2026-02-23',
    type: 'stretching',
    name: 'Morning Stretch Routine',
    durationMinutes: 15,
    notes: 'Quick hamstring, shoulder, and ankle mobility circuit before sitting down to work.',
    linkedJournalEntries: [],
  },
  {
    id: 'activity-recovery-swim-2026-02-21',
    date: '2026-02-21',
    type: 'swimming',
    name: 'Recovery Swim',
    durationMinutes: 35,
    notes: 'Easy laps with pull-buoy work to keep effort light and smooth.',
    linkedJournalEntries: [],
  },
  {
    id: 'activity-neighborhood-bike-2026-02-19',
    date: '2026-02-19',
    type: 'cycling',
    name: 'Neighborhood Spin',
    durationMinutes: 40,
    notes: 'Casual outdoor ride with a few cadence pushes on the flat sections.',
    linkedJournalEntries: [],
  },
  {
    id: 'activity-sauna-mobility-2026-02-17',
    date: '2026-02-17',
    type: 'other',
    name: 'Sauna + Mobility Circuit',
    durationMinutes: 25,
    notes: 'Alternated light mobility drills with short sauna rounds for recovery.',
    linkedJournalEntries: [
      {
        id: 'journal-feeling-more-energetic',
        title: 'Feeling More Energetic',
      },
    ],
  },
];

export function getActivityTypeBadgeClasses(type: ActivityType) {
  return activityTypeMetadata[type].badgeClassName;
}

export function getActivityTypeIcon(type: ActivityType) {
  return activityTypeMetadata[type].icon;
}

export function getActivityTypeLabel(type: ActivityType) {
  return activityTypeMetadata[type].label;
}
