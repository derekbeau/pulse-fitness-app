/* eslint-disable react-refresh/only-export-components */
import type { DashboardSnapshot } from '@pulse/shared';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { ProgressRing } from '@/components/ui/progress-ring';
import {
  DashboardDrilldownLink,
  dashboardDrilldownCardClassName,
} from '@/features/dashboard/components/dashboard-drilldown-link';
import { formatCalories, formatGrams } from '@/lib/format-utils';
import { cn } from '@/lib/utils';

type MacroRingsProps = {
  snapshot?: DashboardSnapshot;
};

type MacroMode = 'eaten' | 'remaining';

type MacroKey = keyof DashboardSnapshot['macros']['actual'];

type MacroConfig = {
  key: MacroKey;
  label: string;
  color: string;
  unit: 'kcal' | 'g';
};

type MacroStat = {
  actual: number;
  target: number;
};

type MacroRingState = {
  color: string;
  progress: number;
  valueLabel: string;
};

const OVER_TARGET_COLOR = '#DC2626';

const MACRO_CONFIGS: MacroConfig[] = [
  { key: 'calories', label: 'Calories', color: '#F59E0B', unit: 'kcal' },
  { key: 'protein', label: 'Protein', color: '#22C55E', unit: 'g' },
  { key: 'carbs', label: 'Carbs', color: '#3B82F6', unit: 'g' },
  { key: 'fat', label: 'Fat', color: '#A855F7', unit: 'g' },
];

const getRatioPercent = (actual: number, target: number): number => {
  if (target <= 0) {
    return 0;
  }

  return (actual / target) * 100;
};

export const getMacroRingState = (
  stat: MacroStat,
  mode: MacroMode,
  baseColor: string,
  unit: MacroConfig['unit'],
): MacroRingState => {
  const ratioPercent = getRatioPercent(stat.actual, stat.target);
  const isOverTarget = stat.actual > stat.target;
  const remaining = stat.target - stat.actual;

  if (mode === 'remaining') {
    return {
      color: isOverTarget ? OVER_TARGET_COLOR : baseColor,
      progress: 100 - ratioPercent,
      valueLabel: isOverTarget
        ? `+${unit === 'kcal' ? formatCalories(Math.abs(remaining), 'kcal') : formatGrams(Math.abs(remaining))} over`
        : unit === 'kcal'
          ? formatCalories(remaining, 'kcal')
          : formatGrams(remaining),
    };
  }

  return {
    color: isOverTarget ? OVER_TARGET_COLOR : baseColor,
    progress: ratioPercent,
    valueLabel: unit === 'kcal' ? formatCalories(stat.actual, 'kcal') : formatGrams(stat.actual),
  };
};

const getMacroStat = (snapshot: DashboardSnapshot | undefined, key: MacroKey): MacroStat => {
  if (!snapshot) {
    return { actual: 0, target: 0 };
  }

  return {
    actual: snapshot.macros.actual[key],
    target: snapshot.macros.target[key],
  };
};

const formatMacroSummary = (stat: MacroStat, unit: MacroConfig['unit']) => {
  if (stat.target <= 0) {
    return 'No target';
  }

  if (unit === 'kcal') {
    return `${formatCalories(stat.actual)} / ${formatCalories(stat.target)} kcal`;
  }

  return `${formatGrams(stat.actual)} / ${formatGrams(stat.target)}`;
};

export function MacroRings({ snapshot }: MacroRingsProps) {
  const [mode, setMode] = useState<MacroMode>('eaten');

  return (
    <section className="space-y-2.5">
      <div className="flex items-center justify-end">
        <div
          aria-label="Macro display mode"
          className="inline-flex rounded-lg border border-border bg-card p-0.5"
          role="group"
        >
          <Button
            aria-pressed={mode === 'eaten'}
            className="relative z-20 px-2.5 text-xs"
            onClick={() => {
              setMode('eaten');
            }}
            size="sm"
            variant={mode === 'eaten' ? 'default' : 'ghost'}
          >
            Eaten
          </Button>
          <Button
            aria-pressed={mode === 'remaining'}
            className="relative z-20 px-2.5 text-xs"
            onClick={() => {
              setMode('remaining');
            }}
            size="sm"
            variant={mode === 'remaining' ? 'default' : 'ghost'}
          >
            Remaining
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        {MACRO_CONFIGS.map((macro) => {
          const stat = getMacroStat(snapshot, macro.key);
          const state = getMacroRingState(stat, mode, macro.color, macro.unit);

          return (
            <DashboardDrilldownLink
              indicatorClassName="top-2 right-2 bottom-auto px-1.5 py-0.5"
              indicatorLabel=""
              key={macro.key}
              to="/nutrition"
              viewLabel={`View nutrition details for ${macro.label}`}
            >
              <div
                className={cn(
                  'flex min-w-0 items-center gap-2.5 rounded-xl border border-border/70 bg-card/40 px-2.5 py-2',
                  dashboardDrilldownCardClassName,
                )}
                data-slot="macro-ring-item"
              >
                <div className="w-16 shrink-0">
                  <ProgressRing
                    aria-label={`${macro.label} progress`}
                    className="h-auto w-full"
                    color={state.color}
                    label={state.valueLabel}
                    labelClassName="text-[10px] leading-tight font-semibold"
                    size={68}
                    strokeWidth={7}
                    value={state.progress}
                  />
                </div>
                <div className="min-w-0 space-y-0.5 pr-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    {macro.label}
                  </p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {formatMacroSummary(stat, macro.unit)}
                  </p>
                </div>
              </div>
            </DashboardDrilldownLink>
          );
        })}
      </div>
    </section>
  );
}
