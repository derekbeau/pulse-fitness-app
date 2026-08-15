import { Check } from 'lucide-react';

import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { cn } from '@/lib/utils';

export type AdaptiveSetupChoice = {
  badge?: string;
  description: string;
  label: string;
  meta?: string;
  value: string;
};

export function AdaptiveSetupChoiceGroup({
  choices,
  label,
  onValueChange,
  value,
}: {
  choices: readonly AdaptiveSetupChoice[];
  label: string;
  onValueChange: (value: string) => void;
  value: string;
}) {
  return (
    <RadioGroup
      aria-label={label}
      className="grid gap-2 sm:grid-cols-2"
      onValueChange={onValueChange}
      value={value}
    >
      {choices.map((choice) => {
        const checked = value === choice.value;
        const id = `coach-${label.toLowerCase().replaceAll(/[^a-z0-9]+/g, '-')}-${choice.value}`;
        return (
          <Label
            className={cn(
              'group grid min-h-24 cursor-pointer grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-xl border p-3.5 transition-all',
              checked
                ? 'border-primary bg-primary/8 shadow-sm ring-1 ring-primary/15'
                : 'border-border bg-background hover:border-primary/35 hover:bg-secondary/35',
            )}
            htmlFor={id}
            key={choice.value}
          >
            <RadioGroupItem className="mt-0.5" id={id} value={choice.value} />
            <span className="min-w-0 space-y-1">
              <span className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-foreground">{choice.label}</span>
                {choice.badge ? (
                  <span className="rounded-full bg-primary/12 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-primary">
                    {choice.badge}
                  </span>
                ) : null}
                {checked ? (
                  <Check aria-hidden="true" className="ml-auto size-4 text-primary" />
                ) : null}
              </span>
              <span className="block text-sm leading-snug text-muted-foreground">
                {choice.description}
              </span>
              {choice.meta ? (
                <span className="block text-xs font-medium text-foreground/80">{choice.meta}</span>
              ) : null}
            </span>
          </Label>
        );
      })}
    </RadioGroup>
  );
}

export function RecommendedRangeRail({
  allowedMaximum,
  allowedMinimum,
  recommendedMaximum,
  recommendedMinimum,
  selected,
}: {
  allowedMaximum: number;
  allowedMinimum: number;
  recommendedMaximum: number;
  recommendedMinimum: number;
  selected: number;
}) {
  const span = allowedMaximum - allowedMinimum;
  const recommendedLeft = span === 0 ? 0 : ((recommendedMinimum - allowedMinimum) / span) * 100;
  const recommendedWidth =
    span === 0 ? 100 : ((recommendedMaximum - recommendedMinimum) / span) * 100;
  const selectedLeft =
    span === 0 ? 50 : Math.min(100, Math.max(0, ((selected - allowedMinimum) / span) * 100));
  const rangeLabel =
    span === 0
      ? 'Maintenance uses a fixed zero percent weekly rate.'
      : `Allowed ${allowedMinimum.toFixed(2)} to ${allowedMaximum.toFixed(2)} percent per week. Recommended ${recommendedMinimum.toFixed(2)} to ${recommendedMaximum.toFixed(2)} percent. Selected ${selected.toFixed(2)} percent.`;

  return (
    <div aria-label={rangeLabel} className="space-y-2" role="img">
      <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
        <span>Allowed {allowedMinimum.toFixed(2)}%</span>
        <span className="font-medium text-foreground">
          Recommended {recommendedMinimum.toFixed(2)}–{recommendedMaximum.toFixed(2)}%
        </span>
        <span>{allowedMaximum.toFixed(2)}%</span>
      </div>
      <div className="relative h-3 rounded-full bg-secondary">
        <span
          aria-hidden="true"
          className="absolute inset-y-0 rounded-full border border-primary/35 bg-primary/20"
          style={{ left: `${recommendedLeft}%`, width: `${recommendedWidth}%` }}
        />
        <span
          aria-hidden="true"
          className="absolute top-1/2 size-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background bg-primary shadow-sm ring-1 ring-primary/30"
          style={{ left: `${selectedLeft}%` }}
        />
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">
        The outlined band is Pulse’s recommended range. Choices elsewhere on the rail remain
        available and receive a caution.
      </p>
    </div>
  );
}
