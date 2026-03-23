import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { basename, join, relative, resolve } from 'node:path';

import { and, eq, isNull, lt, max, or } from 'drizzle-orm';

import {
  bodyWeight,
  exercises,
  foods,
  habitEntries,
  habits,
  mealItems,
  meals,
  nutritionLogs,
  sessionSets,
  templateExercises,
  workoutSessions,
  workoutTemplates,
} from '../db/schema/index.js';

export const DEFAULT_STATIC_DATA_ROOT = '/Volumes/meridian/Projects/health-fitness-static/data';
export const DEFAULT_WORKOUT_TEMPLATE_SUBPATH = join('workouts', 'templates');
export const DEFAULT_WORKOUT_SESSION_SUBPATH = 'workouts';

const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;
const DAILY_FILENAME_PATTERN = /^(\d{4}-\d{2}-\d{2})\.json$/u;
const TWENTY_FOUR_HOUR_TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/u;
const TWELVE_HOUR_TIME_PATTERN = /^(\d{1,2}):([0-5]\d)\s*([AaPp][Mm])$/u;
const WHITESPACE_PATTERN = /\s+/gu;

type Logger = Pick<Console, 'info' | 'warn' | 'error'>;

type DateWeightMap = Map<string, number>;

type FoodLookup = Map<string, string>;

type HabitLookupEntry = {
  id: string;
  name: string;
  trackingType: 'boolean' | 'numeric' | 'time';
};

type HabitLookup = Map<string, HabitLookupEntry>;

type MigrationOptions = {
  userId: string;
  dataRoot?: string;
  logger?: Logger;
};

export type MigrationSummary = {
  processedDays: number;
  failedDays: number;
  dailyLogDays: number;
  bodyWeightFileEntries: number;
  totalMeals: number;
  totalHabitEntries: number;
  totalWeightEntries: number;
};

export type WorkoutMigrationSummary = {
  processedTemplates: number;
  failedTemplates: number;
  processedSessions: number;
  failedSessions: number;
  totalTemplateExercises: number;
  totalSessionSets: number;
  createdExercises: number;
};

export type FoodsMigrationSummary = {
  inserted: number;
  skipped: number;
  lastUsedAtUpdated: number;
};

export type ParsedMealItem = {
  name: string;
  amount: number;
  unit: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number | null;
  sugar: number | null;
};

export type ParsedMeal = {
  name: string;
  time: string | null;
  notes: string | null;
  items: ParsedMealItem[];
};

export type ParsedHabitEntry = {
  name: string;
  completed: boolean;
  value: number | null;
};

export type ParsedDailyLog = {
  date: string;
  meals: ParsedMeal[];
  habits: ParsedHabitEntry[];
  bodyWeight: number | null;
};

type WorkoutTemplateSectionType = 'warmup' | 'main' | 'cooldown';
type ExerciseCategory = 'compound' | 'isolation' | 'cardio' | 'mobility';

type ParsedTemplateExercise = {
  name: string;
  section: WorkoutTemplateSectionType;
  orderIndex: number;
  sets: number | null;
  repsMin: number | null;
  repsMax: number | null;
  tempo: string | null;
  restSeconds: number | null;
  supersetGroup: string | null;
  notes: string | null;
  cues: string[];
  category: ExerciseCategory | null;
  muscleGroups: string[];
  equipment: string | null;
};

type ParsedWorkoutTemplateRecord = {
  sourceKey: string;
  name: string;
  description: string | null;
  tags: string[];
  exercises: ParsedTemplateExercise[];
};

type ParsedSessionSet = {
  exerciseName: string;
  setNumber: number;
  weight: number | null;
  reps: number | null;
  completed: boolean;
  skipped: boolean;
  section: WorkoutTemplateSectionType | null;
  notes: string | null;
  category: ExerciseCategory | null;
  muscleGroups: string[];
  equipment: string | null;
};

type ParsedWorkoutSessionRecord = {
  sourceKey: string;
  name: string;
  templateMatchName: string;
  date: string;
  startedAt: number;
  completedAt: number;
  duration: number;
  sets: ParsedSessionSet[];
};

type ExerciseLookupEntry = {
  id: string;
  userId: string | null;
};

type ExerciseCreateDefaults = {
  category: ExerciseCategory | null;
  muscleGroups: string[];
  equipment: string | null;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const normalizeLookupKey = (value: string) => value.trim().toLowerCase().replace(WHITESPACE_PATTERN, ' ');

const normalizeText = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const toDateKey = (value: unknown): string | null => {
  if (typeof value === 'string') {
    const trimmed = value.trim();

    if (DATE_KEY_PATTERN.test(trimmed)) {
      return trimmed;
    }

    const fromIso = trimmed.slice(0, 10);
    if (DATE_KEY_PATTERN.test(fromIso)) {
      return fromIso;
    }

    return null;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    const asDate = new Date(value);
    const iso = asDate.toISOString().slice(0, 10);
    return DATE_KEY_PATTERN.test(iso) ? iso : null;
  }

  return null;
};

const toNumber = (value: unknown): number | null => {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === 'string') {
    const cleaned = value.trim().replace(/,/gu, '');
    if (cleaned.length === 0) {
      return null;
    }

    const parsed = Number.parseFloat(cleaned);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
};

const toPositiveNumber = (value: unknown): number | null => {
  const numeric = toNumber(value);
  if (numeric === null || numeric <= 0) {
    return null;
  }

  return numeric;
};

const toNonnegativeNumber = (value: unknown, fallback = 0): number => {
  const numeric = toNumber(value);
  if (numeric === null || numeric < 0) {
    return fallback;
  }

  return numeric;
};

const toBoolean = (value: unknown): boolean | null => {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return value > 0;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();

    if (['true', 'yes', 'y', 'done', 'completed', '1'].includes(normalized)) {
      return true;
    }

    if (['false', 'no', 'n', '0', 'missed', 'skipped'].includes(normalized)) {
      return false;
    }
  }

  return null;
};

const toTwentyFourHourTime = (value: unknown): string | null => {
  const raw = normalizeText(value);
  if (!raw) {
    return null;
  }

  const trimmed = raw.toUpperCase();

  const twentyFourHourMatch = TWENTY_FOUR_HOUR_TIME_PATTERN.exec(trimmed);
  if (twentyFourHourMatch) {
    return `${twentyFourHourMatch[1]}:${twentyFourHourMatch[2]}`;
  }

  const twelveHourMatch = TWELVE_HOUR_TIME_PATTERN.exec(trimmed);
  if (!twelveHourMatch) {
    return null;
  }

  const hours = Number.parseInt(twelveHourMatch[1], 10);
  const minutes = twelveHourMatch[2];
  const meridiem = twelveHourMatch[3];

  if (hours < 1 || hours > 12) {
    return null;
  }

  const normalizedHours = meridiem === 'AM' ? (hours === 12 ? 0 : hours) : hours === 12 ? 12 : hours + 12;

  return `${String(normalizedHours).padStart(2, '0')}:${minutes}`;
};

const toTitleCase = (value: string) =>
  value
    .trim()
    .split(WHITESPACE_PATTERN)
    .filter((segment) => segment.length > 0)
    .map((segment) => `${segment[0]?.toUpperCase() ?? ''}${segment.slice(1).toLowerCase()}`)
    .join(' ');

const normalizeMealName = (value: string): string => {
  const normalized = normalizeLookupKey(value);

  if (normalized === 'breakfast') {
    return 'Breakfast';
  }

  if (normalized === 'lunch') {
    return 'Lunch';
  }

  if (normalized === 'dinner') {
    return 'Dinner';
  }

  if (normalized === 'snack' || normalized === 'snacks') {
    return 'Snacks';
  }

  return toTitleCase(value);
};

const getNestedField = (record: Record<string, unknown>, field: string): unknown => {
  if (field in record) {
    return record[field];
  }

  const lowerField = field.toLowerCase();
  const match = Object.entries(record).find(([key]) => key.toLowerCase() === lowerField);

  return match?.[1];
};

const extractFoodItemName = (record: Record<string, unknown>): string | null => {
  const directName = normalizeText(getNestedField(record, 'name'));
  if (directName) {
    return directName;
  }

  const foodName = normalizeText(getNestedField(record, 'foodName'));
  if (foodName) {
    return foodName;
  }

  const label = normalizeText(getNestedField(record, 'label'));
  if (label) {
    return label;
  }

  return null;
};

const extractFoodItemAmount = (record: Record<string, unknown>): number | null => {
  const directAmount = toPositiveNumber(getNestedField(record, 'amount'));
  if (directAmount !== null) {
    return directAmount;
  }

  const quantity = toPositiveNumber(getNestedField(record, 'quantity'));
  const servingSize = toPositiveNumber(getNestedField(record, 'servingSize'));

  if (quantity !== null && servingSize !== null) {
    return quantity * servingSize;
  }

  if (quantity !== null) {
    return quantity;
  }

  if (servingSize !== null) {
    return servingSize;
  }

  return 1;
};

