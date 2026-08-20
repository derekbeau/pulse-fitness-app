export type WeightEntry = { date: string; weight: number };
export type EWMAOptions = { alpha?: number };
export type EWMAResult = { date: string; scale: number; trend: number }[];

export const TREND_WEIGHT_ALGORITHM = Object.freeze({
  version: 'trend-weight-v1' as const,
  windowDays: 30,
  alpha: 0.1,
  interpolation: 'none' as const,
  minimumObservations: 2,
  sufficientObservations: 3,
  sufficientSpanDays: 14,
  staleAfterDays: 7,
  rateLookbackDays: 14,
  rateMinimumObservations: 3,
  rateMinimumSpanDays: 7,
});

export type CanonicalTrendWeightInput = {
  id: string;
  date: string;
  weightKg: number;
  createdAt: number;
  updatedAt: number;
};

export type TrendWeightEvidenceState =
  | 'no_data'
  | 'scale_only'
  | 'developing'
  | 'sufficient'
  | 'stale';

export type CanonicalTrendWeightPoint = {
  sourceEntryId: string;
  date: string;
  scaleWeightKg: number;
  trendWeightKg: number | null;
  scaleTrendDifferenceKg: number | null;
  state: Exclude<TrendWeightEvidenceState, 'no_data' | 'stale'>;
  observationCount: number;
  spanDays: number;
  gapFromPreviousDays: number | null;
  corrected: boolean;
};

export type CanonicalTrendWeightCurrent = {
  latestScale: CanonicalTrendWeightInput | null;
  trendWeightKg: number | null;
  trendDate: string | null;
  scaleTrendDifferenceKg: number | null;
  rateKgPerWeek: number | null;
  state: TrendWeightEvidenceState;
  evidence: {
    observationCount: number;
    spanDays: number;
    latestAgeDays: number | null;
  };
};

export type CanonicalTrendWeightDelta = {
  requestedDays: 7 | 14 | 30 | 90;
  status: 'supported' | 'unavailable';
  valueKg: number | null;
  fromAsOfDate: string;
  fromTrendDate: string | null;
  toTrendDate: string | null;
  reasonCode: 'NO_CURRENT_TREND' | 'NO_PRIOR_TREND' | 'STALE_CURRENT_TREND' | null;
};

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

const dateEpoch = (date: string) => {
  if (!DATE_PATTERN.test(date)) throw new RangeError(`Invalid date: ${date}`);
  const [year, month, day] = date.split('-').map(Number);
  const epoch = Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1);
  if (new Date(epoch).toISOString().slice(0, 10) !== date) {
    throw new RangeError(`Invalid date: ${date}`);
  }
  return epoch;
};

export const addTrendWeightCalendarDays = (date: string, days: number) =>
  new Date(dateEpoch(date) + days * DAY_MS).toISOString().slice(0, 10);

export const trendWeightCalendarDaysBetween = (earlier: string, later: string) =>
  Math.round((dateEpoch(later) - dateEpoch(earlier)) / DAY_MS);

const compareCanonicalEntries = (
  left: CanonicalTrendWeightInput,
  right: CanonicalTrendWeightInput,
) => left.date.localeCompare(right.date) || left.id.localeCompare(right.id);

const validateCanonicalEntries = (entries: readonly CanonicalTrendWeightInput[]) => {
  const sorted = [...entries].sort(compareCanonicalEntries);
  for (const [index, entry] of sorted.entries()) {
    dateEpoch(entry.date);
    if (!Number.isFinite(entry.weightKg) || entry.weightKg <= 0) {
      throw new RangeError('Canonical Trend Weight inputs must contain positive finite kg values');
    }
    if (index > 0 && sorted[index - 1]?.date === entry.date) {
      throw new RangeError(`Canonical Trend Weight received duplicate date ${entry.date}`);
    }
  }
  return sorted;
};

const selectEvidence = (entries: readonly CanonicalTrendWeightInput[], asOfDate: string) => {
  const startDate = addTrendWeightCalendarDays(asOfDate, -(TREND_WEIGHT_ALGORITHM.windowDays - 1));
  return entries.filter((entry) => entry.date >= startDate && entry.date <= asOfDate);
};

const evidenceSpanDays = (entries: readonly CanonicalTrendWeightInput[]) => {
  const first = entries[0];
  const last = entries.at(-1);
  return first && last ? trendWeightCalendarDaysBetween(first.date, last.date) : 0;
};

const trendForEvidence = (entries: readonly CanonicalTrendWeightInput[]) => {
  if (entries.length < TREND_WEIGHT_ALGORITHM.minimumObservations) return null;
  return (
    computeEWMA(
      entries.map((entry) => ({ date: entry.date, weight: entry.weightKg })),
      { alpha: TREND_WEIGHT_ALGORITHM.alpha },
    ).at(-1)?.trend ?? null
  );
};

