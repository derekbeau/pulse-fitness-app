import { useState } from 'react';
import type { DailyEnergyDataState, ProteinFloorProgress } from '@pulse/shared';

import { ProgressRing } from '@/components/ui/progress-ring';
import { formatCalories, formatGrams } from '@/lib/format-utils';
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
  proteinFloor?: ProteinFloorProgress;
  selectedDate: string;
  dataState?: DailyEnergyDataState;
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
  { key: 'protein', label: 'Protein', color: 'var(--protein-progress-stroke)', unit: 'g' },
  { key: 'carbs', label: 'Carbs', color: 'var(--color-primary)', unit: 'g' },
  { key: 'fat', label: 'Fat', color: 'var(--color-accent-pink)', unit: 'g' },
];

const OVER_TARGET_COLOR = 'var(--color-destructive)';

export function NutritionMacroRings({
  actuals,
  targets,
  proteinFloor,
  selectedDate,
  dataState,
}: NutritionMacroRingsProps) {
  const [view, setView] = useState<MacroView>('eaten');

  return (
    <section aria-labelledby="nutrition-macro-rings-heading" className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 id="nutrition-macro-rings-heading" className="text-base font-semibold text-foreground">
          Macro progress
        </h2>

        <div
          aria-label="Macro progress view"
          className="inline-flex rounded-full border border-border/70 bg-card/80 p-0.5 shadow-sm"
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

      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        {MACRO_RING_CONFIG.map((macro) => {
          if (macro.key === 'protein') {
            const presentation = getProteinPresentation({
              dataState,
              facts: proteinFloor,
              selectedDate,
              view,
            });

            return (
              <article
                key={macro.key}
                className="flex min-w-0 flex-col items-center justify-center rounded-xl border border-border/70 bg-card/90 px-2 py-3 text-center shadow-sm sm:px-3"
              >
                <ProgressRing
                  aria-label={presentation.accessibleText}
                  aria-valuetext={presentation.statusText}
                  color={macro.color}
                  label={
                    <RingValue
                      primary={presentation.primary}
                      secondary={presentation.secondary}
                      tone="default"
                    />
                  }
                  labelClassName="leading-none"
                  className="w-[72px] sm:w-[88px] md:w-[100px]"
                  size={100}
                  strokeWidth={8}
                  value={presentation.progress}
                />
                <h3 className="mt-2 text-xs font-semibold text-foreground sm:text-sm">Protein</h3>
                <p className="mt-1 text-[11px] font-semibold leading-tight text-foreground sm:text-xs">
                  {presentation.statusText}
                </p>
                <p className="mt-0.5 text-[10px] leading-tight text-muted sm:text-xs">
                  {presentation.supportingText}
                </p>
                {presentation.evidenceText ? (
                  <p className="mt-1 text-[10px] leading-tight text-muted">
                    {presentation.evidenceText}
                  </p>
                ) : null}
              </article>
            );
          }

          const actual = actuals[macro.key];
          const target = targets[macro.key];
          const isOverTarget = target <= 0 ? actual > 0 : actual > target;
          const remaining = Math.max(target - actual, 0);
          const progress = getProgressValue({ actual, target, isOverTarget, view });
          const display = getDisplayValue({
            actual,
            remaining,
            target,
            isOverTarget,
            unit: macro.unit,
            view,
          });

          return (
            <article
              key={macro.key}
              className="flex flex-col items-center justify-center rounded-xl border border-border/70 bg-card/90 px-3 py-3 text-center shadow-sm"
            >
              <ProgressRing
                aria-label={`${macro.label} ${view} progress`}
                color={isOverTarget ? OVER_TARGET_COLOR : macro.color}
                label={
                  <RingValue
                    primary={display.primary}
                    secondary={display.secondary}
                    tone={display.tone}
                  />
                }
                labelClassName="leading-none"
                className="w-[72px] sm:w-[88px] md:w-[100px]"
                size={100}
                strokeWidth={8}
                value={progress}
              />
              <h3 className="mt-2 text-xs font-semibold text-foreground sm:text-sm">
                {macro.label}
              </h3>
              <p className="mt-0.5 text-[10px] text-muted sm:text-xs">
                Target {formatValue(target, macro.unit)}
              </p>
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
        'min-h-11 min-w-11 cursor-pointer rounded-full px-3 py-2 text-xs font-semibold transition-colors',
        isActive
          ? 'bg-primary text-primary-foreground shadow-sm'
          : 'text-muted hover:text-foreground',
      )}
      type="button"
      onClick={onClick}
    >
      {label}
    </button>
  );
}

function formatProteinDistance(value: number) {
  if (value > 0 && Math.round(value) === 0) return '<1g';
  return formatGrams(value);
}

function getProteinEvidenceText(
  dataState: DailyEnergyDataState | undefined,
  facts: ProteinFloorProgress | undefined,
) {
  if (dataState === 'future') return 'Future dates do not show progress';
  return facts && facts.state !== 'unavailable' && !facts.isFinal
    ? 'Based on food logged so far'
    : undefined;
}

function getProteinPresentation({
  dataState,
  facts,
  selectedDate,
  view,
}: {
  dataState: DailyEnergyDataState | undefined;
  facts: ProteinFloorProgress | undefined;
  selectedDate: string;
  view: MacroView;
}) {
  const evidenceText = getProteinEvidenceText(dataState, facts);
  if (!facts || facts.state === 'unavailable' || dataState === 'future') {
    const actualText = facts?.actualProteinGrams === null ? null : facts?.actualProteinGrams;
    return {
      accessibleText: `${selectedDate}: Protein minimum unavailable${actualText == null ? '' : `; ${formatGrams(actualText)} logged`}`,
      evidenceText,
      primary: actualText == null ? '—' : formatGrams(actualText),
      progress: 0,
      secondary: actualText == null ? undefined : 'logged',
      statusText: 'Protein minimum unavailable',
      supportingText:
        actualText == null ? 'No protein total available' : `${formatGrams(actualText)} logged`,
    };
  }

  const actual = facts.actualProteinGrams as number;
  const floor = facts.proteinFloorGrams as number;
  const remaining = facts.remainingToFloorGrams as number;
  const above = facts.amountAboveFloorGrams as number;
  const statusText =
    facts.state === 'below_floor'
      ? `${formatProteinDistance(remaining)} to minimum`
      : 'Minimum met';
  const aboveText = above > 0 ? ` · ${formatProteinDistance(above)} above minimum` : '';

  return {
    accessibleText: `${selectedDate}: ${formatGrams(actual)} protein logged; minimum ${formatGrams(floor)}; ${statusText}${aboveText}${evidenceText ? `; ${evidenceText}` : ''}`,
    evidenceText,
    primary:
      view === 'remaining'
        ? facts.state === 'below_floor'
          ? formatProteinDistance(remaining)
          : 'Met'
        : formatGrams(actual),
    progress: Math.min(100, Math.max(0, (actual / floor) * 100)),
    secondary:
      view === 'remaining' ? (facts.state === 'below_floor' ? 'to minimum' : 'minimum') : 'logged',
    statusText,
    supportingText:
      view === 'remaining'
        ? `${formatGrams(actual)} logged · Minimum ${formatGrams(floor)}`
        : `Minimum ${formatGrams(floor)}${aboveText}`,
  };
}

type DisplayValueArgs = {
  actual: number;
  remaining: number;
  target: number;
  isOverTarget: boolean;
  unit: 'cal' | 'g';
  view: MacroView;
};

function getDisplayValue({
  actual,
  remaining,
  target,
  isOverTarget,
  unit,
  view,
}: DisplayValueArgs) {
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
  return unit === 'cal' ? formatCalories(value, 'cal') : formatGrams(value);
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