const extractFoodItemUnit = (record: Record<string, unknown>): string => {
  const unit = normalizeText(getNestedField(record, 'unit'));
  if (unit) {
    return unit;
  }

  const servingUnit = normalizeText(getNestedField(record, 'servingUnit'));
  if (servingUnit) {
    return servingUnit;
  }

  return 'serving';
};

const extractMacroValue = (record: Record<string, unknown>, key: string) => {
  const directValue = toNonnegativeNumber(getNestedField(record, key));
  if (directValue > 0) {
    return directValue;
  }

  const macrosField = getNestedField(record, 'macros');
  if (isRecord(macrosField)) {
    return toNonnegativeNumber(getNestedField(macrosField, key));
  }

  return directValue;
};

const parseMealItem = (value: unknown): ParsedMealItem | null => {
  if (!isRecord(value)) {
    return null;
  }

  const name = extractFoodItemName(value);
  if (!name) {
    return null;
  }

  const amount = extractFoodItemAmount(value);
  if (amount === null || amount <= 0) {
    return null;
  }

  return {
    name,
    amount,
    unit: extractFoodItemUnit(value),
    calories: extractMacroValue(value, 'calories'),
    protein: extractMacroValue(value, 'protein'),
    carbs: extractMacroValue(value, 'carbs'),
    fat: extractMacroValue(value, 'fat'),
    fiber: toNumber(getNestedField(value, 'fiber')),
    sugar: toNumber(getNestedField(value, 'sugar')),
  };
};

const parseMeal = (value: unknown, fallbackName: string | null): ParsedMeal | null => {
  if (Array.isArray(value)) {
    const items = value.map((item) => parseMealItem(item)).filter((item): item is ParsedMealItem => item !== null);

    if (items.length === 0) {
      return null;
    }

    return {
      name: normalizeMealName(fallbackName ?? 'Meal'),
      time: null,
      notes: null,
      items,
    };
  }

  if (!isRecord(value)) {
    return null;
  }

  const itemListRaw = getNestedField(value, 'items') ?? getNestedField(value, 'foods') ?? value;
  const rawItems = Array.isArray(itemListRaw) ? itemListRaw : [];
  const items = rawItems
    .map((item) => parseMealItem(item))
    .filter((item): item is ParsedMealItem => item !== null);

  if (items.length === 0) {
    return null;
  }

  const mealName =
    normalizeText(getNestedField(value, 'name')) ??
    normalizeText(getNestedField(value, 'meal')) ??
    fallbackName ??
    'Meal';

  return {
    name: normalizeMealName(mealName),
    time: toTwentyFourHourTime(getNestedField(value, 'time')),
    notes: normalizeText(getNestedField(value, 'notes')),
    items,
  };
};

const parseMealContainer = (value: unknown): ParsedMeal[] => {
  if (Array.isArray(value)) {
    return value
      .map((entry) => parseMeal(entry, null))
      .filter((entry): entry is ParsedMeal => entry !== null);
  }

  if (!isRecord(value)) {
    return [];
  }

  return Object.entries(value)
    .map(([mealName, mealData]) => parseMeal(mealData, mealName))
    .filter((entry): entry is ParsedMeal => entry !== null);
};

const mealSortOrder = new Map([
  ['Breakfast', 0],
  ['Lunch', 1],
  ['Dinner', 2],
  ['Snacks', 3],
]);

export const extractMealsFromDailyLog = (raw: unknown): ParsedMeal[] => {
  if (!isRecord(raw)) {
    return [];
  }

  const candidateSources: unknown[] = [];

  const rootMeals = getNestedField(raw, 'meals');
  if (rootMeals !== undefined) {
    candidateSources.push(rootMeals);
  }

  const nutritionField = getNestedField(raw, 'nutrition');
  if (isRecord(nutritionField)) {
    const nutritionMeals = getNestedField(nutritionField, 'meals');
    if (nutritionMeals !== undefined) {
      candidateSources.push(nutritionMeals);
    }
  }

  const directMealBuckets: Record<string, unknown> = {};
  for (const mealName of ['breakfast', 'lunch', 'dinner', 'snacks']) {
    const bucket = getNestedField(raw, mealName);
    if (bucket !== undefined) {
      directMealBuckets[mealName] = bucket;
    }
  }

  if (Object.keys(directMealBuckets).length > 0) {
    candidateSources.push(directMealBuckets);
  }

  for (const candidate of candidateSources) {
    const parsed = parseMealContainer(candidate);
    if (parsed.length > 0) {
      return parsed.sort((left, right) => {
        const leftOrder = mealSortOrder.get(left.name) ?? Number.MAX_SAFE_INTEGER;
        const rightOrder = mealSortOrder.get(right.name) ?? Number.MAX_SAFE_INTEGER;

        if (leftOrder !== rightOrder) {
          return leftOrder - rightOrder;
        }

        return left.name.localeCompare(right.name);
      });
    }
  }

  return [];
};

const toHabitEntryName = (value: unknown): string | null => {
  if (!isRecord(value)) {
    return null;
  }

  return (
    normalizeText(getNestedField(value, 'name')) ??
    normalizeText(getNestedField(value, 'habit')) ??
    normalizeText(getNestedField(value, 'habitName')) ??
    normalizeText(getNestedField(value, 'label'))
  );
};

const toHabitEntryValue = (value: unknown): number | null => {
  if (!isRecord(value)) {
    return toNumber(value);
  }

  return (
    toNumber(getNestedField(value, 'value')) ??
    toNumber(getNestedField(value, 'amount')) ??
    toNumber(getNestedField(value, 'count')) ??
    toNumber(getNestedField(value, 'minutes'))
  );
};

const toHabitEntryCompleted = (value: unknown, numericValue: number | null): boolean => {
  if (!isRecord(value)) {
    const directBoolean = toBoolean(value);
    if (directBoolean !== null) {
      return directBoolean;
    }

    return numericValue !== null ? numericValue > 0 : false;
  }

  const completedField = toBoolean(getNestedField(value, 'completed'));
  if (completedField !== null) {
    return completedField;
  }

  const doneField = toBoolean(getNestedField(value, 'done'));
  if (doneField !== null) {
    return doneField;
  }

  const checkedField = toBoolean(getNestedField(value, 'checked'));
  if (checkedField !== null) {
    return checkedField;
  }

  return numericValue !== null ? numericValue > 0 : false;
};

const dedupeHabits = (entries: ParsedHabitEntry[]): ParsedHabitEntry[] => {
  const byName = new Map<string, ParsedHabitEntry>();

  for (const entry of entries) {
    byName.set(normalizeLookupKey(entry.name), entry);
  }

  return [...byName.values()];
};

const parseHabitContainer = (value: unknown): ParsedHabitEntry[] => {
  if (Array.isArray(value)) {
    const entries = value
      .map((entry) => {
        if (typeof entry === 'string') {
          const name = normalizeText(entry);
          if (!name) {
            return null;
          }

          return {
            name,
            completed: true,
            value: null,
          } satisfies ParsedHabitEntry;
        }

        if (!isRecord(entry)) {
          return null;
        }

        const name = toHabitEntryName(entry);
        if (!name) {
          return null;
        }

        const numericValue = toHabitEntryValue(entry);

        return {
          name,
          completed: toHabitEntryCompleted(entry, numericValue),
          value: numericValue,
        } satisfies ParsedHabitEntry;
      })
      .filter((entry): entry is ParsedHabitEntry => entry !== null);

    return dedupeHabits(entries);
  }

  if (!isRecord(value)) {
    return [];
  }

  const entries = Object.entries(value)
    .map(([name, entryValue]) => {
      const normalizedName = normalizeText(name);
      if (!normalizedName) {
        return null;
      }

      const numericValue = toHabitEntryValue(entryValue);

      return {
        name: normalizedName,
        completed: toHabitEntryCompleted(entryValue, numericValue),
        value: numericValue,
      } satisfies ParsedHabitEntry;
    })
    .filter((entry): entry is ParsedHabitEntry => entry !== null);

  return dedupeHabits(entries);
};

export const extractHabitEntriesFromDailyLog = (raw: unknown): ParsedHabitEntry[] => {
  if (!isRecord(raw)) {
    return [];
  }

  const candidateSources: unknown[] = [];

  for (const key of ['checklist', 'habitChecklist', 'habitEntries', 'dailyChecklist', 'habits']) {
    const source = getNestedField(raw, key);
    if (source !== undefined) {
      candidateSources.push(source);
    }
  }

  for (const candidate of candidateSources) {
    const parsed = parseHabitContainer(candidate);
    if (parsed.length > 0) {
      return parsed;
    }
  }

  return [];
};

