import { DASHBOARD_WIDGET_IDS, type Habit } from '@pulse/shared';
import { describe, expect, it } from 'vitest';

import {
  DASHBOARD_WIDGET_CATEGORY_ORDER,
  DASHBOARD_WIDGET_CATEGORY_TITLES,
  HABIT_DAILY_WIDGET_PREFIX,
  getHabitIdFromDailyWidgetId,
  getStaticWidgetsByCategory,
  getWidgetLabel,
  isDashboardStaticWidgetId,
  isHabitDailyWidgetId,
  reorderVisibleWidgets,
  toHabitDailyWidgetId,
} from './widget-utils';

const habit: Habit = {
  active: true,
  createdAt: 1,
  description: null,
  emoji: null,
  frequency: 'daily',
  frequencyTarget: null,
  id: 'habit-1',
  name: 'Hydrate',
  pausedUntil: null,
  scheduledDays: null,
  sortOrder: 0,
  target: null,
  trackingType: 'boolean',
  unit: null,
  updatedAt: 1,
  userId: 'user-1',
};

describe('widget-utils', () => {
  describe('habit daily widget ids', () => {
    it('creates and parses habit-daily widget ids', () => {
      const widgetId = toHabitDailyWidgetId('habit-1');

      expect(widgetId).toBe('habit-daily:habit-1');
      expect(getHabitIdFromDailyWidgetId(widgetId)).toBe('habit-1');
      expect(HABIT_DAILY_WIDGET_PREFIX).toBe('habit-daily:');
    });

    it('validates habit-daily widget ids', () => {
      expect(isHabitDailyWidgetId('habit-daily:habit-1')).toBe(true);
      expect(isHabitDailyWidgetId('habit-daily:')).toBe(false);
      expect(isHabitDailyWidgetId('snapshot-cards')).toBe(false);
    });
  });

  describe('dashboard static widget ids', () => {
    it('narrows static dashboard widget ids', () => {
      expect(isDashboardStaticWidgetId('snapshot-cards')).toBe(true);
      expect(isDashboardStaticWidgetId('habit-daily:habit-1')).toBe(false);
      expect(isDashboardStaticWidgetId('not-a-widget')).toBe(false);
    });
  });

  describe('reorderVisibleWidgets', () => {
    it('reorders widgets when both ids are present', () => {
      expect(
        reorderVisibleWidgets(['snapshot-cards', 'recent-workouts', 'macro-rings'], 'macro-rings', 'snapshot-cards'),
      ).toEqual(['macro-rings', 'snapshot-cards', 'recent-workouts']);
    });

    it('returns original list reference when reorder is invalid', () => {
      const widgetIds = ['snapshot-cards', 'recent-workouts'];

      expect(reorderVisibleWidgets(widgetIds, 'snapshot-cards', 'snapshot-cards')).toBe(widgetIds);
      expect(reorderVisibleWidgets(widgetIds, 'missing', 'snapshot-cards')).toBe(widgetIds);
      expect(reorderVisibleWidgets(widgetIds, 'snapshot-cards', 'missing')).toBe(widgetIds);
    });
  });

  describe('getWidgetLabel', () => {
    it('returns shared labels for static widgets', () => {
      expect(getWidgetLabel('snapshot-cards', new Map())).toBe(DASHBOARD_WIDGET_IDS['snapshot-cards']);
    });

    it('returns habit labels for habit-daily widgets', () => {
      const habitsById = new Map<string, Habit>([[habit.id, habit]]);

      expect(getWidgetLabel('habit-daily:habit-1', habitsById)).toBe('Hydrate daily status');
      expect(getWidgetLabel('habit-daily:missing', habitsById)).toBe('Habit daily status');
    });

    it('falls back to raw id for unknown widgets', () => {
      expect(getWidgetLabel('unknown-widget', new Map())).toBe('unknown-widget');
    });
  });

  describe('widget categorization', () => {
    it('exposes stable category order and titles', () => {
      expect(DASHBOARD_WIDGET_CATEGORY_ORDER).toEqual(['overview', 'workouts', 'habits', 'nutrition']);
      expect(DASHBOARD_WIDGET_CATEGORY_TITLES).toEqual({
        overview: 'Overview',
        workouts: 'Workouts',
        habits: 'Habits',
        nutrition: 'Nutrition',
      });
    });

    it('groups all static widgets into categories', () => {
      const grouped = getStaticWidgetsByCategory();
      const flattened = DASHBOARD_WIDGET_CATEGORY_ORDER.flatMap((category) => grouped[category]);

      expect(flattened.sort()).toEqual(Object.keys(DASHBOARD_WIDGET_IDS).sort());
      expect(grouped.overview).toContain('snapshot-cards');
      expect(grouped.workouts).toContain('recent-workouts');
      expect(grouped.habits).toContain('habit-chain');
      expect(grouped.nutrition).toContain('macro-rings');
    });
  });
});
