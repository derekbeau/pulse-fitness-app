import { useEffect, useMemo } from 'react';
import { LayoutGrid, List } from 'lucide-react';

import { cn } from '@/lib/utils';

import { Button } from './button';

export type ViewToggleMode = 'card' | 'table';

type ViewToggleProps = {
  view: ViewToggleMode;
  onChange: (view: ViewToggleMode) => void;
  storageKey?: string;
  className?: string;
};

function isViewMode(value: string | null): value is ViewToggleMode {
  return value === 'card' || value === 'table';
}

export function ViewToggle({ view, onChange, storageKey, className }: ViewToggleProps) {
  const normalizedStorageKey = useMemo(() => storageKey?.trim() ?? '', [storageKey]);

  useEffect(() => {
    if (!normalizedStorageKey) {
      return;
    }

    try {
      const storedValue = window.localStorage.getItem(normalizedStorageKey);
      if (!isViewMode(storedValue) || storedValue === view) {
        return;
      }

      onChange(storedValue);
    } catch {
      return;
    }
  }, [normalizedStorageKey, onChange, view]);

  function selectView(nextView: ViewToggleMode) {
    if (nextView === view) {
      return;
    }

    if (normalizedStorageKey) {
      try {
        window.localStorage.setItem(normalizedStorageKey, nextView);
      } catch {
        // Ignore localStorage write failures.
      }
    }

    onChange(nextView);
  }

  return (
    <div
      aria-label="View mode"
      className={cn(
        'inline-flex min-h-[44px] w-fit items-center gap-1 rounded-full border border-border bg-card p-1',
        className,
      )}
      role="group"
    >
      <Button
        aria-label="Card view"
        aria-pressed={view === 'card'}
        className="h-8 w-8 rounded-full p-0"
        onClick={() => selectView('card')}
        size="sm"
        type="button"
        variant={view === 'card' ? 'default' : 'ghost'}
      >
        <LayoutGrid aria-hidden="true" className="size-4" />
      </Button>
      <Button
        aria-label="Table view"
        aria-pressed={view === 'table'}
        className="h-8 w-8 rounded-full p-0"
        onClick={() => selectView('table')}
        size="sm"
        type="button"
        variant={view === 'table' ? 'default' : 'ghost'}
      >
        <List aria-hidden="true" className="size-4" />
      </Button>
    </div>
  );
}
