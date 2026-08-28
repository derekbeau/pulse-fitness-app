import type Database from 'better-sqlite3';

import {
  adaptiveProgramCalculationSchema,
  calculateFoodCurrentDefinition,
  calculateFoodDefinitionReviewReasons,
  calculatePercent,
  calculateProteinPer100Kcal,
  foodAnalyticsDetailQuerySchema,
  foodAnalyticsQuerySchema,
  resolveFoodAnalyticsRange,
  type FoodAnalytics,
  type FoodAnalyticsDayStates,
  type FoodAnalyticsDetail,
  type FoodAnalyticsDetailQuery,
  type FoodAnalyticsItem,
  type FoodAnalyticsObservedPortion,
  type FoodAnalyticsQuery,
  type FoodAnalyticsRangeResult,
  type FoodAnalyticsSummary,
} from '@pulse/shared';

import { getDateKeyInTimeZone } from '../../db/adaptive-program-revision-projection.js';
import { getApplicationNow } from '../../lib/clock.js';
import {
  resolveUserPreferenceTimeZone,
  UserTimeZoneRequiredError,
} from '../../lib/user-time-zone.js';

const SNAPSHOT_NOTICE =
  'Editing this saved food changes future defaults only. Historical meal snapshots stay unchanged.' as const;

type AnalyticsRangeContext = FoodAnalyticsRangeResult & {
  queryStartDate: string | null;
};

type SummaryRow = {
  totalMealItemCount: number;
  totalMealItemCalories: number | null;
  linkedUsageOccurrences: number;
  linkedFoodCalories: number | null;
  distinctLoggedDays: number;
  savedFoodsUsed: number;
  unlinkedMealItemCount: number;
  unlinkedMealItemCalories: number | null;
  inactiveLinkedMealItemCount: number;
  inactiveLinkedMealItemCalories: number | null;
  unresolvedLinkedMealItemCount: number;
  unresolvedLinkedMealItemCalories: number | null;
  completeOccurrences: number;
  completeDays: number;
  partialOccurrences: number;
  partialDays: number;
  unknownOccurrences: number;
  unknownDays: number;
};

type AnalyticsRow = {
  foodId: string;
  name: string;
  brand: string | null;
  servingSize: string | null;
  servingGrams: number | null;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number | null;
  sugar: number | null;
  verified: number;
  source: string | null;
  notes: string | null;
  tags: string;
  updatedAt: number;
  usageOccurrences: number;
  distinctLoggedDays: number;
  lastLoggedLocalDate: string | null;
  totalCalories: number;
  totalProtein: number;
  completeOccurrences: number;
  completeDays: number;
  partialOccurrences: number;
  partialDays: number;
  unknownOccurrences: number;
  unknownDays: number;
};

type PortionRow = {
  foodId: string;
  unitCount: number;
  normalizedUnit: string | null;
  evidenceCount: number;
  medianQuantity: number | null;
  recentQuantity: number | null;
  recentLocalDate: string | null;
  gramCalories: number | null;
  gramQuantity: number | null;
};

type OccurrenceRow = {
  mealItemId: string;
  mealId: string;
  localDate: string;
  mealName: string;
  mealTime: string | null;
  amount: number;
  unit: string;
  displayQuantity: number | null;
  displayUnit: string | null;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  nutritionDayState: 'complete' | 'partial' | 'unknown';
};

export class FoodAnalyticsNotFoundError extends Error {
  constructor() {
    super('Food analytics not found');
    this.name = 'FoodAnalyticsNotFoundError';
  }
}

export class FoodAnalyticsTimeZoneConflictError extends Error {
  constructor() {
    super('Requested time zone does not match the effective nutrition program time zone');
    this.name = 'FoodAnalyticsTimeZoneConflictError';
  }
}

export class FoodAnalyticsProgramProjectionError extends Error {
  constructor() {
    super('Adaptive nutrition program revision projection is unavailable or inconsistent');
    this.name = 'FoodAnalyticsProgramProjectionError';
  }
}

const numberValue = (value: number | null | undefined) => Number(value ?? 0);

const dayStatesFromRow = (row: {
  completeOccurrences: number;
  completeDays: number;
  partialOccurrences: number;
  partialDays: number;
  unknownOccurrences: number;
  unknownDays: number;
}): FoodAnalyticsDayStates => ({
  complete: {
    occurrences: numberValue(row.completeOccurrences),
    distinctDays: numberValue(row.completeDays),
  },
  partial: {
    occurrences: numberValue(row.partialOccurrences),
    distinctDays: numberValue(row.partialDays),
  },
  unknown: {
    occurrences: numberValue(row.unknownOccurrences),
    distinctDays: numberValue(row.unknownDays),
  },
});

