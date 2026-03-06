import { useState } from 'react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ProgressRing } from '@/components/ui/progress-ring';
import { Button } from '@/components/ui/button';
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
  return `${Number.isInteger(value) ? value : value.toFixed(1)}g`;
}

export function MacroRings({ actual, targets }: MacroRingsProps) {
  const [mode, setMode] = useState<'eaten' | 'remaining'>('eaten');

  return (
    <Card className="border-transparent bg-[var(--color-accent-cream)] text-slate-950 shadow-sm">
      <CardHeader className="gap-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <CardTitle aria-level={2} className="text-2xl font-semibold text-slate-950" role="heading">
              Macro rings
            </CardTitle>
            <CardDescription className="text-sm text-slate-700">
              Toggle between what you&apos;ve eaten and what remains to hit today&apos;s targets.
            </CardDescription>
          </div>
          <div className="inline-flex rounded-full bg-slate-950/10 p-1">
            <Button
              type="button"
              size="sm"
              variant={mode === 'eaten' ? 'secondary' : 'ghost'}
              aria-pressed={mode === 'eaten'}
              className={cn(
                'rounded-full px-4 text-slate-950',
                mode === 'eaten' && 'bg-white/80 hover:bg-white/80',
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
                'rounded-full px-4 text-slate-950',
                mode === 'remaining' && 'bg-white/80 hover:bg-white/80',
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
              key={macro.key}
              className="grid gap-3 rounded-2xl bg-white/75 p-4 text-slate-950 shadow-sm"
            >
              <div className="space-y-1">
                <h3 className="text-lg font-semibold text-slate-950">{macro.label}</h3>
                <p
                  className={cn('text-sm font-medium text-slate-700', isOverTarget && 'text-red-600')}
                >
                  {formatMacroValue(displayedValue)} {mode}
                </p>
              </div>
              <ProgressRing
                value={progressValue}
                label={formatMacroValue(displayedValue)}
                color={isOverTarget ? '#dc2626' : macro.color}
                className={cn('justify-self-start text-slate-950', isOverTarget && 'text-red-600')}
              />
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-700">
                Target {formatMacroValue(target)}
              </p>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
