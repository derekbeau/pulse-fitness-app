import { useId } from 'react';
import type { ExerciseTrackingType } from '@pulse/shared';
import { Info } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

import {
  formatEffort,
  isResistanceEffort,
  type EffortFacts,
  type EffortPresentation,
} from '../lib/effort';

type EffortEntry = { label: string; effort: EffortPresentation };

function EffortDisclosure({
  entries,
  label,
  children,
  className,
}: {
  entries: EffortEntry[];
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  const titleId = useId();
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          aria-label={`Effort details: ${label}`}
          className={cn('min-h-11 min-w-11 whitespace-normal text-left text-xs', className)}
          size="sm"
          type="button"
          variant="ghost"
        >
          {children}
          <Info aria-hidden="true" className="size-3.5 shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        aria-labelledby={titleId}
        className="max-h-[min(24rem,70dvh)] w-80 max-w-[calc(100vw-2rem)] overflow-y-auto break-words"
        collisionPadding={16}
      >
        <PopoverTitle id={titleId}>Effort details</PopoverTitle>
        <ul className="mt-3 space-y-3 text-sm">
          {entries.map(({ label: entryLabel, effort }, index) => (
            <li key={`${entryLabel}-${index}`}>
              <p className="font-medium">
                {entryLabel}
                {effort.displayText ? ` · ${effort.displayText}` : ''}
              </p>
              <p className="mt-1 text-muted-foreground">{effort.detail}</p>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

export function EffortValue({
  effort,
  label,
  className,
}: {
  effort: EffortPresentation;
  label: string;
  className?: string;
}) {
  if (!effort.displayText) return null;
  return (
    <EffortDisclosure className={className} entries={[{ label, effort }]} label={label}>
      <span>{effort.displayText}</span>
    </EffortDisclosure>
  );
}

/** One disclosure per compact history entry, including each set's original facts. */
export function HistoryEffortDetails({
  sets,
  trackingType,
  label,
  className,
}: {
  sets: ReadonlyArray<EffortFacts & { setNumber?: number | null }>;
  trackingType: ExerciseTrackingType;
  label: string;
  className?: string;
}) {
  if (!isResistanceEffort(trackingType)) return null;
  const entries = sets.map((set, index) => ({
    label: `Set ${set.setNumber ?? index + 1}`,
    effort: formatEffort(set, trackingType),
  }));
  if (!entries.some(({ effort }) => effort.displayText)) return null;
  return (
    <EffortDisclosure className={className} entries={entries} label={label}>
      Effort details
    </EffortDisclosure>
  );
}