const normalizeTags = (raw: string): string[] => {
  const parsed: unknown = JSON.parse(raw);
  return Array.isArray(parsed)
    ? parsed.filter((entry): entry is string => typeof entry === 'string')
    : [];
};

const rangeItemsCte = (range: AnalyticsRangeContext) => `
  with range_logs as materialized (
    select id, date, status
      from nutrition_logs
     where user_id = @userId
       ${range.queryStartDate === null ? '' : 'and date >= @startDate'}
       and date <= @endDate
  ), range_items as materialized (
    select mi.id as mealItemId,
           mi.food_id as foodId,
           mi.amount,
           mi.unit,
           mi.display_quantity as displayQuantity,
           mi.display_unit as displayUnit,
           mi.calories,
           mi.protein,
           mi.carbs,
           mi.fat,
           mi.created_at as itemCreatedAt,
           m.id as mealId,
           m.name as mealName,
           m.time as mealTime,
           rl.date as localDate,
           rl.status as dayStatus,
           f.id as ownedFoodId,
           f.deleted_at as foodDeletedAt
      from range_logs rl
      join meals m on m.nutrition_log_id = rl.id
      join meal_items mi on mi.meal_id = m.id
      left join foods f on f.id = mi.food_id and f.user_id = @userId
  )`;

const observedCte = (range: AnalyticsRangeContext) => `${rangeItemsCte(range)}, observed as (
  select foodId,
         cast(count(*) as integer) as usageOccurrences,
         cast(count(distinct localDate) as integer) as distinctLoggedDays,
         max(localDate) as lastLoggedLocalDate,
         coalesce(sum(calories), 0) as totalCalories,
         coalesce(sum(protein), 0) as totalProtein,
         cast(sum(case when dayStatus = 'complete' then 1 else 0 end) as integer) as completeOccurrences,
         cast(count(distinct case when dayStatus = 'complete' then localDate end) as integer) as completeDays,
         cast(sum(case when dayStatus = 'partial' then 1 else 0 end) as integer) as partialOccurrences,
         cast(count(distinct case when dayStatus = 'partial' then localDate end) as integer) as partialDays,
         cast(sum(case when dayStatus = 'unknown' then 1 else 0 end) as integer) as unknownOccurrences,
         cast(count(distinct case when dayStatus = 'unknown' then localDate end) as integer) as unknownDays
    from range_items
   where ownedFoodId is not null and foodDeletedAt is null
   group by foodId
)`;

const reviewCondition = `(
  f.verified = 0
  or trim(coalesce(f.source, '')) = ''
  or f.serving_grams is null
  or abs(f.calories - (f.protein * 4 + f.carbs * 4 + f.fat * 9)) > max(10, f.calories * 0.05)
  or coalesce(o.usageOccurrences, 0) = 0
)`;

const buildFilters = (query: FoodAnalyticsQuery, onlyFoodId?: string) => {
  const clauses = [`f.user_id = @userId`, `f.deleted_at is null`];
  const parameters: Record<string, string | number | null> = {};

  if (onlyFoodId) {
    clauses.push('f.id = @onlyFoodId');
    parameters.onlyFoodId = onlyFoodId;
  }
  if (query.q) {
    clauses.push(
      `(lower(f.name) like @query escape '\\' or lower(coalesce(f.brand, '')) like @query escape '\\')`,
    );
    parameters.query = `%${query.q.toLowerCase().replace(/[%_\\]/gu, '\\$&')}%`;
  }
  query.tags?.forEach((tag, index) => {
    const key = `tag${index}`;
    clauses.push(`exists (select 1 from json_each(f.tags) where lower(json_each.value) = @${key})`);
    parameters[key] = tag;
  });
  if (query.usage === 'used') clauses.push('coalesce(o.usageOccurrences, 0) > 0');
  if (query.usage === 'unused') clauses.push('coalesce(o.usageOccurrences, 0) = 0');
  if (query.verification === 'verified') clauses.push('f.verified = 1');
  if (query.verification === 'unverified') clauses.push('f.verified = 0');
  if (query.review === 'needs_review') clauses.push(reviewCondition);
  if (query.review === 'clear') clauses.push(`not ${reviewCondition}`);
  if (query.grams === 'has_grams') clauses.push('f.serving_grams is not null');
  if (query.grams === 'missing_grams') clauses.push('f.serving_grams is null');

  return { sql: clauses.join(' and '), parameters };
};

