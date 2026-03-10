export type WeightEntry = { date: string; weight: number };
export type EWMAOptions = { alpha?: number };
export type EWMAResult = { date: string; scale: number; trend: number }[];

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
