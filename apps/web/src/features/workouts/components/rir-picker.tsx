import { useId, useRef, useState, type KeyboardEvent } from 'react';

import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';

const RIR_OPTIONS = [null, 0, 1, 2, 3, 4, 5] as const;

function formatRir(value: number | null | undefined) {
  if (value === null || value === undefined) return 'RIR —';
  return value === 5 ? '5+ RIR' : `${value} RIR`;
}

export function RirPicker({
  disabled = false,
  onChange,
  setNumber,
  value,
}: {
  disabled?: boolean;
  onChange: (value: number | null) => void;
  setNumber: number;
  value: number | null;
}) {
  const [open, setOpen] = useState(false);
  const descriptionId = useId();
  const titleId = useId();
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  const choose = (nextValue: number | null, close = true) => {
    onChange(nextValue);
    if (close) setOpen(false);
  };

  const handleGroupKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const currentIndex = RIR_OPTIONS.findIndex((option) => option === value);
    let nextIndex: number | null = null;
    if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
      nextIndex = (Math.max(currentIndex, 0) + 1) % RIR_OPTIONS.length;
    } else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
      nextIndex = (currentIndex <= 0 ? RIR_OPTIONS.length : currentIndex) - 1;
    } else if (event.key === 'Home') {
      nextIndex = 0;
    } else if (event.key === 'End') {
      nextIndex = RIR_OPTIONS.length - 1;
    }
    if (nextIndex === null) return;
    event.preventDefault();
    choose(RIR_OPTIONS[nextIndex] ?? null, false);
    optionRefs.current[nextIndex]?.focus();
  };

  const stateText =
    value === null
      ? 'No repetitions in reserve logged'
      : value === 5
        ? '5 or more repetitions in reserve'
        : `${value} repetitions in reserve`;

  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger asChild>
        <Button
          aria-label={`RIR for set ${setNumber}: ${stateText}`}
          className="h-11 min-w-[4.75rem] rounded-lg px-2.5 text-xs font-semibold"
          disabled={disabled}
          ref={triggerRef}
          type="button"
          variant="outline"
        >
          {formatRir(value)}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        aria-describedby={descriptionId}
        aria-labelledby={titleId}
        className="w-[min(19rem,calc(100vw-1rem))] space-y-3 p-3"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          triggerRef.current?.focus();
        }}
      >
        <PopoverHeader>
          <PopoverTitle id={titleId}>{`Repetitions in reserve · Set ${setNumber}`}</PopoverTitle>
          <PopoverDescription id={descriptionId}>
            0 = no reps left · 5+ = five or more reps left
          </PopoverDescription>
        </PopoverHeader>
        <div
          aria-label={`RIR selection for set ${setNumber}`}
          className="grid grid-cols-4 gap-2"
          onKeyDown={handleGroupKeyDown}
          role="radiogroup"
        >
          {RIR_OPTIONS.map((option, index) => {
            const selected = option === value;
            const label = option === null ? 'Clear' : option === 5 ? '5+' : `${option}`;
            const accessibleLabel =
              option === null
                ? 'Clear repetitions in reserve'
                : option === 5
                  ? '5 or more repetitions in reserve'
                  : `${option} repetitions in reserve`;
            return (
              <button
                aria-checked={selected}
                aria-label={accessibleLabel}
                className={cn(
                  'min-h-12 min-w-12 rounded-lg border px-2 text-sm font-semibold outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50',
                  selected
                    ? 'border-[var(--color-accent-mint)] bg-[var(--color-accent-mint)] text-[var(--color-on-accent)]'
                    : 'border-border bg-background text-foreground hover:bg-secondary',
                )}
                key={option ?? 'clear'}
                onClick={() => choose(option)}
                ref={(element) => {
                  optionRefs.current[index] = element;
                }}
                role="radio"
                tabIndex={selected || (value === null && option === null) ? 0 : -1}
                type="button"
              >
                {label}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
