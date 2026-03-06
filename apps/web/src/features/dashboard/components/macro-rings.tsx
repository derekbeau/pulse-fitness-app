import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ProgressRing } from '@/components/ui/progress-ring';
import { mockDailySnapshot, type DailySnapshot, type MacroStat } from '@/lib/mock-data/dashboard';

type MacroRingsProps = {
  snapshot?: DailySnapshot;
};

type MacroMode = 'eaten' | 'remaining';

type MacroConfig = {
  key: keyof DailySnapshot['macros'];
  label: string;
  color: string;
  unit: 'kcal' | 'g';
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

export function MacroRings({ snapshot = mockDailySnapshot }: MacroRingsProps) {
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

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {MACRO_CONFIGS.map((macro) => {
          const state = getMacroRingState(
            snapshot.macros[macro.key],
            mode,
            macro.color,
            macro.unit,
          );

          return (
            <div className="flex flex-col items-center gap-2" data-slot="macro-ring-item" key={macro.key}>
              <ProgressRing
                aria-label={`${macro.label} progress`}
                className="[&_span]:text-[11px] [&_span]:leading-tight [&_span]:text-center"
                color={state.color}
                label={state.valueLabel}
                size={106}
                value={state.progress}
              />
              <p className="text-sm font-medium text-muted">{macro.label}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
