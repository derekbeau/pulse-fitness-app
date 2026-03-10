import { useState } from 'react';

import { ProgressRing } from '@/components/ui/progress-ring';
import { cn } from '@/lib/utils';

type MacroValues = {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
};

type NutritionMacroRingsProps = {
  actuals: MacroValues;
  targets: MacroValues;
};

type MacroView = 'eaten' | 'remaining';
type MacroKey = keyof MacroValues;

const MACRO_RING_CONFIG: Array<{
  key: MacroKey;
  label: string;
  color: string;
  unit: 'cal' | 'g';
}> = [
  { key: 'calories', label: 'Calories', color: 'var(--color-accent-cream)', unit: 'cal' },
  { key: 'protein', label: 'Protein', color: 'var(--color-accent-mint)', unit: 'g' },
  { key: 'carbs', label: 'Carbs', color: 'var(--color-primary)', unit: 'g' },
  { key: 'fat', label: 'Fat', color: 'var(--color-accent-pink)', unit: 'g' },
];

const OVER_TARGET_COLOR = 'var(--color-destructive)';

export function NutritionMacroRings({ actuals, targets }: NutritionMacroRingsProps) {
  const [view, setView] = useState<MacroView>('eaten');

  return (
    <section aria-labelledby="nutrition-macro-rings-heading" className="space-y-4">
      <div className="flex flex-col items-center gap-3 text-center sm:flex-row sm:justify-between sm:text-left">
        <div className="space-y-1">
          <h2 id="nutrition-macro-rings-heading" className="text-lg font-semibold text-foreground">
            Macro progress
          </h2>
          <p className="text-sm text-muted">Switch between intake and what is left for the day.</p>
        </div>

        <div
          aria-label="Macro progress view"
          className="inline-flex rounded-full border border-border/70 bg-card/80 p-1 shadow-sm"
          role="group"
        >
          <ToggleButton
            isActive={view === 'eaten'}
            onClick={() => setView('eaten')}
            label="Eaten"
          />
          <ToggleButton
            isActive={view === 'remaining'}
            onClick={() => setView('remaining')}
            label="Remaining"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {MACRO_RING_CONFIG.map((macro) => {
          const actual = actuals[macro.key];
          const target = targets[macro.key];
          const isOverTarget = target <= 0 ? actual > 0 : actual > target;
          const remaining = Math.max(target - actual, 0);
          const progress = getProgressValue({ actual, target, isOverTarget, view });
          const display = getDisplayValue({ actual, remaining, target, isOverTarget, unit: macro.unit, view });

          return (
            <article
              key={macro.key}
              className="flex flex-col items-center justify-center rounded-2xl border border-border/70 bg-card/90 px-4 py-5 text-center shadow-sm"
            >
              <ProgressRing
                aria-label={`${macro.label} ${view} progress`}
                color={isOverTarget ? OVER_TARGET_COLOR : macro.color}
                label={<RingValue primary={display.primary} secondary={display.secondary} tone={display.tone} />}
                labelClassName="leading-none"
                size={116}
                strokeWidth={10}
                value={progress}
              />
              <h3 className="mt-4 text-sm font-semibold text-foreground">{macro.label}</h3>
              <p className="mt-1 text-xs text-muted">Target {formatValue(target, macro.unit)}</p>
            </article>
          );
        })}
      </div>
    </section>
  );
}

type ToggleButtonProps = {
  isActive: boolean;
  label: string;
  onClick: () => void;
};

function ToggleButton({ isActive, label, onClick }: ToggleButtonProps) {
  return (
    <button
      aria-pressed={isActive}
      className={cn(
        'min-h-[44px] min-w-[44px] cursor-pointer rounded-full px-3 py-1.5 text-xs font-semibold transition-colors sm:px-4',
        isActive ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted hover:text-foreground',
      )}
      type="button"
      onClick={onClick}
    >
      {label}
    </button>
  );
}

type DisplayValueArgs = {
  actual: number;
  remaining: number;
  target: number;
  isOverTarget: boolean;
  unit: 'cal' | 'g';
  view: MacroView;
};

function getDisplayValue({ actual, remaining, target, isOverTarget, unit, view }: DisplayValueArgs) {
  if (isOverTarget) {
    return {
      primary: `+${formatValue(actual - target, unit)}`,
      secondary: 'over',
      tone: 'danger' as const,
    };
  }

  if (view === 'remaining') {
    return {
      primary: formatValue(remaining, unit),
      secondary: 'left',
      tone: 'default' as const,
    };
  }

  return {
    primary: formatValue(actual, unit),
    secondary: undefined,
    tone: 'default' as const,
  };
}

function getProgressValue({
  actual,
  target,
  isOverTarget,
  view,
}: {
  actual: number;
  target: number;
  isOverTarget: boolean;
  view: MacroView;
}) {
  if (isOverTarget) {
    return 100;
  }

  if (target <= 0) {
    return 0;
  }

  const eatenPercent = (actual / target) * 100;

  return view === 'eaten' ? eatenPercent : 100 - eatenPercent;
}

function formatValue(value: number, unit: 'cal' | 'g') {
  return `${Math.round(value)}${unit === 'cal' ? ' cal' : 'g'}`;
}

function RingValue({
  primary,
  secondary,
  tone,
}: {
  primary: string;
  secondary?: string;
  tone: 'default' | 'danger';
}) {
  return (
    <span className="flex max-w-full flex-col items-center gap-1 text-center">
      <span
        className={cn(
          'text-[13px] font-semibold tracking-tight text-foreground sm:text-sm',
          tone === 'danger' && 'text-destructive',
        )}
      >
        {primary}
      </span>
      {secondary ? (
        <span
          className={cn(
            'text-[10px] font-medium uppercase tracking-[0.18em] text-muted',
            tone === 'danger' && 'text-destructive',
          )}
        >
          {secondary}
        </span>
      ) : null}
    </span>
  );
}