const toWeightValue = (value: unknown): number | null => {
  if (isRecord(value)) {
    return (
      toPositiveNumber(getNestedField(value, 'weight')) ??
      toPositiveNumber(getNestedField(value, 'bodyWeight')) ??
      toPositiveNumber(getNestedField(value, 'value')) ??
      toPositiveNumber(getNestedField(value, 'pounds')) ??
      toPositiveNumber(getNestedField(value, 'lbs'))
    );
  }

  return toPositiveNumber(value);
};

export const extractBodyWeightFromDailyLog = (raw: unknown): number | null => {
  if (!isRecord(raw)) {
    return null;
  }

  const candidateSources: unknown[] = [getNestedField(raw, 'bodyWeight'), getNestedField(raw, 'weight')];

  const metrics = getNestedField(raw, 'metrics');
  if (isRecord(metrics)) {
    candidateSources.push(getNestedField(metrics, 'bodyWeight'));
    candidateSources.push(getNestedField(metrics, 'weight'));
  }

  for (const candidate of candidateSources) {
    const parsedWeight = toWeightValue(candidate);
    if (parsedWeight !== null) {
      return parsedWeight;
    }
  }

  return null;
};

const parseDailyLog = (date: string, raw: unknown): ParsedDailyLog => ({
  date,
  meals: extractMealsFromDailyLog(raw),
  habits: extractHabitEntriesFromDailyLog(raw),
  bodyWeight: extractBodyWeightFromDailyLog(raw),
});

const readJson = async (filePath: string): Promise<unknown> => {
  const contents = await readFile(filePath, 'utf8');
  return JSON.parse(contents) as unknown;
};

const listJsonFiles = async (directoryPath: string): Promise<string[]> => {
  const entries = await readdir(directoryPath, { withFileTypes: true });

  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = join(directoryPath, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await listJsonFiles(fullPath)));
      continue;
    }

    if (!entry.isFile() || !entry.name.endsWith('.json')) {
      continue;
    }

    files.push(fullPath);
  }

  return files;
};

export const loadDailyLogRecords = async (dataRoot: string, logger: Logger): Promise<Map<string, ParsedDailyLog>> => {
  const dailyRoot = join(dataRoot, 'daily');

  let dailyFiles: string[];
  try {
    dailyFiles = await listJsonFiles(dailyRoot);
  } catch (error) {
    logger.warn(`Daily log directory not found or unreadable at ${dailyRoot}: ${String(error)}`);
    return new Map<string, ParsedDailyLog>();
  }

  const records = new Map<string, ParsedDailyLog>();

  for (const filePath of dailyFiles) {
    let payload: unknown;
    try {
      payload = await readJson(filePath);
    } catch (error) {
      logger.warn(`Skipping unreadable daily log file ${filePath}: ${String(error)}`);
      continue;
    }

    const filenameMatch = DAILY_FILENAME_PATTERN.exec(basename(filePath));
    const fileDate = filenameMatch?.[1] ?? null;
    const payloadDate = isRecord(payload) ? toDateKey(getNestedField(payload, 'date')) : null;
    const date = fileDate ?? payloadDate;

    if (!date) {
      logger.warn(`Skipping daily log file with no valid date in filename/content: ${filePath}`);
      continue;
    }

    if (records.has(date)) {
      logger.warn(`Duplicate daily log for ${date} found at ${filePath}; later file wins.`);
    }

    records.set(date, parseDailyLog(date, payload));
  }

  return records;
};

const addWeightEntry = (entries: DateWeightMap, date: string | null, weight: number | null) => {
  if (!date || weight === null) {
    return;
  }

  entries.set(date, weight);
};

const parseWeightRecord = (raw: Record<string, unknown>, fallbackDate: string | null): [string | null, number | null] => {
  const date =
    fallbackDate ??
    toDateKey(getNestedField(raw, 'date')) ??
    toDateKey(getNestedField(raw, 'day')) ??
    toDateKey(getNestedField(raw, 'timestamp'));

  const weight = toWeightValue(raw);

  return [date, weight];
};

export const parseBodyWeightHistory = (raw: unknown): DateWeightMap => {
  const entries = new Map<string, number>();

  const visit = (value: unknown, fallbackDate: string | null) => {
    if (Array.isArray(value)) {
      for (const item of value) {
        visit(item, null);
      }
      return;
    }

    if (isRecord(value)) {
      const [date, weight] = parseWeightRecord(value, fallbackDate);
      addWeightEntry(entries, date, weight);

      for (const nestedCollectionName of ['entries', 'history', 'weights', 'data']) {
        const nested = getNestedField(value, nestedCollectionName);
        if (Array.isArray(nested)) {
          visit(nested, null);
        }
      }

      for (const [key, candidateValue] of Object.entries(value)) {
        const keyAsDate = toDateKey(key);
        if (!keyAsDate) {
          continue;
        }

        if (isRecord(candidateValue)) {
          const [, candidateWeight] = parseWeightRecord(candidateValue, keyAsDate);
          addWeightEntry(entries, keyAsDate, candidateWeight);
          continue;
        }

        addWeightEntry(entries, keyAsDate, toWeightValue(candidateValue));
      }

      return;
    }

    if (fallbackDate) {
      addWeightEntry(entries, fallbackDate, toWeightValue(value));
    }
  };

  visit(raw, null);

  return entries;
};

const loadBodyWeightHistory = async (dataRoot: string, logger: Logger): Promise<DateWeightMap> => {
  const filePath = join(dataRoot, 'body-weight.json');

  let payload: unknown;
  try {
    payload = await readJson(filePath);
  } catch {
    logger.warn(`body-weight.json not found or unreadable at ${filePath}; continuing without it.`);
    return new Map<string, number>();
  }

  return parseBodyWeightHistory(payload);
};

export const mergeWeightEntries = (dailyWeights: DateWeightMap, bodyWeightHistory: DateWeightMap): DateWeightMap => {
  const merged = new Map<string, number>(dailyWeights);

  for (const [date, weight] of bodyWeightHistory) {
    merged.set(date, weight);
  }

  return merged;
};

const buildFoodLookup = (rows: Array<{ id: string; name: string }>): FoodLookup => {
  const lookup = new Map<string, string>();

  for (const row of rows) {
    // meal_items only stores free-text name, so brand-aware matching is not possible here.
    const key = normalizeLookupKey(row.name);

    if (!lookup.has(key)) {
      lookup.set(key, row.id);
    }
  }

  return lookup;
};

const buildHabitLookup = (
  rows: Array<{ id: string; name: string; trackingType: 'boolean' | 'numeric' | 'time' }>,
): HabitLookup => {
  const lookup = new Map<string, HabitLookupEntry>();

  for (const row of rows) {
    const key = normalizeLookupKey(row.name);

    if (!lookup.has(key)) {
      lookup.set(key, row);
    }
  }

  return lookup;
};

const WORKOUT_SECTION_ORDER: WorkoutTemplateSectionType[] = ['warmup', 'main', 'cooldown'];
const SESSION_TIMELESS_FALLBACK_SUFFIX = 'T00:00:00.000Z';
const MIGRATION_ID_HASH_LENGTH = 24;

const toPositiveInteger = (value: unknown): number | null => {
  const numeric = toNumber(value);
  if (numeric === null || numeric <= 0) {
    return null;
  }

  return Math.trunc(numeric);
};

const toNonnegativeInteger = (value: unknown): number | null => {
  const numeric = toNumber(value);
  if (numeric === null || numeric < 0) {
    return null;
  }

  return Math.trunc(numeric);
};

const toTimestampMs = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (value > 1_000_000_000_000) {
      return Math.trunc(value);
    }

    if (value > 1_000_000_000) {
      return Math.trunc(value * 1_000);
    }

    return null;
  }

  const text = normalizeText(value);
  if (!text) {
    return null;
  }

  if (/^-?\d+(\.\d+)?$/u.test(text)) {
    return toTimestampMs(Number.parseFloat(text));
  }

  const parsed = Date.parse(text);
  if (Number.isNaN(parsed)) {
    return null;
  }

  return parsed;
};

type DurationUnit = 'milliseconds' | 'seconds' | 'minutes' | 'auto';

const toDurationMs = (value: unknown, unit: DurationUnit = 'auto'): number | null => {
  const numeric = toNonnegativeInteger(value);
  if (numeric === null) {
    return null;
  }

  if (unit === 'milliseconds') {
    return numeric;
  }

  if (unit === 'seconds') {
    return numeric * 1_000;
  }

  if (unit === 'minutes') {
    return numeric * 60_000;
  }

  // Ambiguous generic duration fields are interpreted as either milliseconds
  // (already >= 1 minute) or minutes.
  if (numeric >= 60_000) {
    return numeric;
  }

  return numeric * 60_000;
};

