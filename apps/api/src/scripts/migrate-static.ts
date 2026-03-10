import { readFile, readdir } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { and, eq } from 'drizzle-orm';

import {
  bodyWeight,
  foods,
  habitEntries,
  habits,
  mealItems,
  meals,
  nutritionLogs,
} from '../db/schema/index.js';

export const DEFAULT_STATIC_DATA_ROOT = '/Volumes/meridian/Projects/health-fitness-static/data';

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

export type CliOptions = {
  userId: string;
  dataRoot: string;
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

export const parseCliArgs = (args: string[]): CliOptions => {
  let userId: string | undefined;
  let dataRoot = DEFAULT_STATIC_DATA_ROOT;

  for (let index = 0; index < args.length; index += 1) {
    const current = args[index];

    if (current === '--user') {
      const next = args[index + 1];
      if (!next || next.startsWith('--')) {
        throw new Error('Missing value for --user. Usage: npx tsx src/scripts/migrate-static.ts --user <userId>');
      }

      userId = next;
      index += 1;
      continue;
    }

    if (current === '--source') {
      const next = args[index + 1];
      if (!next || next.startsWith('--')) {
        throw new Error(
          'Missing value for --source. Usage: npx tsx src/scripts/migrate-static.ts --user <userId> --source <path>',
        );
      }

      dataRoot = next;
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${current}`);
  }

  if (!userId) {
    throw new Error('Missing required --user <userId> argument.');
  }

  return {
    userId,
    dataRoot,
  };
};

const runCli = async () => {
  const options = parseCliArgs(process.argv.slice(2));
  await migrateDailyLogsAndBodyWeight({
    userId: options.userId,
    dataRoot: options.dataRoot,
    logger: console,
  });
};

const isMainModule = () => {
  if (!process.argv[1]) {
    return false;
  }

  return import.meta.url === pathToFileURL(process.argv[1]).href;
};

if (isMainModule()) {
  runCli().catch((error) => {
    console.error(`Static migration failed: ${String(error)}`);
    process.exitCode = 1;
  });
}
