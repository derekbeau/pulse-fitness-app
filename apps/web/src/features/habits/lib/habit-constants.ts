import type { HabitConfig, HabitTrackingType } from '../types';

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
  boolean: 'bg-[var(--color-accent-pink)] text-slate-950',
  numeric: 'bg-[var(--color-accent-cream)] text-slate-950',
  time: 'bg-[var(--color-accent-mint)] text-slate-950',
};

export const defaultHabitConfigs: HabitConfig[] = [
  {
    id: 'hydrate',
    name: 'Hydrate',
    emoji: '💧',
    trackingType: 'numeric',
    target: 8,
    unit: 'glasses',
  },
  {
    id: 'vitamins',
    name: 'Take vitamins',
    emoji: '💊',
    trackingType: 'boolean',
    target: null,
    unit: null,
  },
  {
    id: 'protein',
    name: 'Protein goal',
    emoji: '🥗',
    trackingType: 'numeric',
    target: 120,
    unit: 'grams',
  },
  {
    id: 'sleep',
    name: 'Sleep',
    emoji: '😴',
    trackingType: 'time',
    target: 8,
    unit: 'hours',
  },
  {
    id: 'mobility',
    name: 'Mobility warm-up',
    emoji: '🧘',
    trackingType: 'boolean',
    target: null,
    unit: null,
  },
];