const buildSort = (sort: FoodAnalyticsQuery['sort']) => {
  const stable = `lower(f.name) asc, lower(coalesce(f.brand, '')) asc, f.id asc`;
  switch (sort) {
    case 'most_recent':
      return `case when o.lastLoggedLocalDate is null then 1 else 0 end, o.lastLoggedLocalDate desc, ${stable}`;
    case 'calorie_contribution':
      return `coalesce(o.totalCalories, 0) desc, ${stable}`;
    case 'protein_contribution':
      return `coalesce(o.totalProtein, 0) desc, ${stable}`;
    case 'protein_density':
      return `case when coalesce(o.totalCalories, 0) <= 0 then 1 else 0 end,
              (o.totalProtein * 100.0 / nullif(o.totalCalories, 0)) desc, ${stable}`;
    case 'calorie_density':
      return `case when f.serving_grams is null then 1 else 0 end,
              (f.calories * 100.0 / nullif(f.serving_grams, 0)) desc, ${stable}`;
    case 'needs_review':
      return `(case when f.verified = 0 then 1 else 0 end
              + case when trim(coalesce(f.source, '')) = '' then 1 else 0 end
              + case when f.serving_grams is null then 1 else 0 end
              + case when abs(f.calories - (f.protein * 4 + f.carbs * 4 + f.fat * 9)) > max(10, f.calories * 0.05) then 1 else 0 end
              + case when coalesce(o.usageOccurrences, 0) = 0 then 1 else 0 end) desc,
              coalesce(o.usageOccurrences, 0) desc, ${stable}`;
    case 'name':
      return stable;
    case 'most_used':
    default:
      return `coalesce(o.usageOccurrences, 0) desc, ${stable}`;
  }
};

const rowSelection = `
  select f.id as foodId,
         f.name,
         f.brand,
         f.serving_size as servingSize,
         f.serving_grams as servingGrams,
         f.calories,
         f.protein,
         f.carbs,
         f.fat,
         f.fiber,
         f.sugar,
         f.verified,
         f.source,
         f.notes,
         f.tags,
         f.updated_at as updatedAt,
         coalesce(o.usageOccurrences, 0) as usageOccurrences,
         coalesce(o.distinctLoggedDays, 0) as distinctLoggedDays,
         o.lastLoggedLocalDate,
         coalesce(o.totalCalories, 0) as totalCalories,
         coalesce(o.totalProtein, 0) as totalProtein,
         coalesce(o.completeOccurrences, 0) as completeOccurrences,
         coalesce(o.completeDays, 0) as completeDays,
         coalesce(o.partialOccurrences, 0) as partialOccurrences,
         coalesce(o.partialDays, 0) as partialDays,
         coalesce(o.unknownOccurrences, 0) as unknownOccurrences,
         coalesce(o.unknownDays, 0) as unknownDays
    from foods f
    left join observed o on o.foodId = f.id`;

const normalizedPortionUnitSql = `case
  when lower(trim(portionUnit)) in ('g', 'gram', 'grams') then 'g'
  when lower(trim(portionUnit)) in ('serving', 'servings') then 'serving'
  when lower(trim(portionUnit)) in ('piece', 'pieces') then 'piece'
  when lower(trim(portionUnit)) in ('bottle', 'bottles') then 'bottle'
  when lower(trim(portionUnit)) in ('cup', 'cups') then 'cup'
  else lower(trim(portionUnit))
end`;

const portionFor = (row: PortionRow | undefined): FoodAnalyticsObservedPortion => {
  if (!row || numberValue(row.evidenceCount) === 0) {
    return {
      state: 'none',
      unit: null,
      medianQuantity: null,
      recentQuantity: null,
      recentLocalDate: null,
      evidenceCount: 0,
    };
  }
  if (numberValue(row.unitCount) !== 1 || row.normalizedUnit === null) {
    return {
      state: 'mixed_units',
      unit: null,
      medianQuantity: null,
      recentQuantity: null,
      recentLocalDate: null,
      evidenceCount: numberValue(row.evidenceCount),
    };
  }
  return {
    state: 'compatible',
    unit: row.normalizedUnit,
    medianQuantity: Number(row.medianQuantity),
    recentQuantity: Number(row.recentQuantity),
    recentLocalDate: row.recentLocalDate,
    evidenceCount: numberValue(row.evidenceCount),
  };
};

