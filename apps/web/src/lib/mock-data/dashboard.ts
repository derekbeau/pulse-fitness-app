import { addDays, formatDateKey, getToday, normalizeDate, parseDateInput, toDateKey } from '@/lib/date';

export interface MacroStat {
  actual: number;
  target: number;
}

export interface DailySnapshot {
  weight: number;
  weightYesterday: number;
  macros: {
    calories: MacroStat;
    protein: MacroStat;
    carbs: MacroStat;
    fat: MacroStat;
  };
  workoutName: string | null;
  habitsCompleted: number;
  habitsTotal: number;
}

export interface HabitEntry {
  date: string;
  completed: boolean;
}

export interface Habit {
  id: string;
  name: string;
  entries: HabitEntry[];
  currentStreak: number;
}

export interface WeightTrendEntry {
  date: string;
  value: number;
}

export interface MacroTrendEntry {
  date: string;
  calories: number;
  protein: number;
}

export interface RecentWorkoutSession {
  id: string;
  name: string;
  date: string;
  totalSets: number;
  totalReps: number;
  duration: number;
}

export interface DashboardDayActivity {
  hasWorkout: boolean;
  hasMeals: boolean;
}

const DAYS = 30;

const dayOffsets = Array.from({ length: DAYS }, (_, index) => DAYS - 1 - index);
const today = getToday();

const getCurrentStreak = (entries: HabitEntry[]): number => {
  let streak = 0;

  for (let index = entries.length - 1; index >= 0; index -= 1) {
    if (!entries[index]?.completed) {
      break;
    }

    streak += 1;
  }

  return streak;
};

const buildHabit = (id: string, name: string, missedOffsets: number[]): Habit => {
  const missedDays = new Set(missedOffsets);

  const entries = dayOffsets.map((daysAgo) => ({
    date: formatDateKey(addDays(today, -daysAgo)),
    completed: !missedDays.has(daysAgo),
  }));

  return {
    id,
    name,
    entries,
    currentStreak: getCurrentStreak(entries),
  };
};

const weightVariance = [0.1, -0.05, 0.08, -0.1, 0.05, -0.03, 0.06, -0.08, 0.02, -0.04];

export const mockWeightTrend: WeightTrendEntry[] = dayOffsets.map((daysAgo, index) => ({
  date: formatDateKey(addDays(today, -daysAgo)),
  value: Number((178.1 - index * 0.095 + weightVariance[index % weightVariance.length]).toFixed(1)),
}));

const calorieVariance = [-220, 80, 140, -60, 210, -180, 120, -90, 60, -40, 170, -130, 90, -50];
const proteinVariance = [-18, 6, 14, -5, 12, -10, 8, -4, 11, -6, 13, -9];

export const mockMacroTrend: MacroTrendEntry[] = dayOffsets.map((daysAgo, index) => ({
  date: formatDateKey(addDays(today, -daysAgo)),
  calories: 2050 + calorieVariance[index % calorieVariance.length] + (index % 6 === 0 ? 90 : 0),
  protein: 160 + proteinVariance[index % proteinVariance.length] + (index % 5 === 0 ? 8 : 0),
}));

export const mockHabits: Habit[] = [
  buildHabit('habit-creatine', 'Creatine', [22, 14, 6]),
  buildHabit('habit-steps', '10k Steps', [24, 20, 16, 12, 9, 4]),
  buildHabit('habit-meditate', 'Meditate', [27, 26, 19, 13, 8, 7, 2]),
  buildHabit('habit-sleep', 'Sleep 7h+', [21, 18, 17, 15, 11, 5, 1]),
  buildHabit('habit-read', 'Read 30min', [28, 23, 22, 20, 18, 10, 3]),
  buildHabit('habit-stretch', 'Stretch', [25, 24, 14, 9, 6, 5]),
];

const latestWeight = mockWeightTrend.at(-1)?.value ?? 175.2;
const yesterdayWeight = mockWeightTrend.at(-2)?.value ?? 175.8;