const pointState = (
  observationCount: number,
  spanDays: number,
): CanonicalTrendWeightPoint['state'] => {
  if (observationCount < TREND_WEIGHT_ALGORITHM.minimumObservations) return 'scale_only';
  if (
    observationCount < TREND_WEIGHT_ALGORITHM.sufficientObservations ||
    spanDays < TREND_WEIGHT_ALGORITHM.sufficientSpanDays
  ) {
    return 'developing';
  }
  return 'sufficient';
};

export function calculateCanonicalTrendWeightPoint(
  rawEntries: readonly CanonicalTrendWeightInput[],
  asOfDate: string,
): CanonicalTrendWeightPoint | null {
  dateEpoch(asOfDate);
  const entries = validateCanonicalEntries(rawEntries).filter((entry) => entry.date <= asOfDate);
  const latest = entries.at(-1);
  if (!latest) return null;
  const evidence = selectEvidence(entries, asOfDate);
  const observationCount = evidence.length;
  const spanDays = evidenceSpanDays(evidence);
  const trendWeightKg = trendForEvidence(evidence);
  const previous = entries.at(-2);
  return {
    sourceEntryId: latest.id,
    date: latest.date,
    scaleWeightKg: latest.weightKg,
    trendWeightKg,
    scaleTrendDifferenceKg: trendWeightKg === null ? null : latest.weightKg - trendWeightKg,
    state: pointState(observationCount, spanDays),
    observationCount,
    spanDays,
    gapFromPreviousDays: previous
      ? trendWeightCalendarDaysBetween(previous.date, latest.date)
      : null,
    corrected: latest.updatedAt > latest.createdAt,
  };
}

export function calculateCanonicalTrendWeightSeries(
  rawEntries: readonly CanonicalTrendWeightInput[],
  startDate: string,
  endDate: string,
): CanonicalTrendWeightPoint[] {
  dateEpoch(startDate);
  dateEpoch(endDate);
  if (startDate > endDate) throw new RangeError('Trend Weight start date must not exceed end date');
  const entries = validateCanonicalEntries(rawEntries).filter((entry) => entry.date <= endDate);
  return entries
    .filter((entry) => entry.date >= startDate)
    .map((entry) => calculateCanonicalTrendWeightPoint(entries, entry.date))
    .filter((point): point is CanonicalTrendWeightPoint => point !== null);
}

export function calculateDatedTrendRateKgPerWeek(
  points: readonly Pick<CanonicalTrendWeightPoint, 'date' | 'trendWeightKg'>[],
  endDate: string,
): number | null {
  const startDate = addTrendWeightCalendarDays(
    endDate,
    -(TREND_WEIGHT_ALGORITHM.rateLookbackDays - 1),
  );
  const usable = points.filter(
    (point): point is { date: string; trendWeightKg: number } =>
      point.date >= startDate && point.date <= endDate && point.trendWeightKg !== null,
  );
  const first = usable[0];
  const last = usable.at(-1);
  if (
    usable.length < TREND_WEIGHT_ALGORITHM.rateMinimumObservations ||
    !first ||
    !last ||
    trendWeightCalendarDaysBetween(first.date, last.date) <
      TREND_WEIGHT_ALGORITHM.rateMinimumSpanDays
  ) {
    return null;
  }
  const x = usable.map((point) => trendWeightCalendarDaysBetween(first.date, point.date));
  const y = usable.map((point) => point.trendWeightKg);
  const xMean = x.reduce((sum, value) => sum + value, 0) / x.length;
  const yMean = y.reduce((sum, value) => sum + value, 0) / y.length;
  let numerator = 0;
  let denominator = 0;
  for (let index = 0; index < usable.length; index += 1) {
    const xDelta = (x[index] ?? 0) - xMean;
    numerator += xDelta * ((y[index] ?? 0) - yMean);
    denominator += xDelta * xDelta;
  }
  return denominator === 0 ? null : (numerator / denominator) * 7;
}

export function calculateCanonicalTrendWeightCurrent(
  rawEntries: readonly CanonicalTrendWeightInput[],
  asOfDate: string,
): CanonicalTrendWeightCurrent {
  dateEpoch(asOfDate);
  const entries = validateCanonicalEntries(rawEntries).filter((entry) => entry.date <= asOfDate);
  const latestScale = entries.at(-1) ?? null;
  if (!latestScale) {
    return {
      latestScale: null,
      trendWeightKg: null,
      trendDate: null,
      scaleTrendDifferenceKg: null,
      rateKgPerWeek: null,
      state: 'no_data',
      evidence: { observationCount: 0, spanDays: 0, latestAgeDays: null },
    };
  }
  const evidence = selectEvidence(entries, asOfDate);
  const observationCount = evidence.length;
  const spanDays = evidenceSpanDays(evidence);
  const latestAgeDays = trendWeightCalendarDaysBetween(latestScale.date, asOfDate);
  const trendWeightKg = trendForEvidence(evidence);
  const seriesStart = addTrendWeightCalendarDays(
    asOfDate,
    -(TREND_WEIGHT_ALGORITHM.windowDays + TREND_WEIGHT_ALGORITHM.rateLookbackDays),
  );
  const points = calculateCanonicalTrendWeightSeries(entries, seriesStart, asOfDate);
  const state: TrendWeightEvidenceState =
    latestAgeDays > TREND_WEIGHT_ALGORITHM.staleAfterDays
      ? 'stale'
      : trendWeightKg === null
        ? 'scale_only'
        : pointState(observationCount, spanDays);
  return {
    latestScale,
    trendWeightKg,
    trendDate: trendWeightKg === null ? null : (evidence.at(-1)?.date ?? null),
    scaleTrendDifferenceKg: trendWeightKg === null ? null : latestScale.weightKg - trendWeightKg,
    rateKgPerWeek:
      trendWeightKg === null || state === 'stale'
        ? null
        : calculateDatedTrendRateKgPerWeek(points, evidence.at(-1)?.date ?? asOfDate),
    state,
    evidence: { observationCount, spanDays, latestAgeDays },
  };
}

