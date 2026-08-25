import { type KeyboardEvent } from 'react';
import { useSearchParams } from 'react-router';

import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

import { FoodAnalyticsWorkspace } from './food-analytics-workspace';
import { FoodList } from './food-list';

const MODES = ['library', 'analytics'] as const;
type FoodMode = (typeof MODES)[number];

const isFoodMode = (value: string | null): value is FoodMode =>
  value !== null && MODES.includes(value as FoodMode);

export function FoodLibraryWorkspace({
  referenceDate,
  timeZone,
}: {
  referenceDate: string | null;
  timeZone: string | null;
}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const mode: FoodMode = isFoodMode(searchParams.get('foodMode'))
    ? (searchParams.get('foodMode') as FoodMode)
    : 'library';

  const setMode = (nextMode: FoodMode) => {
    const next = new URLSearchParams(searchParams);
    next.set('foodMode', nextMode);
    setSearchParams(next);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const currentIndex = MODES.indexOf(mode);
    const nextIndex =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? MODES.length - 1
          : (currentIndex + (event.key === 'ArrowRight' ? 1 : -1) + MODES.length) % MODES.length;
    const nextMode = MODES[nextIndex];
    if (!nextMode) return;
    setMode(nextMode);
    requestAnimationFrame(() => document.getElementById(`food-mode-${nextMode}`)?.focus());
  };

  return (
    <div className="space-y-4">
      <div
        aria-label="Food library views"
        className="flex w-fit rounded-full border border-border bg-card p-1"
        onKeyDown={handleKeyDown}
        role="tablist"
      >
        {MODES.map((value) => (
          <Button
            aria-controls="food-mode-panel"
            aria-selected={mode === value}
            className="min-h-11 rounded-full px-4"
            id={`food-mode-${value}`}
            key={value}
            onClick={() => setMode(value)}
            role="tab"
            tabIndex={mode === value ? 0 : -1}
            type="button"
            variant={mode === value ? 'default' : 'ghost'}
          >
            {value === 'library' ? 'Library' : 'Analytics'}
          </Button>
        ))}
      </div>

      <div aria-labelledby={`food-mode-${mode}`} id="food-mode-panel" role="tabpanel">
        {mode === 'library' ? (
          <FoodList />
        ) : referenceDate && timeZone ? (
          <FoodAnalyticsWorkspace referenceDate={referenceDate} timeZone={timeZone} />
        ) : (
          <section aria-label="Loading food analytics" role="status">
            <Skeleton className="h-80 rounded-3xl bg-muted/70" />
          </section>
        )}
      </div>
    </div>
  );
}