export const createFoodAnalyticsStore = (dependencies: {
  sqlite: Database.Database;
  now?: () => Date;
  onQuery?: (
    name: string,
    statement?: { sql: string; parameters: Record<string, string | number | null> },
  ) => void;
}) => {
  const { sqlite } = dependencies;
  const now = dependencies.now ?? getApplicationNow;
  const observe = dependencies.onQuery ?? (() => undefined);

  const resolveRange = (
    userId: string,
    query: Pick<FoodAnalyticsQuery, 'range' | 'end' | 'timeZone'>,
  ): AnalyticsRangeContext => {
    const requestedEnd = query.end;
    const authorityStatement = `select p.id as programId,
                                       i.projection_count as projectionCount
                                  from adaptive_nutrition_programs p
                                  left join adaptive_nutrition_program_revision_projection_integrity i
                                    on i.program_id = p.id and i.user_id = p.user_id
                                 where p.user_id = @userId
                                 limit 1`;
    const authorityParameters = { userId };
    observe('program-authority', { sql: authorityStatement, parameters: authorityParameters });
    const authority = sqlite.prepare(authorityStatement).get(authorityParameters) as
      | { programId: string; projectionCount: number | null }
      | undefined;

    type ProjectedRevisionRow = {
      revisionId: string;
      revisionProgramId: string;
      revisionUserId: string;
      revisionSequence: number;
      projectionRevisionId: string | null;
      projectionProgramId: string | null;
      projectionUserId: string | null;
      projectionSequence: number | null;
      effectiveLocalDate: string | null;
      snapshot: string;
    };

    let selectedRevision: ProjectedRevisionRow | undefined;
    if (authority) {
      const latestStatement = `select r.id as revisionId,
                                      r.program_id as revisionProgramId,
                                      r.user_id as revisionUserId,
                                      r.sequence as revisionSequence,
                                      d.revision_id as projectionRevisionId,
                                      d.program_id as projectionProgramId,
                                      d.user_id as projectionUserId,
                                      d.sequence as projectionSequence,
                                      d.effective_local_date as effectiveLocalDate,
                                      r.snapshot
                                 from adaptive_nutrition_program_revisions r
                                 left join adaptive_nutrition_program_revision_dates d
                                   on d.revision_id = r.id
                                where r.user_id = @userId and r.program_id = @programId
                                order by r.sequence desc
                                limit 1`;
      const latestParameters = { userId, programId: authority.programId };
      observe('program-latest-revision', {
        sql: latestStatement,
        parameters: latestParameters,
      });
      const latestRevision = sqlite.prepare(latestStatement).get(latestParameters) as
        | ProjectedRevisionRow
        | undefined;
      const projectionIsConsistent =
        latestRevision !== undefined &&
        authority.projectionCount !== null &&
        authority.projectionCount === latestRevision.revisionSequence &&
        latestRevision.revisionProgramId === authority.programId &&
        latestRevision.revisionUserId === userId &&
        latestRevision.projectionRevisionId === latestRevision.revisionId &&
        latestRevision.projectionProgramId === authority.programId &&
        latestRevision.projectionUserId === userId &&
        latestRevision.projectionSequence === latestRevision.revisionSequence &&
        latestRevision.effectiveLocalDate !== null;
      if (!projectionIsConsistent) throw new FoodAnalyticsProgramProjectionError();

      if (requestedEnd) {
        const historicalStatement = `select r.id as revisionId,
                                             r.program_id as revisionProgramId,
                                             r.user_id as revisionUserId,
                                             r.sequence as revisionSequence,
                                             d.revision_id as projectionRevisionId,
                                             d.program_id as projectionProgramId,
                                             d.user_id as projectionUserId,
                                             d.sequence as projectionSequence,
                                             d.effective_local_date as effectiveLocalDate,
                                             r.snapshot
                                        from adaptive_nutrition_program_revision_dates d
                                        join adaptive_nutrition_program_revisions r
                                          on r.id = d.revision_id
                                       where d.user_id = @userId
                                         and d.program_id = @programId
                                         and d.effective_local_date <= @requestedEnd
                                       order by d.effective_local_date desc, d.sequence desc
                                       limit 1`;
        const historicalParameters = {
          userId,
          programId: authority.programId,
          requestedEnd,
        };
        observe('program-historical-revision', {
          sql: historicalStatement,
          parameters: historicalParameters,
        });
        selectedRevision = sqlite.prepare(historicalStatement).get(historicalParameters) as
          | ProjectedRevisionRow
          | undefined;
      } else {
        selectedRevision = latestRevision;
      }
    }

    if (
      selectedRevision &&
      (selectedRevision.projectionRevisionId !== selectedRevision.revisionId ||
        selectedRevision.projectionProgramId !== authority?.programId ||
        selectedRevision.projectionUserId !== userId ||
        selectedRevision.projectionSequence !== selectedRevision.revisionSequence)
    ) {
      throw new FoodAnalyticsProgramProjectionError();
    }
    const programTimeZone = selectedRevision
      ? adaptiveProgramCalculationSchema.parse(JSON.parse(selectedRevision.snapshot)).timeZone
      : undefined;
    const rawUserPreferences = (
      sqlite.prepare('select preferences from users where id = ? limit 1').get(userId) as
        | { preferences: string | null }
        | undefined
    )?.preferences;
    let userPreferences: unknown = null;
    if (rawUserPreferences) {
      try {
        userPreferences = JSON.parse(rawUserPreferences);
      } catch {
        userPreferences = null;
      }
    }
    const userTimeZone = resolveUserPreferenceTimeZone(userPreferences);
    const authoritativeTimeZone = programTimeZone ?? userTimeZone;
    if (!authoritativeTimeZone) throw new UserTimeZoneRequiredError();
    if (query.timeZone && authoritativeTimeZone !== query.timeZone) {
      throw new FoodAnalyticsTimeZoneConflictError();
    }
    const timeZone = authoritativeTimeZone;
    const timeZoneSource = programTimeZone
      ? ('adaptive_program' as const)
      : ('user_profile' as const);
    const todayDate = getDateKeyInTimeZone(now(), timeZone);
    const endDate = query.end ?? todayDate;
    if (endDate > todayDate)
      throw new RangeError('Food analytics end date cannot be in the future');
    const range = resolveFoodAnalyticsRange(
      query.range,
      endDate,
      timeZone,
      todayDate,
      timeZoneSource,
    );
    let startDate = range.startDate;
    if (query.range === 'all') {
      observe('earliest-log');
      startDate =
        (
          sqlite
            .prepare(
              'select min(date) as startDate from nutrition_logs where user_id = ? and date <= ?',
            )
            .get(userId, endDate) as { startDate: string | null }
        ).startDate ?? null;
    }
    return { ...range, startDate, queryStartDate: range.startDate };
  };

  const loadSummary = (userId: string, range: AnalyticsRangeContext): SummaryRow => {
    const parameters = { userId, startDate: range.queryStartDate, endDate: range.endDate };
    const statement = `${rangeItemsCte(range)}
         select cast(count(*) as integer) as totalMealItemCount,
                coalesce(sum(calories), 0) as totalMealItemCalories,
                cast(sum(case when ownedFoodId is not null and foodDeletedAt is null then 1 else 0 end) as integer) as linkedUsageOccurrences,
                coalesce(sum(case when ownedFoodId is not null and foodDeletedAt is null then calories else 0 end), 0) as linkedFoodCalories,
                cast(count(distinct case when ownedFoodId is not null and foodDeletedAt is null then localDate end) as integer) as distinctLoggedDays,
                cast(count(distinct case when ownedFoodId is not null and foodDeletedAt is null then foodId end) as integer) as savedFoodsUsed,
                cast(sum(case when foodId is null then 1 else 0 end) as integer) as unlinkedMealItemCount,
                coalesce(sum(case when foodId is null then calories else 0 end), 0) as unlinkedMealItemCalories,
                cast(sum(case when ownedFoodId is not null and foodDeletedAt is not null then 1 else 0 end) as integer) as inactiveLinkedMealItemCount,
                coalesce(sum(case when ownedFoodId is not null and foodDeletedAt is not null then calories else 0 end), 0) as inactiveLinkedMealItemCalories,
                cast(sum(case when foodId is not null and ownedFoodId is null then 1 else 0 end) as integer) as unresolvedLinkedMealItemCount,
                coalesce(sum(case when foodId is not null and ownedFoodId is null then calories else 0 end), 0) as unresolvedLinkedMealItemCalories,
                cast(sum(case when ownedFoodId is not null and foodDeletedAt is null and dayStatus = 'complete' then 1 else 0 end) as integer) as completeOccurrences,
                cast(count(distinct case when ownedFoodId is not null and foodDeletedAt is null and dayStatus = 'complete' then localDate end) as integer) as completeDays,
                cast(sum(case when ownedFoodId is not null and foodDeletedAt is null and dayStatus = 'partial' then 1 else 0 end) as integer) as partialOccurrences,
                cast(count(distinct case when ownedFoodId is not null and foodDeletedAt is null and dayStatus = 'partial' then localDate end) as integer) as partialDays,
                cast(sum(case when ownedFoodId is not null and foodDeletedAt is null and dayStatus = 'unknown' then 1 else 0 end) as integer) as unknownOccurrences,
                cast(count(distinct case when ownedFoodId is not null and foodDeletedAt is null and dayStatus = 'unknown' then localDate end) as integer) as unknownDays
           from range_items`;
    observe('summary', { sql: statement, parameters });
    return sqlite.prepare(statement).get(parameters) as SummaryRow;
  };

  const loadSavedFoodsTotal = (userId: string) => {
    const statement =
      'select cast(count(*) as integer) as total from foods where user_id = @userId and deleted_at is null';
    const parameters = { userId };
    observe('saved-food-total', { sql: statement, parameters });
    return numberValue((sqlite.prepare(statement).get(parameters) as { total: number }).total);
  };

  const loadDefinitionsNeedingReview = (userId: string, range: AnalyticsRangeContext) => {
    const statement = `${observedCte(range)}
             select cast(count(*) as integer) as total
               from foods f
               left join observed o on o.foodId = f.id
              where f.user_id = @userId and f.deleted_at is null and ${reviewCondition}`;
    const parameters = { userId, startDate: range.queryStartDate, endDate: range.endDate };
    observe('review-total', { sql: statement, parameters });
    return numberValue(
      (
        sqlite.prepare(statement).get(parameters) as {
          total: number;
        }
      ).total,
    );
  };

  const loadAvailableTags = (userId: string) => {
    const statement = `select distinct lower(json_each.value) as tag
             from foods f, json_each(f.tags)
            where f.user_id = @userId and f.deleted_at is null
            order by tag`;
    const parameters = { userId };
    observe('tags', { sql: statement, parameters });
    return (sqlite.prepare(statement).all(parameters) as Array<{ tag: string }>).map(
      (row) => row.tag,
    );
  };

  const loadRows = (
    userId: string,
    range: AnalyticsRangeContext,
    query: FoodAnalyticsQuery,
    onlyFoodId?: string,
  ) => {
    const filters = buildFilters(query, onlyFoodId);
    const commonParameters = {
      userId,
      startDate: range.queryStartDate,
      endDate: range.endDate,
      ...filters.parameters,
    };
    const countStatement = `${observedCte(range)}
             select cast(count(*) as integer) as total
               from foods f
               left join observed o on o.foodId = f.id
              where ${filters.sql}`;
    observe('row-count', { sql: countStatement, parameters: commonParameters });
    const total = numberValue(
      (sqlite.prepare(countStatement).get(commonParameters) as { total: number }).total,
    );
    const rowParameters = {
      ...commonParameters,
      limit: onlyFoodId ? 1 : query.limit,
      offset: onlyFoodId ? 0 : (query.page - 1) * query.limit,
    };
    const rowStatement = `${observedCte(range)}
         ${rowSelection}
          where ${filters.sql}
          order by ${buildSort(query.sort)}
          limit @limit offset @offset`;
    observe('rows', { sql: rowStatement, parameters: rowParameters });
    const rows = sqlite.prepare(rowStatement).all(rowParameters) as AnalyticsRow[];
    return { rows, total };
  };

  const loadPortions = (userId: string, range: AnalyticsRangeContext, foodIds: string[]) => {
    if (foodIds.length === 0) return new Map<string, PortionRow>();
    const foodParameters = Object.fromEntries(
      foodIds.map((foodId, index) => [`foodId${index}`, foodId]),
    );
    const placeholders = foodIds.map((_, index) => `@foodId${index}`).join(', ');
    const parameters = {
      userId,
      startDate: range.queryStartDate,
      endDate: range.endDate,
      ...foodParameters,
    };
    const statement = `${rangeItemsCte(range)}, portions as (
           select foodId,
                  case when displayQuantity is not null and trim(coalesce(displayUnit, '')) <> ''
                       then displayQuantity else amount end as quantity,
                  case when displayQuantity is not null and trim(coalesce(displayUnit, '')) <> ''
                       then displayUnit else unit end as portionUnit,
                  calories,
                  localDate,
                  itemCreatedAt,
                  mealItemId
             from range_items
            where foodId in (${placeholders})
         ), normalized as (
           select *, ${normalizedPortionUnitSql} as normalizedUnit
             from portions
         ), ranked as (
           select *,
                  row_number() over (partition by foodId order by quantity, localDate, mealItemId) as quantityRank,
                  count(*) over (partition by foodId) as evidenceCount,
                  row_number() over (partition by foodId order by localDate desc, itemCreatedAt desc, mealItemId desc) as recentRank
             from normalized
         )
         select foodId,
                cast(count(distinct normalizedUnit) as integer) as unitCount,
                case when count(distinct normalizedUnit) = 1 then min(normalizedUnit) else null end as normalizedUnit,
                cast(max(evidenceCount) as integer) as evidenceCount,
                avg(case when quantityRank in ((evidenceCount + 1) / 2, (evidenceCount + 2) / 2) then quantity end) as medianQuantity,
                max(case when recentRank = 1 then quantity end) as recentQuantity,
                max(case when recentRank = 1 then localDate end) as recentLocalDate,
                sum(case when normalizedUnit = 'g' then calories else 0 end) as gramCalories,
                sum(case when normalizedUnit = 'g' then quantity else 0 end) as gramQuantity
           from ranked
          group by foodId`;
    observe('portions', { sql: statement, parameters });
    const rows = sqlite.prepare(statement).all(parameters) as PortionRow[];
    return new Map(rows.map((row) => [row.foodId, row]));
  };

  const mapItem = (
    row: AnalyticsRow,
    portionRow: PortionRow | undefined,
    linkedFoodCalories: number,
  ): FoodAnalyticsItem => {
    const input = {
      servingSize: row.servingSize,
      servingGrams: row.servingGrams,
      calories: Number(row.calories),
      protein: Number(row.protein),
      carbs: Number(row.carbs),
      fat: Number(row.fat),
      fiber: row.fiber === null ? null : Number(row.fiber),
      sugar: row.sugar === null ? null : Number(row.sugar),
      verified: Boolean(row.verified),
      source: row.source,
      notes: row.notes,
      updatedAt: row.updatedAt,
    };
    const totalCalories = numberValue(row.totalCalories);
    const totalProtein = numberValue(row.totalProtein);
    const portion = portionFor(portionRow);
    const caloriesPer100Grams =
      portion.state === 'compatible' &&
      portion.unit === 'g' &&
      numberValue(portionRow?.gramQuantity) > 0
        ? (numberValue(portionRow?.gramCalories) * 100) / numberValue(portionRow?.gramQuantity)
        : null;
    return {
      foodId: row.foodId,
      name: row.name,
      brand: row.brand,
      tags: normalizeTags(row.tags),
      currentDefinition: calculateFoodCurrentDefinition(input),
      observed: {
        usageOccurrences: numberValue(row.usageOccurrences),
        distinctLoggedDays: numberValue(row.distinctLoggedDays),
        lastLoggedLocalDate: row.lastLoggedLocalDate,
        totalCalories,
        totalProtein,
        linkedCalorieSharePercent: calculatePercent(totalCalories, linkedFoodCalories),
        proteinPer100Kcal: calculateProteinPer100Kcal(totalProtein, totalCalories),
        caloriesPer100Grams,
        portion,
        dayStates: dayStatesFromRow(row),
      },
      definitionReviewReasons: calculateFoodDefinitionReviewReasons(
        input,
        numberValue(row.usageOccurrences),
      ),
    };
  };

  const getAnalytics = (
    userId: string,
    rawQuery: FoodAnalyticsQuery,
  ): {
    data: FoodAnalytics;
    meta: { page: number; limit: number; total: number };
  } => {
    const query = foodAnalyticsQuerySchema.parse(rawQuery);
    const range = resolveRange(userId, query);
    return sqlite.transaction(() => {
      const summaryRow = loadSummary(userId, range);
      const savedFoodsTotal = loadSavedFoodsTotal(userId);
      const definitionsNeedingReview = loadDefinitionsNeedingReview(userId, range);
      const { rows, total } = loadRows(userId, range, query);
      const portions = loadPortions(
        userId,
        range,
        rows.map((row) => row.foodId),
      );
      const linkedFoodCalories = numberValue(summaryRow.linkedFoodCalories);
      const summary: FoodAnalyticsSummary = {
        savedFoodsTotal,
        savedFoodsUsed: numberValue(summaryRow.savedFoodsUsed),
        linkedUsageOccurrences: numberValue(summaryRow.linkedUsageOccurrences),
        distinctLoggedDays: numberValue(summaryRow.distinctLoggedDays),
        linkedFoodCalories,
        totalMealItemCalories: numberValue(summaryRow.totalMealItemCalories),
        linkedCaloriesPercent: calculatePercent(
          linkedFoodCalories,
          numberValue(summaryRow.totalMealItemCalories),
        ),
        unlinkedMealItemCount: numberValue(summaryRow.unlinkedMealItemCount),
        unlinkedMealItemCalories: numberValue(summaryRow.unlinkedMealItemCalories),
        inactiveLinkedMealItemCount: numberValue(summaryRow.inactiveLinkedMealItemCount),
        inactiveLinkedMealItemCalories: numberValue(summaryRow.inactiveLinkedMealItemCalories),
        unresolvedLinkedMealItemCount: numberValue(summaryRow.unresolvedLinkedMealItemCount),
        unresolvedLinkedMealItemCalories: numberValue(summaryRow.unresolvedLinkedMealItemCalories),
        definitionsNeedingReview,
        dayStates: dayStatesFromRow(summaryRow),
      };
      return {
        data: {
          range: {
            kind: range.kind,
            startDate: range.startDate,
            endDate: range.endDate,
            calendarDays: range.calendarDays,
            timeZone: range.timeZone,
            timeZoneSource: range.timeZoneSource,
            isHistorical: range.isHistorical,
          },
          summary,
          items: rows.map((row) => mapItem(row, portions.get(row.foodId), linkedFoodCalories)),
          availableTags: loadAvailableTags(userId),
        },
        meta: { page: query.page, limit: query.limit, total },
      };
    })();
  };

  const getDetail = (
    userId: string,
    foodId: string,
    rawQuery: FoodAnalyticsDetailQuery,
  ): FoodAnalyticsDetail => {
    const detailQuery = foodAnalyticsDetailQuerySchema.parse(rawQuery);
    const listQuery = foodAnalyticsQuerySchema.parse({
      range: detailQuery.range,
      end: detailQuery.end,
      timeZone: detailQuery.timeZone,
      page: 1,
      limit: 1,
    });
    const range = resolveRange(userId, listQuery);
    return sqlite.transaction(() => {
      const summaryRow = loadSummary(userId, range);
      const { rows } = loadRows(userId, range, listQuery, foodId);
      const row = rows[0];
      if (!row) throw new FoodAnalyticsNotFoundError();
      const portion = loadPortions(userId, range, [foodId]).get(foodId);
      const occurrenceCountStatement = `${rangeItemsCte(range)}
               select cast(count(*) as integer) as total
                 from range_items
                where foodId = @foodId and ownedFoodId is not null and foodDeletedAt is null`;
      const occurrenceCountParameters = {
        userId,
        startDate: range.queryStartDate,
        endDate: range.endDate,
        foodId,
      };
      observe('occurrence-count', {
        sql: occurrenceCountStatement,
        parameters: occurrenceCountParameters,
      });
      const occurrenceTotal = numberValue(
        (
          sqlite.prepare(occurrenceCountStatement).get(occurrenceCountParameters) as {
            total: number;
          }
        ).total,
      );
      const occurrenceParameters = {
        userId,
        startDate: range.queryStartDate,
        endDate: range.endDate,
        foodId,
        limit: detailQuery.occurrenceLimit,
        offset: (detailQuery.occurrencePage - 1) * detailQuery.occurrenceLimit,
      };
      const occurrenceStatement = `${rangeItemsCte(range)}
           select mealItemId,
                  mealId,
                  localDate,
                  mealName,
                  mealTime,
                  amount,
                  unit,
                  displayQuantity,
                  displayUnit,
                  calories,
                  protein,
                  carbs,
                  fat,
                  dayStatus as nutritionDayState
             from range_items
            where foodId = @foodId and ownedFoodId is not null and foodDeletedAt is null
            order by localDate desc, itemCreatedAt desc, mealItemId desc
            limit @limit offset @offset`;
      observe('occurrences', { sql: occurrenceStatement, parameters: occurrenceParameters });
      const occurrenceRows = sqlite
        .prepare(occurrenceStatement)
        .all(occurrenceParameters) as OccurrenceRow[];
      return {
        range: {
          kind: range.kind,
          startDate: range.startDate,
          endDate: range.endDate,
          calendarDays: range.calendarDays,
          timeZone: range.timeZone,
          timeZoneSource: range.timeZoneSource,
          isHistorical: range.isHistorical,
        },
        food: mapItem(row, portion, numberValue(summaryRow.linkedFoodCalories)),
        occurrences: occurrenceRows.map((occurrence) => ({
          mealItemId: occurrence.mealItemId,
          mealId: occurrence.mealId,
          localDate: occurrence.localDate,
          mealName: occurrence.mealName,
          mealTime: occurrence.mealTime,
          quantity:
            occurrence.displayQuantity !== null && occurrence.displayUnit?.trim()
              ? occurrence.displayQuantity
              : occurrence.amount,
          unit:
            occurrence.displayQuantity !== null && occurrence.displayUnit?.trim()
              ? occurrence.displayUnit
              : occurrence.unit,
          calories: Number(occurrence.calories),
          protein: Number(occurrence.protein),
          carbs: Number(occurrence.carbs),
          fat: Number(occurrence.fat),
          nutritionDayState: occurrence.nutritionDayState,
        })),
        occurrenceMeta: {
          page: detailQuery.occurrencePage,
          limit: detailQuery.occurrenceLimit,
          total: occurrenceTotal,
        },
        snapshotNotice: SNAPSHOT_NOTICE,
      };
    })();
  };

  return { getAnalytics, getDetail };
};
