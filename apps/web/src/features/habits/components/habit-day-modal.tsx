import { useId, useMemo, useState } from 'react';
import type { Habit, HabitEntry } from '@pulse/shared';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useUpdateHabitEntry } from '@/features/habits/api/habits';
import { getToday, toDateKey } from '@/lib/date';
import { formatServing } from '@/lib/format-utils';
import { cn } from '@/lib/utils';

type HabitDayModalProps = {
  date: string;
  entry: HabitEntry | null;
  habit: Habit;
  isOpen: boolean;
  isScheduled: boolean;
  onOpenChange: (open: boolean) => void;
  status: 'completed' | 'missed' | 'not_scheduled';
};

type DurationDraft = {
  hours: string;
  minutes: string;
};

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'long',
  day: 'numeric',
  year: 'numeric',
});

function formatDateLabel(date: string) {
  return dateFormatter.format(new Date(`${date}T00:00:00`));
}

function normalizeUnit(unit: string | null) {
  return unit?.trim().toLowerCase() ?? '';
}

function isHourUnit(unit: string | null) {
  return ['h', 'hour', 'hours', 'hr', 'hrs'].includes(normalizeUnit(unit));
}

function isMinuteUnit(unit: string | null) {
  return ['m', 'min', 'mins', 'minute', 'minutes'].includes(normalizeUnit(unit));
}

function getValueLabel(habit: Habit, value: number | null | undefined) {
  if (typeof value !== 'number') {
    return 'No value recorded';
  }

  if (!habit.unit) {
    return formatServing(value);
  }

  if (isHourUnit(habit.unit)) {
    return `${formatServing(value)} h`;
  }

  return `${formatServing(value)} ${habit.unit}`;
}

