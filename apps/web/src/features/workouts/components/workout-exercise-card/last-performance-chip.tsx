import type { ExerciseTrackingType, WeightUnit } from '@pulse/shared';

import { Badge } from '@/components/ui/badge';
import { useLastPerformance } from '@/hooks/use-last-performance';

import { formatCompactSets } from '../../lib/tracking';

const historyDateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

type LastPerformanceChipProps = {
  enabled?: boolean;
  exerciseId: string;
  trackingType: ExerciseTrackingType;
  weightUnit: WeightUnit;
};

export function LastPerformanceChip({
  enabled = true,
  exerciseId,
  trackingType,
  weightUnit,
}: LastPerformanceChipProps) {
  const historyQuery = useLastPerformance(exerciseId, {
    enabled,
    includeRelated: false,
    limit: 1,
  });

  if (!enabled) {
    return null;
  }

  if (historyQuery.isPending) {
    return <Badge variant="outline">Last performance: loading…</Badge>;
  }

  // `useLastPerformance` returns `historyEntries` in current API responses and `history` in legacy responses.
  const lastEntry = historyQuery.data?.historyEntries[0] ?? historyQuery.data?.history ?? null;
  if (!lastEntry) {
    return <Badge variant="outline">Last performance: no history</Badge>;
  }

  const setSummary = formatCompactSets(
    lastEntry.sets.map((set) =>
      trackingType === 'distance'
        ? { distance: set.reps, weight: set.weight }
        : { reps: set.reps, weight: set.weight },
    ),
    trackingType,
    {
      useLegacySecondsFallback: trackingType !== 'reps_seconds',
      weightUnit,
    },
  );

  return (
    <Badge variant="outline">{`Last: ${historyDateFormatter.format(new Date(`${lastEntry.date}T12:00:00`))} · ${setSummary}`}</Badge>
  );
}