const toStableMigrationId = (prefix: string, ...parts: string[]) => {
  const source = parts.join('|');
  const digest = createHash('sha1').update(source).digest('hex').slice(0, MIGRATION_ID_HASH_LENGTH);
  return `${prefix}-${digest}`;
};

const toSectionType = (value: unknown): WorkoutTemplateSectionType => {
  const normalized = normalizeLookupKey(typeof value === 'string' ? value : String(value ?? ''));

  if (normalized.includes('warm')) {
    return 'warmup';
  }

  if (normalized.includes('cool') || normalized.includes('recover')) {
    return 'cooldown';
  }

  return 'main';
};

const toExerciseCategory = (value: unknown): ExerciseCategory | null => {
  const text = normalizeText(value);
  if (!text) {
    return null;
  }

  const normalized = normalizeLookupKey(text);

  if (normalized.includes('isolation')) {
    return 'isolation';
  }

  if (normalized.includes('cardio') || normalized.includes('conditioning')) {
    return 'cardio';
  }

  if (normalized.includes('mobility') || normalized.includes('stretch') || normalized.includes('warmup')) {
    return 'mobility';
  }

  if (normalized.includes('compound')) {
    return 'compound';
  }

  return null;
};

const toStringArray = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    const seen = new Set<string>();
    const values: string[] = [];

    for (const item of value) {
      const text = normalizeText(item);
      if (!text) {
        continue;
      }

      const key = normalizeLookupKey(text);
      if (seen.has(key)) {
        continue;
      }

      seen.add(key);
      values.push(text);
    }

    return values;
  }

  const text = normalizeText(value);
  if (!text) {
    return [];
  }

  return toStringArray(text.split(/[|,/]/u).map((segment) => segment.trim()));
};

const parseRepsRange = (value: unknown): { repsMin: number | null; repsMax: number | null } => {
  const directNumber = toPositiveInteger(value);
  if (directNumber !== null) {
    return {
      repsMin: directNumber,
      repsMax: directNumber,
    };
  }

  const text = normalizeText(value);
  if (!text) {
    return {
      repsMin: null,
      repsMax: null,
    };
  }

  const rangeMatch = /(\d+)\s*[-to]+\s*(\d+)/iu.exec(text);
  if (rangeMatch) {
    const minimum = Number.parseInt(rangeMatch[1], 10);
    const maximum = Number.parseInt(rangeMatch[2], 10);

    if (Number.isFinite(minimum) && Number.isFinite(maximum)) {
      return {
        repsMin: Math.min(minimum, maximum),
        repsMax: Math.max(minimum, maximum),
      };
    }
  }

  const singleMatch = /(\d+)/u.exec(text);
  if (singleMatch) {
    const single = Number.parseInt(singleMatch[1], 10);
    if (Number.isFinite(single) && single > 0) {
      return {
        repsMin: single,
        repsMax: single,
      };
    }
  }

  return {
    repsMin: null,
    repsMax: null,
  };
};

const toFallbackWorkoutName = (filePath: string) => {
  const withoutExtension = basename(filePath, '.json').replace(/[-_]/gu, ' ');
  return toTitleCase(withoutExtension || 'Workout');
};

const toTags = (value: unknown) => toStringArray(value).slice(0, 20);

const toExerciseCollection = (value: unknown): unknown[] => {
  if (Array.isArray(value)) {
    return value;
  }

  if (!isRecord(value)) {
    return [];
  }

  const nested =
    getNestedField(value, 'exercises') ??
    getNestedField(value, 'items') ??
    getNestedField(value, 'movements') ??
    getNestedField(value, 'entries');

  if (Array.isArray(nested)) {
    return nested;
  }

  return [value];
};

const extractTemplateSectionSources = (
  value: unknown,
): Array<{ section: WorkoutTemplateSectionType; exercises: unknown[] }> => {
  if (Array.isArray(value)) {
    return [
      {
        section: 'main',
        exercises: value,
      },
    ];
  }

  if (!isRecord(value)) {
    return [];
  }

  const sources: Array<{ section: WorkoutTemplateSectionType; exercises: unknown[] }> = [];

  const explicitSections = getNestedField(value, 'sections');
  if (Array.isArray(explicitSections)) {
    for (const sectionEntry of explicitSections) {
      if (!isRecord(sectionEntry)) {
        continue;
      }

      const section = toSectionType(
        getNestedField(sectionEntry, 'type') ??
          getNestedField(sectionEntry, 'section') ??
          getNestedField(sectionEntry, 'name') ??
          getNestedField(sectionEntry, 'title'),
      );

      const exercises = toExerciseCollection(sectionEntry);
      if (exercises.length > 0) {
        sources.push({ section, exercises });
      }
    }

    if (sources.length > 0) {
      return sources;
    }
  }

  for (const section of WORKOUT_SECTION_ORDER) {
    const sectionValue = getNestedField(value, section);
    if (sectionValue === undefined) {
      continue;
    }

    const exercises = toExerciseCollection(sectionValue);
    if (exercises.length > 0) {
      sources.push({ section, exercises });
    }
  }

  if (sources.length > 0) {
    return sources;
  }

  const fallbackExercises =
    getNestedField(value, 'exercises') ??
    getNestedField(value, 'items') ??
    getNestedField(value, 'movements');
  const exercises = toExerciseCollection(fallbackExercises);
  if (exercises.length > 0) {
    return [
      {
        section: 'main',
        exercises,
      },
    ];
  }

  return [];
};

const parseTemplateExercise = (
  value: unknown,
  section: WorkoutTemplateSectionType,
  orderIndex: number,
): ParsedTemplateExercise | null => {
  if (typeof value === 'string') {
    const name = normalizeText(value);
    if (!name) {
      return null;
    }

    return {
      name,
      section,
      orderIndex,
      sets: null,
      repsMin: null,
      repsMax: null,
      tempo: null,
      restSeconds: null,
      supersetGroup: null,
      notes: null,
      cues: [],
      category: null,
      muscleGroups: [],
      equipment: null,
    };
  }

  if (!isRecord(value)) {
    return null;
  }

  const name =
    normalizeText(getNestedField(value, 'name')) ??
    normalizeText(getNestedField(value, 'exerciseName')) ??
    normalizeText(getNestedField(value, 'exercise')) ??
    normalizeText(getNestedField(value, 'movement')) ??
    normalizeText(getNestedField(value, 'title'));

  if (!name) {
    return null;
  }

  const repsRange = parseRepsRange(
    getNestedField(value, 'repsMin') ??
      getNestedField(value, 'reps') ??
      getNestedField(value, 'repRange') ??
      getNestedField(value, 'targetReps'),
  );

  const muscleGroupsCandidates = [
    toStringArray(getNestedField(value, 'muscleGroups')),
    toStringArray(getNestedField(value, 'muscles')),
    toStringArray(getNestedField(value, 'targetMuscles')),
  ];
  const muscleGroups = muscleGroupsCandidates.find((candidate) => candidate.length > 0) ?? [];

  return {
    name,
    section,
    orderIndex,
    sets:
      toPositiveInteger(getNestedField(value, 'sets')) ??
      toPositiveInteger(getNestedField(value, 'setCount')) ??
      toPositiveInteger(getNestedField(value, 'targetSets')),
    repsMin:
      toPositiveInteger(getNestedField(value, 'repsMin')) ??
      toPositiveInteger(getNestedField(value, 'minReps')) ??
      repsRange.repsMin,
    repsMax:
      toPositiveInteger(getNestedField(value, 'repsMax')) ??
      toPositiveInteger(getNestedField(value, 'maxReps')) ??
      repsRange.repsMax,
    tempo: normalizeText(getNestedField(value, 'tempo')),
    restSeconds:
      toNonnegativeInteger(getNestedField(value, 'restSeconds')) ??
      toNonnegativeInteger(getNestedField(value, 'rest')),
    supersetGroup:
      normalizeText(getNestedField(value, 'supersetGroup')) ??
      normalizeText(getNestedField(value, 'superset')),
    notes:
      normalizeText(getNestedField(value, 'notes')) ??
      normalizeText(getNestedField(value, 'instructions')),
    cues: toStringArray(getNestedField(value, 'cues') ?? getNestedField(value, 'cue')).slice(0, 20),
    category: toExerciseCategory(getNestedField(value, 'category')),
    muscleGroups,
    equipment:
      normalizeText(getNestedField(value, 'equipment')) ??
      normalizeText(getNestedField(value, 'implement')),
  };
};

