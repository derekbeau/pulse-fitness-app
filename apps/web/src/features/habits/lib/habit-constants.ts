import type { HabitConfig, HabitTrackingType } from '../types';

export const INDEFINITE_PAUSE_DATE = '9999-12-31';
export const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

export const habitEmojiOptions = [
  '💧',
  '💊',
  '🥗',
  '😴',
  '🧘',
  '📚',
  '🥦',
  '🏃',
  '🏋️',
  '🚴',
  '🥾',
  '🧃',
  '☀️',
  '🌙',
  '🛌',
  '🧠',
  '🫀',
  '🥕',
  '🍎',
  '🥑',
  '🍵',
  '☕',
  '🧴',
  '🪥',
  '🧼',
  '🎯',
  '📝',
  '🎵',
  '🌿',
  '🚰',
] as const;

export const trackingTypeLabels: Record<HabitTrackingType, string> = {
  boolean: 'Check off',
  numeric: 'Count',
  time: 'Time',
};

export const trackingSurfaceClasses: Record<HabitTrackingType, string> = {
  boolean:
    'bg-[var(--color-accent-pink)] text-on-pink dark:bg-card dark:text-foreground dark:border-l-4 dark:border-l-pink-500',
  numeric:
    'bg-[var(--color-accent-cream)] text-on-cream dark:bg-card dark:text-foreground dark:border-l-4 dark:border-l-amber-500',
  time: 'bg-[var(--color-accent-mint)] text-on-mint dark:bg-card dark:text-foreground dark:border-l-4 dark:border-l-emerald-500',
};

export const defaultHabitConfigs: HabitConfig[] = [
  {
    id: 'hydrate',
    name: 'Hydrate',
    emoji: '💧',
    trackingType: 'numeric',
    target: 8,
    unit: 'glasses',
    frequency: 'daily',
    frequencyTarget: null,
    scheduledDays: null,
    pausedUntil: null,
  },
  {
    id: 'vitamins',
    name: 'Take vitamins',
    emoji: '💊',
    trackingType: 'boolean',
    target: null,
    unit: null,
    frequency: 'daily',
    frequencyTarget: null,
    scheduledDays: null,
    pausedUntil: null,
  },
  {
    id: 'protein',
    name: 'Protein goal',
    emoji: '🥗',
    trackingType: 'numeric',
    target: 120,
    unit: 'grams',
    frequency: 'daily',
    frequencyTarget: null,
    scheduledDays: null,
    pausedUntil: null,
  },
  {
    id: 'sleep',
    name: 'Sleep',
    emoji: '😴',
    trackingType: 'time',
    target: 8,
    unit: 'hours',
    frequency: 'daily',
    frequencyTarget: null,
    scheduledDays: null,
    pausedUntil: null,
  },
  {
    id: 'mobility',
    name: 'Mobility warm-up',
    emoji: '🧘',
    trackingType: 'boolean',
    target: null,
    unit: null,
    frequency: 'daily',
    frequencyTarget: null,
    scheduledDays: null,
    pausedUntil: null,
  },
];