export const mockDailySnapshot: DailySnapshot = {
  weight: latestWeight,
  weightYesterday: yesterdayWeight,
  macros: {
    calories: { actual: 1850, target: 2200 },
    protein: { actual: 145, target: 180 },
    carbs: { actual: 200, target: 250 },
    fat: { actual: 65, target: 73 },
  },
  workoutName: 'Upper Push A',
  habitsCompleted: mockHabits.filter((habit) => habit.entries.at(-1)?.completed).length,
  habitsTotal: mockHabits.length,
};

const toWorkoutDate = (daysAgo: number, hour: number): string => {
  const workoutDate = addDays(today, -daysAgo);
  workoutDate.setHours(hour, 15, 0, 0);
  return workoutDate.toISOString();
};

export const mockRecentWorkouts: RecentWorkoutSession[] = [
  {
    id: 'wsn-001',
    name: 'Upper Push A',
    date: toWorkoutDate(1, 18),
    totalSets: 18,
    totalReps: 142,
    duration: 62,
  },
  {
    id: 'wsn-002',
    name: 'Lower Strength',
    date: toWorkoutDate(3, 17),
    totalSets: 20,
    totalReps: 128,
    duration: 71,
  },
  {
    id: 'wsn-003',
    name: 'Upper Pull A',
    date: toWorkoutDate(6, 19),
    totalSets: 17,
    totalReps: 136,
    duration: 58,
  },
  {
    id: 'wsn-004',
    name: 'Conditioning Circuit',
    date: toWorkoutDate(9, 18),
    totalSets: 14,
    totalReps: 180,
    duration: 44,
  },
  {
    id: 'wsn-005',
    name: 'Upper Push B',
    date: toWorkoutDate(14, 17),
    totalSets: 16,
    totalReps: 124,
    duration: 56,
  },
];

const macroTrendByDate = new Map(mockMacroTrend.map((entry) => [entry.date, entry]));
const weightTrendByDate = new Map(mockWeightTrend.map((entry) => [entry.date, entry.value]));
const workoutByDate = new Map(
  mockRecentWorkouts.map((session) => [toDateKey(parseDateInput(session.date)), session.name]),
);

const getMacrosForDate = (dateKey: string): DailySnapshot['macros'] => {
  const macroEntry = macroTrendByDate.get(dateKey);

  if (!macroEntry) {
    return {
      calories: { actual: 0, target: 2200 },
      protein: { actual: 0, target: 180 },
      carbs: { actual: 0, target: 250 },
      fat: { actual: 0, target: 73 },
    };
  }

  return {
    calories: { actual: macroEntry.calories, target: 2200 },
    protein: { actual: macroEntry.protein, target: 180 },
    carbs: { actual: Math.round(macroEntry.calories / 11), target: 250 },
    fat: { actual: Math.round(macroEntry.calories / 32), target: 73 },
  };
};

const getCompletedHabitsForDate = (dateKey: string): number => {
  return mockHabits.filter((habit) =>
    habit.entries.some((entry) => entry.date === dateKey && entry.completed),
  ).length;
};

export const getMockDayActivity = (date: Date): DashboardDayActivity => {
  const dateKey = toDateKey(date);
  const hasWorkout = workoutByDate.has(dateKey);
  const macroEntry = macroTrendByDate.get(dateKey);
  const hasMeals = Boolean(macroEntry && macroEntry.calories > 0 && macroEntry.protein > 0);

  return { hasWorkout, hasMeals };
};

export const getMockSnapshotForDate = (date: Date): DailySnapshot => {
  const normalizedDate = normalizeDate(date);
  const dateKey = toDateKey(normalizedDate);
  const todayKey = toDateKey(today);

  if (dateKey === todayKey) {
    return mockDailySnapshot;
  }

  const yesterdayKey = toDateKey(addDays(normalizedDate, -1));
  const weight = weightTrendByDate.get(dateKey) ?? mockDailySnapshot.weight;
  const weightYesterday = weightTrendByDate.get(yesterdayKey) ?? weight;

  return {
    weight,
    weightYesterday,
    macros: getMacrosForDate(dateKey),
    workoutName: workoutByDate.get(dateKey) ?? null,
    habitsCompleted: getCompletedHabitsForDate(dateKey),
    habitsTotal: mockHabits.length,
  };
};