const parseWorkoutTemplateRecord = (
  templatesRoot: string,
  filePath: string,
  payload: unknown,
): ParsedWorkoutTemplateRecord => {
  const fallbackName = toFallbackWorkoutName(filePath);
  const sourceKey = relative(templatesRoot, filePath).replace(/\\/gu, '/');

  const objectPayload = isRecord(payload) ? payload : { exercises: payload };

  const name =
    normalizeText(getNestedField(objectPayload, 'name')) ??
    normalizeText(getNestedField(objectPayload, 'templateName')) ??
    normalizeText(getNestedField(objectPayload, 'workoutName')) ??
    fallbackName;

  const sectionSources = extractTemplateSectionSources(objectPayload);
  const exercises = sectionSources.flatMap((sectionSource) =>
    sectionSource.exercises
      .map((exercise, index) => parseTemplateExercise(exercise, sectionSource.section, index))
      .filter((exercise): exercise is ParsedTemplateExercise => exercise !== null),
  );

  return {
    sourceKey,
    name,
    description: normalizeText(getNestedField(objectPayload, 'description')),
    tags: toTags(getNestedField(objectPayload, 'tags')),
    exercises,
  };
};

const loadWorkoutTemplateRecords = async (
  dataRoot: string,
  logger: Logger,
): Promise<ParsedWorkoutTemplateRecord[]> => {
  const templatesRoot = join(dataRoot, DEFAULT_WORKOUT_TEMPLATE_SUBPATH);

  let files: string[];
  try {
    files = await listJsonFiles(templatesRoot);
  } catch (error) {
    logger.warn(`Workout template directory not found or unreadable at ${templatesRoot}: ${String(error)}`);
    return [];
  }

  const sortedFiles = [...files].sort((left, right) => left.localeCompare(right));
  const records: ParsedWorkoutTemplateRecord[] = [];

  for (const filePath of sortedFiles) {
    try {
      const payload = await readJson(filePath);
      records.push(parseWorkoutTemplateRecord(templatesRoot, filePath, payload));
    } catch (error) {
      logger.warn(`Skipping unreadable workout template file ${filePath}: ${String(error)}`);
    }
  }

  return records;
};

const extractSessionSectionSources = (
  value: unknown,
): Array<{ section: WorkoutTemplateSectionType | null; exercises: unknown[] }> => {
  if (Array.isArray(value)) {
    return [
      {
        section: 'main',
        exercises: value,
      },
    ];
  }

  if (!isRecord(value)) {
    return [];
  }

  const sources: Array<{ section: WorkoutTemplateSectionType | null; exercises: unknown[] }> = [];

  const explicitSections = getNestedField(value, 'sections');
  if (Array.isArray(explicitSections)) {
    for (const sectionEntry of explicitSections) {
      if (!isRecord(sectionEntry)) {
        continue;
      }

      const section = toSectionType(
        getNestedField(sectionEntry, 'type') ??
          getNestedField(sectionEntry, 'section') ??
          getNestedField(sectionEntry, 'name') ??
          getNestedField(sectionEntry, 'title'),
      );
      const exercises = toExerciseCollection(sectionEntry);

      if (exercises.length > 0) {
        sources.push({ section, exercises });
      }
    }

    if (sources.length > 0) {
      return sources;
    }
  }

  for (const section of WORKOUT_SECTION_ORDER) {
    const sectionValue = getNestedField(value, section);
    if (sectionValue === undefined) {
      continue;
    }

    const exercises = toExerciseCollection(sectionValue);
    if (exercises.length > 0) {
      sources.push({ section, exercises });
    }
  }

  if (sources.length > 0) {
    return sources;
  }

  const fallbackExercises =
    getNestedField(value, 'exercises') ??
    getNestedField(value, 'loggedExercises') ??
    getNestedField(value, 'movements');
  const exercises = toExerciseCollection(fallbackExercises);
  if (exercises.length > 0) {
    return [
      {
        section: 'main',
        exercises,
      },
    ];
  }

  return [];
};

const parseSessionSet = (
  value: unknown,
  fallbackSetNumber: number,
  section: WorkoutTemplateSectionType | null,
): Omit<ParsedSessionSet, 'exerciseName' | 'category' | 'muscleGroups' | 'equipment'> => {
  if (!isRecord(value)) {
    return {
      setNumber: fallbackSetNumber,
      weight: null,
      reps: null,
      completed: true,
      skipped: false,
      section,
      notes: null,
    };
  }

  const explicitSetNumber =
    toPositiveInteger(getNestedField(value, 'setNumber')) ??
    toPositiveInteger(getNestedField(value, 'set')) ??
    toPositiveInteger(getNestedField(value, 'number'));
  const indexSetNumber = toNonnegativeInteger(getNestedField(value, 'index'));

  const setNumber = explicitSetNumber ?? (indexSetNumber !== null ? indexSetNumber + 1 : fallbackSetNumber);

  const skipped = toBoolean(getNestedField(value, 'skipped')) ?? false;
  const completed = skipped ? false : (toBoolean(getNestedField(value, 'completed')) ?? true);

  const explicitSection = getNestedField(value, 'section') ?? getNestedField(value, 'sectionType');

  return {
    setNumber,
    weight:
      toNumber(getNestedField(value, 'weight')) ??
      toNumber(getNestedField(value, 'load')) ??
      toNumber(getNestedField(value, 'lbs')) ??
      toNumber(getNestedField(value, 'pounds')) ??
      toNumber(getNestedField(value, 'kg')),
    reps:
      toNonnegativeInteger(getNestedField(value, 'reps')) ??
      toNonnegativeInteger(getNestedField(value, 'repCount')) ??
      toNonnegativeInteger(getNestedField(value, 'count')),
    completed,
    skipped,
    section: explicitSection !== undefined ? toSectionType(explicitSection) : section,
    notes: normalizeText(getNestedField(value, 'notes')),
  };
};

const parseSessionExerciseSets = (
  value: unknown,
  fallbackSection: WorkoutTemplateSectionType | null,
): ParsedSessionSet[] => {
  if (!isRecord(value)) {
    return [];
  }

  const exerciseName =
    normalizeText(getNestedField(value, 'name')) ??
    normalizeText(getNestedField(value, 'exerciseName')) ??
    normalizeText(getNestedField(value, 'exercise')) ??
    normalizeText(getNestedField(value, 'movement'));

  if (!exerciseName) {
    return [];
  }

  const category = toExerciseCategory(getNestedField(value, 'category'));
  const muscleGroups = toStringArray(
    getNestedField(value, 'muscleGroups') ??
      getNestedField(value, 'muscles') ??
      getNestedField(value, 'targetMuscles'),
  );
  const equipment =
    normalizeText(getNestedField(value, 'equipment')) ??
    normalizeText(getNestedField(value, 'implement'));

  const rawSets =
    getNestedField(value, 'sets') ??
    getNestedField(value, 'performedSets') ??
    getNestedField(value, 'entries') ??
    getNestedField(value, 'logs');

  let setValues: unknown[] = [];
  if (Array.isArray(rawSets)) {
    setValues = rawSets;
  } else if (isRecord(rawSets)) {
    setValues = [rawSets];
  }

  if (setValues.length === 0) {
    const directWeight =
      toNumber(getNestedField(value, 'weight')) ??
      toNumber(getNestedField(value, 'load')) ??
      toNumber(getNestedField(value, 'lbs'));
    const directReps = toNonnegativeInteger(getNestedField(value, 'reps'));

    if (directWeight !== null || directReps !== null) {
      setValues = [value];
    } else {
      const inferredSetCount =
        toPositiveInteger(getNestedField(value, 'setCount')) ??
        toPositiveInteger(getNestedField(value, 'sets'));

      if (inferredSetCount !== null) {
        setValues = Array.from({ length: inferredSetCount }, () => value);
      }
    }
  }

  return setValues.map((setEntry, index) => {
    const parsedSet = parseSessionSet(setEntry, index + 1, fallbackSection);

    return {
      exerciseName,
      setNumber: parsedSet.setNumber,
      weight: parsedSet.weight,
      reps: parsedSet.reps,
      completed: parsedSet.completed,
      skipped: parsedSet.skipped,
      section: parsedSet.section,
      notes: parsedSet.notes,
      category,
      muscleGroups,
      equipment,
    };
  });
};