function getDurationDraft(value: number | null | undefined, unit: string | null): DurationDraft {
  if (typeof value !== 'number') {
    return { hours: '', minutes: '' };
  }

  const totalMinutes = isMinuteUnit(unit) ? Math.round(value) : Math.round(value * 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  return {
    hours: `${hours}`,
    minutes: `${minutes}`.padStart(2, '0'),
  };
}

function getSavedDurationValue(draft: DurationDraft, unit: string | null) {
  const hasHours = draft.hours.trim().length > 0;
  const hasMinutes = draft.minutes.trim().length > 0;

  if (!hasHours && !hasMinutes) {
    return null;
  }

  const hours = Number(draft.hours || '0');
  const minutes = Number(draft.minutes || '0');
  if (
    !Number.isFinite(hours) ||
    !Number.isFinite(minutes) ||
    hours < 0 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return Number.NaN;
  }

  const totalMinutes = hours * 60 + minutes;
  if (isMinuteUnit(unit)) {
    return totalMinutes;
  }

  return Math.round((totalMinutes / 60) * 100) / 100;
}

function getStatusCopy({
  date,
  entry,
  habit,
  isScheduled,
  status,
}: Pick<HabitDayModalProps, 'date' | 'entry' | 'habit' | 'isScheduled' | 'status'>) {
  const todayKey = toDateKey(getToday());
  const isFutureDate = date > todayKey;

  if (isFutureDate) {
    return {
      description: 'Future dates are read-only until that day arrives.',
      title: 'Future',
    };
  }

  if (!isScheduled && !entry) {
    return {
      description: 'This habit was not scheduled for this day. You can still log a retroactive entry below.',
      title: 'Not scheduled',
    };
  }

  if (status === 'completed') {
    return {
      description:
        habit.trackingType === 'boolean'
          ? 'This day is marked complete.'
          : `Logged value: ${getValueLabel(habit, entry?.value)}`,
      title: 'Completed',
    };
  }

  if (status === 'missed') {
    return {
      description:
        habit.trackingType === 'boolean'
          ? 'This day is currently incomplete.'
          : entry?.value != null
            ? `Logged value: ${getValueLabel(habit, entry.value)}`
            : 'No value has been logged for this day yet.',
      title: 'Missed',
    };
  }

  return {
    description:
      entry?.value != null
        ? `Logged value: ${getValueLabel(habit, entry.value)}`
        : 'No value has been logged for this day yet.',
    title: 'Not tracked',
  };
}

export function HabitDayModal({
  date,
  entry,
  habit,
  isOpen,
  isScheduled,
  onOpenChange,
  status,
}: HabitDayModalProps) {
  const numberInputId = useId();
  const hoursInputId = useId();
  const minutesInputId = useId();
  const todayKey = useMemo(() => toDateKey(getToday()), []);
  const isFutureDate = date > todayKey;
  const isReadOnly = isFutureDate;
  const isReferential = habit.referenceSource !== null && habit.referenceSource !== undefined;
  const [booleanValue, setBooleanValue] = useState(entry?.completed ?? false);
  const [numericValue, setNumericValue] = useState(
    entry?.value != null ? `${entry.value}` : '',
  );
  const [durationValue, setDurationValue] = useState<DurationDraft>(() =>
    getDurationDraft(entry?.value, habit.unit),
  );
  const mutation = useUpdateHabitEntry({
    errorMessage: 'Failed to save habit entry. Please try again.',
    successMessage: 'Habit entry saved',
  });
  const statusCopy = getStatusCopy({ date, entry, habit, isScheduled, status });

  async function handleSave() {
    let completed = booleanValue;
    let value: number | undefined;

    if (habit.trackingType === 'numeric') {
      const parsedValue = Number(numericValue);
      if (numericValue.trim().length === 0 || !Number.isFinite(parsedValue)) {
        return;
      }

      value = parsedValue;
      completed = habit.target !== null ? parsedValue >= habit.target : parsedValue > 0;
    }

    if (habit.trackingType === 'time') {
      const parsedValue = getSavedDurationValue(durationValue, habit.unit);
      if (parsedValue === null || Number.isNaN(parsedValue)) {
        return;
      }

      value = parsedValue;
      completed = habit.target !== null ? parsedValue >= habit.target : parsedValue > 0;
    }

    try {
      await mutation.mutateAsync({
        id: entry?.id,
        habitId: habit.id,
        date,
        completed,
        ...(value === undefined ? {} : { value }),
        ...(isReferential ? { isOverride: true } : {}),
      });

      onOpenChange(false);
    } catch {
      // Toast messaging is handled by the mutation hook options.
    }
  }

  const isNumericSaveDisabled =
    habit.trackingType === 'numeric' &&
    (numericValue.trim().length === 0 || !Number.isFinite(Number(numericValue)));
  const savedDurationValue = getSavedDurationValue(durationValue, habit.unit);
  const isTimeSaveDisabled =
    habit.trackingType === 'time' &&
    (savedDurationValue === null || Number.isNaN(savedDurationValue));

  return (
    <Dialog onOpenChange={onOpenChange} open={isOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{habit.name}</DialogTitle>
          <DialogDescription>{formatDateLabel(date)}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-lg border border-border/70 bg-muted/35 p-3">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
              Status
            </p>
            <p
              className={cn(
                'mt-2 text-base font-semibold',
                status === 'completed'
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : status === 'missed'
                    ? 'text-rose-600 dark:text-rose-400'
                    : 'text-foreground',
              )}
            >
              {statusCopy.title}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">{statusCopy.description}</p>
          </div>

          {isReferential ? (
            <p className="text-xs text-muted-foreground">
              Saving here creates or updates a manual override for this habit on {formatDateLabel(date)}.
            </p>
          ) : null}

          {!isReadOnly ? (
            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                void handleSave();
              }}
            >
              {habit.trackingType === 'boolean' ? (
                <div className="space-y-2">
                  <Label>Completion</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      onClick={() => setBooleanValue(true)}
                      type="button"
                      variant={booleanValue ? 'default' : 'outline'}
                    >
                      Done
                    </Button>
                    <Button
                      onClick={() => setBooleanValue(false)}
                      type="button"
                      variant={!booleanValue ? 'default' : 'outline'}
                    >
                      Not done
                    </Button>
                  </div>
                </div>
              ) : null}

              {habit.trackingType === 'numeric' ? (
                <div className="space-y-2">
                  <Label htmlFor={numberInputId}>
                    {habit.unit ? `${habit.name} (${habit.unit})` : habit.name}
                  </Label>
                  <Input
                    id={numberInputId}
                    inputMode="decimal"
                    onChange={(event) => setNumericValue(event.target.value)}
                    placeholder={habit.target != null ? `Target: ${formatServing(habit.target)}` : 'Enter value'}
                    step="0.1"
                    type="number"
                    value={numericValue}
                  />
                </div>
              ) : null}

              {habit.trackingType === 'time' ? (
                <div className="space-y-2">
                  <Label>Duration</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground" htmlFor={hoursInputId}>
                        Hours
                      </Label>
                      <Input
                        id={hoursInputId}
                        inputMode="numeric"
                        min="0"
                        onChange={(event) =>
                          setDurationValue((currentValue) => ({
                            ...currentValue,
                            hours: event.target.value,
                          }))
                        }
                        placeholder="0"
                        type="number"
                        value={durationValue.hours}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground" htmlFor={minutesInputId}>
                        Minutes
                      </Label>
                      <Input
                        id={minutesInputId}
                        inputMode="numeric"
                        max="59"
                        min="0"
                        onChange={(event) =>
                          setDurationValue((currentValue) => ({
                            ...currentValue,
                            minutes: event.target.value,
                          }))
                        }
                        placeholder="00"
                        type="number"
                        value={durationValue.minutes}
                      />
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Stored in {habit.unit ?? 'hours'}.
                  </p>
                </div>
              ) : null}

              <DialogFooter className="pt-2">
                <Button onClick={() => onOpenChange(false)} type="button" variant="outline">
                  Cancel
                </Button>
                <Button
                  disabled={mutation.isPending || isNumericSaveDisabled || isTimeSaveDisabled}
                  type="submit"
                >
                  {mutation.isPending ? 'Saving...' : 'Save'}
                </Button>
              </DialogFooter>
            </form>
          ) : (
            <DialogFooter className="pt-0">
              <Button onClick={() => onOpenChange(false)} type="button" variant="outline">
                Close
              </Button>
            </DialogFooter>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
