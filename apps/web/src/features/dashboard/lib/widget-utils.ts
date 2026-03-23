import { DASHBOARD_WIDGET_IDS, type Habit } from '@pulse/shared';

const DASHBOARD_WIDGET_CATEGORY_ORDER_VALUES = [
  'overview',
  'workouts',
  'habits',
  'nutrition',
] as const;

export const HABIT_DAILY_WIDGET_PREFIX = 'habit-daily:';

export type WidgetCategoryId = (typeof DASHBOARD_WIDGET_CATEGORY_ORDER_VALUES)[number];
export type DashboardStaticWidgetId = keyof typeof DASHBOARD_WIDGET_IDS;
export type HabitDailyWidgetId = `${typeof HABIT_DAILY_WIDGET_PREFIX}${string}`;

export const DASHBOARD_WIDGET_CATEGORY_TITLES: Record<WidgetCategoryId, string> = {
  overview: 'Overview',
  workouts: 'Workouts',
  habits: 'Habits',
  nutrition: 'Nutrition',
};

export const DASHBOARD_STATIC_WIDGET_CATEGORY_MAP: Record<
  DashboardStaticWidgetId,
  WidgetCategoryId
> = {
  'snapshot-cards': 'overview',
  'trend-sparklines': 'overview',
  'log-weight': 'overview',
  'weight-trend': 'overview',
  'recent-workouts': 'workouts',
  'habit-chain': 'habits',
  'macro-rings': 'nutrition',
};

export const DASHBOARD_WIDGET_CATEGORY_ORDER: WidgetCategoryId[] = [
  ...DASHBOARD_WIDGET_CATEGORY_ORDER_VALUES,
];

export function isDashboardStaticWidgetId(value: string): value is DashboardStaticWidgetId {
  return value in DASHBOARD_WIDGET_IDS;
}

export function isHabitDailyWidgetId(value: string): value is HabitDailyWidgetId {
  return (
    value.startsWith(HABIT_DAILY_WIDGET_PREFIX) && value.length > HABIT_DAILY_WIDGET_PREFIX.length
  );
}

export function toHabitDailyWidgetId(habitId: string): HabitDailyWidgetId {
  return `${HABIT_DAILY_WIDGET_PREFIX}${habitId}`;
}

export function getHabitIdFromDailyWidgetId(widgetId: HabitDailyWidgetId) {
  return widgetId.slice(HABIT_DAILY_WIDGET_PREFIX.length);
}

export function reorderVisibleWidgets(widgetIds: string[], activeId: string, overId: string) {
  const oldIndex = widgetIds.indexOf(activeId);
  const newIndex = widgetIds.indexOf(overId);
  if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) {
    return widgetIds;
  }

  const reordered = [...widgetIds];
  const [moved] = reordered.splice(oldIndex, 1);
  reordered.splice(newIndex, 0, moved);
  return reordered;
}

export function getWidgetLabel(widgetId: string, habitsById: Map<string, Habit>) {
  if (isDashboardStaticWidgetId(widgetId)) {
    return DASHBOARD_WIDGET_IDS[widgetId];
  }

  if (isHabitDailyWidgetId(widgetId)) {
    const habitId = getHabitIdFromDailyWidgetId(widgetId);
    const habit = habitsById.get(habitId);
    return habit ? `${habit.name} daily status` : 'Habit daily status';
  }

  return widgetId;
}

export function getStaticWidgetsByCategory() {
  const dashboardStaticWidgets = Object.keys(DASHBOARD_WIDGET_IDS) as DashboardStaticWidgetId[];

  return DASHBOARD_WIDGET_CATEGORY_ORDER.reduce<Record<WidgetCategoryId, DashboardStaticWidgetId[]>>(
    (accumulator, categoryId) => {
      accumulator[categoryId] = dashboardStaticWidgets.filter(
        (widgetId) => DASHBOARD_STATIC_WIDGET_CATEGORY_MAP[widgetId] === categoryId,
      );
      return accumulator;
    },
    {
      overview: [],
      workouts: [],
      habits: [],
      nutrition: [],
    },
  );
}