const parseWorkoutSessionRecord = (
  sessionsRoot: string,
  filePath: string,
  payload: unknown,
): ParsedWorkoutSessionRecord | null => {
  const sourceKey = relative(sessionsRoot, filePath).replace(/\\/gu, '/');
  const fallbackName = toFallbackWorkoutName(filePath);
  const objectPayload = isRecord(payload) ? payload : { exercises: payload };

  const name =
    normalizeText(getNestedField(objectPayload, 'name')) ??
    normalizeText(getNestedField(objectPayload, 'workoutName')) ??
    normalizeText(getNestedField(objectPayload, 'title')) ??
    fallbackName;

  const templateMatchName =
    normalizeText(getNestedField(objectPayload, 'templateName')) ??
    normalizeText(getNestedField(objectPayload, 'template')) ??
    name;

  const startedAtCandidate =
    toTimestampMs(getNestedField(objectPayload, 'startedAt')) ??
    toTimestampMs(getNestedField(objectPayload, 'started_at')) ??
    toTimestampMs(getNestedField(objectPayload, 'startTime')) ??
    toTimestampMs(getNestedField(objectPayload, 'started')) ??
    toTimestampMs(getNestedField(objectPayload, 'start'));

  const completedAtCandidate =
    toTimestampMs(getNestedField(objectPayload, 'completedAt')) ??
    toTimestampMs(getNestedField(objectPayload, 'completed_at')) ??
    toTimestampMs(getNestedField(objectPayload, 'endTime')) ??
    toTimestampMs(getNestedField(objectPayload, 'endedAt')) ??
    toTimestampMs(getNestedField(objectPayload, 'finishedAt'));

  const durationCandidate =
    toDurationMs(getNestedField(objectPayload, 'durationMs'), 'milliseconds') ??
    toDurationMs(getNestedField(objectPayload, 'durationSeconds'), 'seconds') ??
    toDurationMs(getNestedField(objectPayload, 'durationMinutes'), 'minutes') ??
    toDurationMs(getNestedField(objectPayload, 'duration'));

  const explicitDate =
    toDateKey(getNestedField(objectPayload, 'date')) ??
    toDateKey(getNestedField(objectPayload, 'day')) ??
    toDateKey(getNestedField(objectPayload, 'sessionDate')) ??
    DAILY_FILENAME_PATTERN.exec(basename(filePath))?.[1] ??
    null;

  let startedAt =
    startedAtCandidate ??
    (explicitDate ? toTimestampMs(`${explicitDate}${SESSION_TIMELESS_FALLBACK_SUFFIX}`) : null);
  let completedAt = completedAtCandidate;

  if (startedAt === null && completedAt !== null && durationCandidate !== null) {
    startedAt = completedAt - durationCandidate;
  }

  if (startedAt === null) {
    return null;
  }

  if (completedAt === null) {
    completedAt = durationCandidate !== null ? startedAt + durationCandidate : startedAt;
  }

  if (completedAt < startedAt) {
    completedAt = startedAt;
  }

  const duration = durationCandidate ?? Math.max(completedAt - startedAt, 0);
  const date = explicitDate ?? new Date(startedAt).toISOString().slice(0, 10);

  const sectionSources = extractSessionSectionSources(objectPayload);
  const sets = sectionSources.flatMap((sectionSource) =>
    sectionSource.exercises.flatMap((exercise) =>
      parseSessionExerciseSets(exercise, sectionSource.section),
    ),
  );

  return {
    sourceKey,
    name,
    templateMatchName,
    date,
    startedAt,
    completedAt,
    duration,
    sets,
  };
};

const loadWorkoutSessionRecords = async (
  dataRoot: string,
  logger: Logger,
): Promise<ParsedWorkoutSessionRecord[]> => {
  const sessionsRoot = join(dataRoot, DEFAULT_WORKOUT_SESSION_SUBPATH);

  let files: string[];
  try {
    files = await listJsonFiles(sessionsRoot);
  } catch (error) {
    logger.warn(`Workout session directory not found or unreadable at ${sessionsRoot}: ${String(error)}`);
    return [];
  }

  const sortedFiles = files
    .filter((filePath) => !relative(sessionsRoot, filePath).replace(/\\/gu, '/').startsWith('templates/'))
    .sort((left, right) => left.localeCompare(right));
  const records: ParsedWorkoutSessionRecord[] = [];

  for (const filePath of sortedFiles) {
    try {
      const payload = await readJson(filePath);
      const record = parseWorkoutSessionRecord(sessionsRoot, filePath, payload);
      if (!record) {
        logger.warn(`Skipping workout session with incomplete timing data: ${filePath}`);
        continue;
      }

      records.push(record);
    } catch (error) {
      logger.warn(`Skipping unreadable workout session file ${filePath}: ${String(error)}`);
    }
  }

  return records;
};

const buildExerciseLookup = (
  rows: Array<{ id: string; name: string; userId: string | null }>,
  userId: string,
): Map<string, ExerciseLookupEntry> => {
  const lookup = new Map<string, ExerciseLookupEntry>();

  for (const row of rows) {
    const key = normalizeLookupKey(row.name);
    const existing = lookup.get(key);

    if (!existing) {
      lookup.set(key, {
        id: row.id,
        userId: row.userId,
      });
      continue;
    }

    if (existing.userId === null && row.userId === userId) {
      lookup.set(key, {
        id: row.id,
        userId: row.userId,
      });
    }
  }

  return lookup;
};

const toExerciseDefaults = (set: {
  category: ExerciseCategory | null;
  muscleGroups: string[];
  equipment: string | null;
}): ExerciseCreateDefaults => ({
  category: set.category,
  muscleGroups: set.muscleGroups.length > 0 ? set.muscleGroups : ['full body'],
  equipment: set.equipment,
});

const mergeExerciseDefaults = (
  current: ExerciseCreateDefaults,
  incoming: ExerciseCreateDefaults,
): ExerciseCreateDefaults => ({
  category: current.category ?? incoming.category,
  muscleGroups: Array.from(new Set([...current.muscleGroups, ...incoming.muscleGroups])),
  equipment: current.equipment ?? incoming.equipment,
});

const collectExerciseDefaults = (
  templates: ParsedWorkoutTemplateRecord[],
  sessions: ParsedWorkoutSessionRecord[],
): Map<string, { displayName: string; defaults: ExerciseCreateDefaults }> => {
  const requirements = new Map<string, { displayName: string; defaults: ExerciseCreateDefaults }>();

  const register = (
    exerciseName: string,
    metadata: {
      category: ExerciseCategory | null;
      muscleGroups: string[];
      equipment: string | null;
    },
  ) => {
    const key = normalizeLookupKey(exerciseName);
    const incomingDefaults = toExerciseDefaults(metadata);
    const existing = requirements.get(key);

    if (!existing) {
      requirements.set(key, {
        displayName: exerciseName,
        defaults: incomingDefaults,
      });
      return;
    }

    requirements.set(key, {
      displayName: existing.displayName,
      defaults: mergeExerciseDefaults(existing.defaults, incomingDefaults),
    });
  };

  for (const template of templates) {
    for (const exercise of template.exercises) {
      register(exercise.name, {
        category: exercise.category,
        muscleGroups: exercise.muscleGroups,
        equipment: exercise.equipment,
      });
    }
  }

  for (const session of sessions) {
    for (const set of session.sets) {
      register(set.exerciseName, {
        category: set.category,
        muscleGroups: set.muscleGroups,
        equipment: set.equipment,
      });
    }
  }

  return requirements;
};

