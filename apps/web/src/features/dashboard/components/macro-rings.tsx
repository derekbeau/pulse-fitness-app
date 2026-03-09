/* eslint-disable react-refresh/only-export-components */
import type { DashboardSnapshot } from '@pulse/shared';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { ProgressRing } from '@/components/ui/progress-ring';

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
      valueLabel: isOverTarget ? `+${Math.abs(remaining)}${unit} over` : `${remaining}${unit}`,
    };
  }

  return {
    color: isOverTarget ? OVER_TARGET_COLOR : baseColor,
    progress: ratioPercent,
    valueLabel: `${stat.actual}${unit}`,
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

export function MacroRings({ snapshot }: MacroRingsProps) {
  const [mode, setMode] = useState<MacroMode>('eaten');

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-end">
        <div
          aria-label="Macro display mode"
          className="inline-flex rounded-lg border border-border bg-card p-1"
          role="group"
        >
          <Button
            aria-pressed={mode === 'eaten'}
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

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {MACRO_CONFIGS.map((macro) => {
          const state = getMacroRingState(getMacroStat(snapshot, macro.key), mode, macro.color, macro.unit);

          return (
            <div
              className="flex flex-col items-center gap-2"
              data-slot="macro-ring-item"
              key={macro.key}
            >
              <div className="w-full max-w-[106px] px-1">
                <ProgressRing
                  aria-label={`${macro.label} progress`}
                  className="h-auto w-full [&_span]:text-[11px] [&_span]:leading-tight [&_span]:text-center"
                  color={state.color}
                  label={state.valueLabel}
                  value={state.progress}
                />
              </div>
              <p className="text-sm font-medium text-muted">{macro.label}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