export function calculateCanonicalTrendWeightDeltas(
  rawEntries: readonly CanonicalTrendWeightInput[],
  asOfDate: string,
  requestedDays: readonly (7 | 14 | 30 | 90)[] = [7, 14, 30, 90],
): CanonicalTrendWeightDelta[] {
  const current = calculateCanonicalTrendWeightCurrent(rawEntries, asOfDate);
  return requestedDays.map((days) => {
    const fromAsOfDate = addTrendWeightCalendarDays(asOfDate, -days);
    if (current.state === 'stale') {
      return {
        requestedDays: days,
        status: 'unavailable',
        valueKg: null,
        fromAsOfDate,
        fromTrendDate: null,
        toTrendDate: current.trendDate,
        reasonCode: 'STALE_CURRENT_TREND',
      };
    }
    if (current.trendWeightKg === null) {
      return {
        requestedDays: days,
        status: 'unavailable',
        valueKg: null,
        fromAsOfDate,
        fromTrendDate: null,
        toTrendDate: null,
        reasonCode: 'NO_CURRENT_TREND',
      };
    }
    const prior = calculateCanonicalTrendWeightCurrent(rawEntries, fromAsOfDate);
    if (prior.trendWeightKg === null) {
      return {
        requestedDays: days,
        status: 'unavailable',
        valueKg: null,
        fromAsOfDate,
        fromTrendDate: null,
        toTrendDate: current.trendDate,
        reasonCode: 'NO_PRIOR_TREND',
      };
    }
    return {
      requestedDays: days,
      status: 'supported',
      valueKg: current.trendWeightKg - prior.trendWeightKg,
      fromAsOfDate,
      fromTrendDate: prior.trendDate,
      toTrendDate: current.trendDate,
      reasonCode: null,
    };
  });
}

function clampAlpha(alpha: number): number {
  if (alpha < 0) return 0;
  if (alpha > 1) return 1;
  return alpha;
}

export function computeEWMA(entries: WeightEntry[], options: EWMAOptions = {}): EWMAResult {
  if (entries.length === 0) {
    return [];
  }

  const alpha = clampAlpha(options.alpha ?? 0.1);
  const sortedEntries = [...entries].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
  );

  let previousTrend = sortedEntries[0].weight;

  return sortedEntries.map((entry, index) => {
    const scale = entry.weight;
    const trend = index === 0 ? scale : alpha * scale + (1 - alpha) * previousTrend;

    previousTrend = trend;

    return {
      date: entry.date,
      scale,
      trend,
    };
  });
}

export function computeWeightInsights(
  ewmaResults: EWMAResult,
  periodDays: number,
): { avgWeight: number; periodChange: number; direction: 'up' | 'down' | 'stable' } {
  if (ewmaResults.length === 0) {
    return {
      avgWeight: 0,
      periodChange: 0,
      direction: 'stable',
    };
  }

  const sortedResults = [...ewmaResults].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
  );
  const startDate = new Date();
  startDate.setUTCDate(startDate.getUTCDate() - Math.max(periodDays - 1, 0));
  const periodStartDate = startDate.toISOString().slice(0, 10);

  const periodResults = sortedResults.filter((result) => result.date >= periodStartDate);
  if (periodResults.length === 0) {
    return {
      avgWeight: 0,
      periodChange: 0,
      direction: 'stable',
    };
  }

  const totalTrend = periodResults.reduce((sum, result) => sum + result.trend, 0);
  const avgWeight = totalTrend / periodResults.length;
  const firstTrend = periodResults[0].trend;
  const lastTrend = periodResults[periodResults.length - 1].trend;
  const periodChange = lastTrend - firstTrend;

  const direction: 'up' | 'down' | 'stable' =
    Math.abs(periodChange) < 0.1 ? 'stable' : periodChange > 0 ? 'up' : 'down';

  return {
    avgWeight,
    periodChange,
    direction,
  };
}