export const migrateWorkoutTemplatesAndSessions = async ({
  userId,
  dataRoot = DEFAULT_STATIC_DATA_ROOT,
  logger = console,
}: MigrationOptions): Promise<WorkoutMigrationSummary> => {
  const resolvedDataRoot = resolve(dataRoot);
  const [templateRecords, sessionRecords] = await Promise.all([
    loadWorkoutTemplateRecords(resolvedDataRoot, logger),
    loadWorkoutSessionRecords(resolvedDataRoot, logger),
  ]);

  const { db } = await import('../db/index.js');

  const existingExerciseRows = db
    .select({
      id: exercises.id,
      name: exercises.name,
      userId: exercises.userId,
    })
    .from(exercises)
    .where(or(eq(exercises.userId, userId), isNull(exercises.userId)))
    .all();

  const exerciseLookup = buildExerciseLookup(existingExerciseRows, userId);
  const requiredExerciseDefaults = collectExerciseDefaults(templateRecords, sessionRecords);

  let createdExercises = 0;
  for (const [lookupKey, requirement] of [...requiredExerciseDefaults.entries()].sort((a, b) =>
    a[0].localeCompare(b[0]),
  )) {
    if (exerciseLookup.has(lookupKey)) {
      continue;
    }

    const exerciseId = toStableMigrationId('migrated-exercise', userId, lookupKey);
    db.insert(exercises)
      .values({
        id: exerciseId,
        userId,
        name: requirement.displayName,
        category: requirement.defaults.category ?? 'compound',
        muscleGroups: requirement.defaults.muscleGroups,
        equipment: requirement.defaults.equipment ?? 'bodyweight',
        instructions: null,
      })
      .onConflictDoNothing({
        target: [exercises.id],
      })
      .run();

    exerciseLookup.set(lookupKey, {
      id: exerciseId,
      userId,
    });
    createdExercises += 1;
  }

  const templateNameLookup = new Map<string, string>();
  const summary: WorkoutMigrationSummary = {
    processedTemplates: 0,
    failedTemplates: 0,
    processedSessions: 0,
    failedSessions: 0,
    totalTemplateExercises: 0,
    totalSessionSets: 0,
    createdExercises,
  };

  for (const template of templateRecords) {
    const templateId = toStableMigrationId('migrated-template', userId, template.sourceKey);

    try {
      const insertedExerciseCount = db.transaction((tx) => {
        tx.insert(workoutTemplates)
          .values({
            id: templateId,
            userId,
            name: template.name,
            description: template.description,
            tags: template.tags,
          })
          .onConflictDoUpdate({
            target: [workoutTemplates.id],
            set: {
              name: template.name,
              description: template.description,
              tags: template.tags,
              updatedAt: Date.now(),
            },
          })
          .run();

        tx.delete(templateExercises).where(eq(templateExercises.templateId, templateId)).run();

        const rows = template.exercises.flatMap((exercise) => {
          const exerciseLookupEntry = exerciseLookup.get(normalizeLookupKey(exercise.name));
          if (!exerciseLookupEntry) {
            logger.warn(`Template "${template.name}" references missing exercise "${exercise.name}"; skipping.`);
            return [];
          }

          return [
            {
              id: toStableMigrationId(
                'migrated-template-exercise',
                templateId,
                exerciseLookupEntry.id,
                exercise.section,
                String(exercise.orderIndex),
              ),
              templateId,
              exerciseId: exerciseLookupEntry.id,
              orderIndex: exercise.orderIndex,
              sets: exercise.sets,
              repsMin: exercise.repsMin,
              repsMax: exercise.repsMax,
              tempo: exercise.tempo,
              restSeconds: exercise.restSeconds,
              supersetGroup: exercise.supersetGroup,
              section: exercise.section,
              notes: exercise.notes,
              cues: exercise.cues.length > 0 ? exercise.cues : null,
            },
          ];
        });

        if (rows.length > 0) {
          tx.insert(templateExercises).values(rows).run();
        }

        return rows.length;
      });

      summary.processedTemplates += 1;
      summary.totalTemplateExercises += insertedExerciseCount;

      const templateNameKey = normalizeLookupKey(template.name);
      if (!templateNameLookup.has(templateNameKey)) {
        templateNameLookup.set(templateNameKey, templateId);
      }

      logger.info(`Imported workout template "${template.name}" with ${insertedExerciseCount} exercise(s).`);
    } catch (error) {
      summary.failedTemplates += 1;
      logger.error(`Failed importing workout template "${template.name}": ${String(error)}`);
    }
  }

  for (const session of sessionRecords) {
    const sessionId = toStableMigrationId('migrated-session', userId, session.sourceKey);

    try {
      const insertedSetCount = db.transaction((tx) => {
        const templateId =
          templateNameLookup.get(normalizeLookupKey(session.templateMatchName)) ??
          templateNameLookup.get(normalizeLookupKey(session.name)) ??
          null;

        tx.insert(workoutSessions)
          .values({
            id: sessionId,
            userId,
            templateId,
            name: session.name,
            date: session.date,
            status: 'completed',
            startedAt: session.startedAt,
            completedAt: session.completedAt,
            duration: session.duration,
            feedback: null,
            notes: null,
          })
          .onConflictDoUpdate({
            target: [workoutSessions.id],
            set: {
              templateId,
              name: session.name,
              date: session.date,
              status: 'completed',
              startedAt: session.startedAt,
              completedAt: session.completedAt,
              duration: session.duration,
              feedback: null,
              notes: null,
              updatedAt: Date.now(),
            },
          })
          .run();

        tx.delete(sessionSets).where(eq(sessionSets.sessionId, sessionId)).run();

        const highestSetNumberByExerciseId = new Map<string, number>();
        const rows = session.sets.flatMap((set, index) => {
          const exerciseLookupEntry = exerciseLookup.get(normalizeLookupKey(set.exerciseName));
          if (!exerciseLookupEntry) {
            logger.warn(
              `Workout session "${session.name}" references missing exercise "${set.exerciseName}"; set skipped.`,
            );
            return [];
          }

          const currentHighest = highestSetNumberByExerciseId.get(exerciseLookupEntry.id) ?? 0;
          const normalizedSetNumber =
            set.setNumber > currentHighest ? set.setNumber : currentHighest + 1;

          highestSetNumberByExerciseId.set(exerciseLookupEntry.id, normalizedSetNumber);

          return [
            {
              id: toStableMigrationId(
                'migrated-session-set',
                sessionId,
                exerciseLookupEntry.id,
                String(normalizedSetNumber),
                String(index),
              ),
              sessionId,
              exerciseId: exerciseLookupEntry.id,
              setNumber: normalizedSetNumber,
              weight: set.weight,
              reps: set.reps,
              completed: set.skipped ? false : set.completed,
              skipped: set.skipped,
              section: set.section ?? 'main',
              notes: set.notes,
            },
          ];
        });

        if (rows.length > 0) {
          tx.insert(sessionSets).values(rows).run();
        }

        return rows.length;
      });

      summary.processedSessions += 1;
      summary.totalSessionSets += insertedSetCount;
      logger.info(`Imported workout session "${session.name}" with ${insertedSetCount} set(s).`);
    } catch (error) {
      summary.failedSessions += 1;
      logger.error(`Failed importing workout session "${session.name}": ${String(error)}`);
    }
  }

  logger.info(
    `Workout migration summary: templates ${summary.processedTemplates} (failed ${summary.failedTemplates}), sessions ${summary.processedSessions} (failed ${summary.failedSessions}), template exercises ${summary.totalTemplateExercises}, session sets ${summary.totalSessionSets}, created exercises ${summary.createdExercises}.`,
  );

  return summary;
};

export const migrateFoodsDatabase = async ({
  userId,
  dataRoot = DEFAULT_STATIC_DATA_ROOT,
  logger = console,
}: MigrationOptions): Promise<FoodsMigrationSummary> => {
  const resolvedDataRoot = resolve(dataRoot);
  const foodsFilePath = join(resolvedDataRoot, 'foods.json');

  let rawContent: string;
  try {
    rawContent = await readFile(foodsFilePath, 'utf8');
  } catch (error) {
    logger.warn(`Foods file not found or unreadable at ${foodsFilePath}: ${String(error)}`);
    return { inserted: 0, skipped: 0, lastUsedAtUpdated: 0 };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawContent);
  } catch (error) {
    logger.warn(`Failed to parse foods.json: ${String(error)}`);
    return { inserted: 0, skipped: 0, lastUsedAtUpdated: 0 };
  }

  const foodEntries: Record<string, unknown>[] = [];

  if (Array.isArray(parsed)) {
    for (const item of parsed) {
      if (isRecord(item)) {
        foodEntries.push(item);
      }
    }
  } else if (isRecord(parsed)) {
    const items =
      getNestedField(parsed, 'foods') ??
      getNestedField(parsed, 'items') ??
      getNestedField(parsed, 'data');

    if (Array.isArray(items)) {
      for (const item of items) {
        if (isRecord(item)) {
          foodEntries.push(item);
        }
      }
    } else {
      for (const value of Object.values(parsed)) {
        if (isRecord(value)) {
          foodEntries.push(value);
        }
      }
    }
  }

  const { db } = await import('../db/index.js');

  const existingRows = db
    .select({ name: foods.name, brand: foods.brand })
    .from(foods)
    .where(eq(foods.userId, userId))
    .all();

  const existingSet = new Set(
    existingRows.map((row) => normalizeLookupKey(`${row.name}|${row.brand ?? ''}`)),
  );

  const summary: FoodsMigrationSummary = { inserted: 0, skipped: 0, lastUsedAtUpdated: 0 };

  for (const entry of foodEntries) {
    const name = normalizeText(getNestedField(entry, 'name'));
    if (!name) {
      logger.warn(`Skipping food entry with missing name: ${JSON.stringify(entry)}`);
      continue;
    }

    const brand = normalizeText(getNestedField(entry, 'brand'));
    const dedupeKey = normalizeLookupKey(`${name}|${brand ?? ''}`);

    if (existingSet.has(dedupeKey)) {
      logger.info(`Skipping duplicate food "${name}"${brand ? ` (${brand})` : ''} for user ${userId}.`);
      summary.skipped += 1;
      continue;
    }

    const servingSizeRaw =
      normalizeText(getNestedField(entry, 'servingSize')) ??
      normalizeText(getNestedField(entry, 'serving_size')) ??
      normalizeText(getNestedField(entry, 'serving'));

    const servingGrams =
      toPositiveNumber(getNestedField(entry, 'servingGrams')) ??
      toPositiveNumber(getNestedField(entry, 'serving_grams')) ??
      toPositiveNumber(getNestedField(entry, 'grams'));

    const calories = toNonnegativeNumber(
      getNestedField(entry, 'calories') ?? getNestedField(entry, 'kcal'),
    );
    const protein = toNonnegativeNumber(getNestedField(entry, 'protein'));
    const carbs = toNonnegativeNumber(
      getNestedField(entry, 'carbs') ?? getNestedField(entry, 'carbohydrates'),
    );
    const fat = toNonnegativeNumber(getNestedField(entry, 'fat'));
    const fiber = toNumber(getNestedField(entry, 'fiber'));
    const sugar = toNumber(getNestedField(entry, 'sugar'));

    const verifiedRaw = toBoolean(getNestedField(entry, 'verified'));
    const verified = verifiedRaw ?? false;

    const source = normalizeText(getNestedField(entry, 'source'));
    const notes = normalizeText(getNestedField(entry, 'notes'));

    db.insert(foods)
      .values({
        userId,
        name,
        brand,
        servingSize: servingSizeRaw,
        servingGrams,
        calories,
        protein,
        carbs,
        fat,
        fiber: fiber !== null && fiber >= 0 ? fiber : null,
        sugar: sugar !== null && sugar >= 0 ? sugar : null,
        verified,
        source,
        notes,
        lastUsedAt: null,
      })
      .run();

    existingSet.add(dedupeKey);
    summary.inserted += 1;
  }

  // Backfill lastUsedAt from existing meal_items usage (name match)
  const usageRows = db
    .select({
      name: mealItems.name,
      latestDate: max(nutritionLogs.date),
    })
    .from(mealItems)
    .innerJoin(meals, eq(meals.id, mealItems.mealId))
    .innerJoin(nutritionLogs, eq(nutritionLogs.id, meals.nutritionLogId))
    .where(eq(nutritionLogs.userId, userId))
    .groupBy(mealItems.name)
    .all();

  for (const usage of usageRows) {
    if (!usage.latestDate) {
      continue;
    }

    const usageTimestamp = new Date(`${usage.latestDate}T00:00:00.000Z`).getTime();
    const updated = db
      .update(foods)
      .set({ lastUsedAt: usageTimestamp })
      .where(
        and(
          eq(foods.userId, userId),
          eq(foods.name, usage.name),
          or(isNull(foods.lastUsedAt), lt(foods.lastUsedAt, usageTimestamp)),
        ),
      )
      .run();

    if (updated.changes > 0) {
      summary.lastUsedAtUpdated += updated.changes;
    }
  }

  logger.info(
    `Foods migration summary: inserted ${summary.inserted}, skipped ${summary.skipped}, lastUsedAt updated ${summary.lastUsedAtUpdated}.`,
  );

  return summary;
};

