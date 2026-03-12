import { useState } from 'react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ProgressRing } from '@/components/ui/progress-ring';
import { Button } from '@/components/ui/button';
import { accentCardStyles } from '@/lib/accent-card-styles';
import { formatGrams } from '@/lib/format-utils';
import { cn } from '@/lib/utils';

type MacroKey = 'protein' | 'carbs' | 'fat';

type MacroTotals = Record<MacroKey, number>;

type MacroRingsProps = {
  actual: MacroTotals;
  targets: MacroTotals;
};

const macroConfig: Array<{
  color: string;
  key: MacroKey;
  label: string;
}> = [
  { key: 'protein', label: 'Protein', color: 'var(--color-primary)' },
  { key: 'carbs', label: 'Carbs', color: 'var(--color-accent-pink)' },
  { key: 'fat', label: 'Fat', color: 'var(--color-accent-mint)' },
];

function formatMacroValue(value: number) {
  return formatGrams(value);
}

export function MacroRings({ actual, targets }: MacroRingsProps) {
  const [mode, setMode] = useState<'eaten' | 'remaining'>('eaten');

  return (
    <Card className={accentCardStyles.cream}>
      <CardHeader className="gap-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <CardTitle aria-level={2} className="text-2xl font-semibold" role="heading">
              Macro rings
            </CardTitle>
            <CardDescription className="text-sm opacity-70 dark:text-muted dark:opacity-100">
              Toggle between what you&apos;ve eaten and what remains to hit today&apos;s targets.
            </CardDescription>
          </div>
          <div className="inline-flex rounded-full bg-black/10 p-1 dark:bg-secondary">
            <Button
              type="button"
              size="sm"
              variant={mode === 'eaten' ? 'secondary' : 'ghost'}
              aria-pressed={mode === 'eaten'}
              className={cn(
                'rounded-full px-4',
                mode === 'eaten' &&
                  'bg-white/80 hover:bg-white/80 dark:bg-primary dark:text-primary-foreground dark:hover:bg-primary/90',
              )}
              onClick={() => setMode('eaten')}
            >
              Eaten
            </Button>
            <Button
              type="button"
              size="sm"
              variant={mode === 'remaining' ? 'secondary' : 'ghost'}
              aria-pressed={mode === 'remaining'}
              className={cn(
                'rounded-full px-4',
                mode === 'remaining' &&
                  'bg-white/80 hover:bg-white/80 dark:bg-primary dark:text-primary-foreground dark:hover:bg-primary/90',
              )}
              onClick={() => setMode('remaining')}
            >
              Remaining
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-3">
        {macroConfig.map((macro) => {
          const target = targets[macro.key];
          const eaten = actual[macro.key];
          const remaining = target - eaten;
          const displayedValue = mode === 'eaten' ? eaten : remaining;
          const progressValue = target > 0 ? (eaten / target) * 100 : 0;
          const isOverTarget = eaten > target;

          return (
            <div
              data-testid={`macro-card-${macro.key}`}
              key={macro.key}
              className="grid gap-3 rounded-2xl bg-white/75 p-4 shadow-sm dark:border dark:border-border dark:bg-secondary/60"
            >
              <div className="space-y-1">
                <h3 className="text-lg font-semibold">{macro.label}</h3>
                <p
                  className={cn(
                    'text-sm font-medium opacity-70 dark:text-muted dark:opacity-100',
                    isOverTarget && 'text-red-600 opacity-100 dark:text-red-400',
                  )}
                >
                  {formatMacroValue(displayedValue)} {mode}
                </p>
              </div>
              <ProgressRing
                value={progressValue}
                label={formatMacroValue(displayedValue)}
                color={isOverTarget ? '#dc2626' : macro.color}
                className={cn(
                  'justify-self-start',
                  isOverTarget && 'text-red-600 dark:text-red-400',
                )}
              />
              <p className="text-xs font-medium uppercase tracking-[0.18em] opacity-70 dark:text-muted dark:opacity-100">
                Target {formatMacroValue(target)}
              </p>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
