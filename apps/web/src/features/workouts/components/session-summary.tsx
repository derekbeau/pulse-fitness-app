import { CheckCircle2, Clock3, Dumbbell, ListChecks } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

type SessionSummaryProps = {
  className?: string;
  duration: string;
  exercisesCompleted: number;
  onDone: () => void;
  totalReps: number;
  totalSets: number;
};

export function SessionSummary({
  className,
  duration,
  exercisesCompleted,
  onDone,
  totalReps,
  totalSets,
}: SessionSummaryProps) {
  return (
    <Card
      className={cn(
        'overflow-hidden border-transparent py-0 text-[var(--color-on-accent)] shadow-lg',
        className,
      )}
      style={{ backgroundColor: 'var(--color-accent-mint)' }}
    >
      <CardContent className="space-y-5 px-5 py-6 sm:px-6">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 rounded-full border border-[var(--color-on-accent)]/15 bg-white/40 px-3 py-1 text-xs font-semibold tracking-[0.18em] uppercase">
            <CheckCircle2 aria-hidden="true" className="size-3.5" />
            Session complete
          </div>
          <div className="space-y-1">
            <h1 className="text-3xl font-semibold tracking-tight">Workout summary</h1>
            <p className="max-w-2xl text-sm text-[var(--color-on-accent)]/75">
              Logged, reflected, and ready to head back to the workouts overview.
            </p>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <SummaryStat icon={Dumbbell} label="Exercises completed" value={`${exercisesCompleted}`} />
          <SummaryStat icon={ListChecks} label="Sets completed" value={`${totalSets}`} />
          <SummaryStat icon={CheckCircle2} label="Total reps" value={`${totalReps}`} />
          <SummaryStat icon={Clock3} label="Duration" value={duration} />
        </div>

        <Button
          className="w-full border-[var(--color-on-accent)]/20 bg-white/60 text-[var(--color-on-accent)] hover:bg-white/75 sm:w-auto"
          onClick={onDone}
          type="button"
          variant="secondary"
        >
          Done
        </Button>
      </CardContent>
    </Card>
  );
}

function SummaryStat({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof CheckCircle2;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-[var(--color-on-accent)]/15 bg-white/40 p-4">
      <div className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.18em] text-[var(--color-on-accent)]/65 uppercase">
        <Icon aria-hidden="true" className="size-3.5" />
        <span>{label}</span>
      </div>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
    </div>
  );
}