export const migrateDailyLogsAndBodyWeight = async ({
  userId,
  dataRoot = DEFAULT_STATIC_DATA_ROOT,
  logger = console,
}: MigrationOptions): Promise<MigrationSummary> => {
  const resolvedDataRoot = resolve(dataRoot);

  const dailyRecords = await loadDailyLogRecords(resolvedDataRoot, logger);
  const bodyWeightHistory = await loadBodyWeightHistory(resolvedDataRoot, logger);

  const dailyWeights = new Map<string, number>();
  for (const [date, record] of dailyRecords) {
    if (record.bodyWeight !== null) {
      dailyWeights.set(date, record.bodyWeight);
    }
  }

  const mergedWeights = mergeWeightEntries(dailyWeights, bodyWeightHistory);

  const { db } = await import('../db/index.js');

  const [foodRows, habitRows] = await Promise.all([
    db
      .select({
        id: foods.id,
        name: foods.name,
      })
      .from(foods)
      .where(eq(foods.userId, userId))
      .all(),
    db
      .select({
        id: habits.id,
        name: habits.name,
        trackingType: habits.trackingType,
      })
      .from(habits)
      .where(eq(habits.userId, userId))
      .all(),
  ]);

  const foodLookup = buildFoodLookup(foodRows);
  const habitLookup = buildHabitLookup(habitRows);

  const dates = new Set<string>([...dailyRecords.keys(), ...mergedWeights.keys()]);
  const sortedDates = [...dates].sort((left, right) => left.localeCompare(right));

  const summary: MigrationSummary = {
    processedDays: 0,
    failedDays: 0,
    dailyLogDays: dailyRecords.size,
    bodyWeightFileEntries: bodyWeightHistory.size,
    totalMeals: 0,
    totalHabitEntries: 0,
    totalWeightEntries: 0,
  };

  for (const date of sortedDates) {
    const dayRecord = dailyRecords.get(date) ?? null;
    const weightForDay = mergedWeights.get(date) ?? null;

    try {
      const dayResult = db.transaction((tx) => {
        let insertedMeals = 0;
        let insertedHabitEntries = 0;
        let insertedWeightEntries = 0;

        if (dayRecord && dayRecord.meals.length > 0) {
          tx.insert(nutritionLogs)
            .values({
              userId,
              date,
              notes: null,
            })
            .onConflictDoNothing({
              target: [nutritionLogs.userId, nutritionLogs.date],
            })
            .run();

          const nutritionLog = tx
            .select({
              id: nutritionLogs.id,
            })
            .from(nutritionLogs)
            .where(and(eq(nutritionLogs.userId, userId), eq(nutritionLogs.date, date)))
            .limit(1)
            .get();

          if (!nutritionLog) {
            throw new Error(`Failed to load nutrition log for ${date}`);
          }

          tx.delete(meals).where(eq(meals.nutritionLogId, nutritionLog.id)).run();

          for (const meal of dayRecord.meals) {
            const insertedMeal = tx
              .insert(meals)
              .values({
                nutritionLogId: nutritionLog.id,
                name: meal.name,
                time: meal.time,
                notes: meal.notes,
              })
              .returning({ id: meals.id })
              .get();

            if (!insertedMeal) {
              throw new Error(`Failed to insert meal "${meal.name}" on ${date}`);
            }

            insertedMeals += 1;

            for (const item of meal.items) {
              const foodId = foodLookup.get(normalizeLookupKey(item.name)) ?? null;

              if (!foodId) {
                logger.warn(
                  `Missing food reference for "${item.name}" on ${date}; item imported without linked foodId.`,
                );
              }

              tx.insert(mealItems)
                .values({
                  mealId: insertedMeal.id,
                  foodId,
                  name: item.name,
                  amount: item.amount,
                  unit: item.unit,
                  calories: item.calories,
                  protein: item.protein,
                  carbs: item.carbs,
                  fat: item.fat,
                  fiber: item.fiber,
                  sugar: item.sugar,
                })
                .run();
            }
          }
        }

        if (dayRecord && dayRecord.habits.length > 0) {
          for (const habitEntry of dayRecord.habits) {
            const matchedHabit = habitLookup.get(normalizeLookupKey(habitEntry.name));

            if (!matchedHabit) {
              logger.warn(
                `Missing habit reference for "${habitEntry.name}" on ${date}; entry skipped for this day.`,
              );
              continue;
            }

            const valueToPersist =
              matchedHabit.trackingType === 'boolean' ? null : (habitEntry.value ?? null);
            const completedToPersist =
              matchedHabit.trackingType === 'boolean'
                ? habitEntry.completed
                : habitEntry.completed || (valueToPersist !== null && valueToPersist > 0);

            tx.insert(habitEntries)
              .values({
                habitId: matchedHabit.id,
                userId,
                date,
                completed: completedToPersist,
                value: valueToPersist,
              })
              .onConflictDoUpdate({
                target: [habitEntries.habitId, habitEntries.date],
                set: {
                  completed: completedToPersist,
                  value: valueToPersist,
                },
              })
              .run();

            insertedHabitEntries += 1;
          }
        }

        if (weightForDay !== null) {
          tx.insert(bodyWeight)
            .values({
              userId,
              date,
              weight: weightForDay,
              notes: null,
            })
            .onConflictDoUpdate({
              target: [bodyWeight.userId, bodyWeight.date],
              set: {
                weight: weightForDay,
                notes: null,
                updatedAt: Date.now(),
              },
            })
            .run();

          insertedWeightEntries = 1;
        }

        return {
          meals: insertedMeals,
          habitEntries: insertedHabitEntries,
          weightEntries: insertedWeightEntries,
        };
      });

      summary.processedDays += 1;
      summary.totalMeals += dayResult.meals;
      summary.totalHabitEntries += dayResult.habitEntries;
      summary.totalWeightEntries += dayResult.weightEntries;

      logger.info(
        `Processed ${date}: ${dayResult.meals} meals, ${dayResult.habitEntries} habit entries, weight: ${
          weightForDay ?? 'none'
        }`,
      );
    } catch (error) {
      summary.failedDays += 1;
      logger.error(`Failed processing ${date}: ${String(error)}`);
    }
  }

  logger.info(
    `Migration summary: processed ${summary.processedDays} day(s), failed ${summary.failedDays}, meals ${summary.totalMeals}, habit entries ${summary.totalHabitEntries}, weight entries ${summary.totalWeightEntries}.`,
  );

  return summary;
};
