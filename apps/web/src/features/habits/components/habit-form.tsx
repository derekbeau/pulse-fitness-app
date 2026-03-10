import { useState, type FormEvent } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  habitEmojiOptions,
  trackingSurfaceClasses,
  trackingTypeLabels,
} from '@/features/habits/lib/habit-constants';
import type { HabitConfig, HabitConfigDraft, HabitTrackingType } from '@/features/habits/types';
import { cn } from '@/lib/utils';

type HabitFormState = {
  name: string;
  emoji: string;
  trackingType: HabitTrackingType;
  target: string;
  unit: string;
};

type HabitFormErrors = Partial<Record<'name' | 'target' | 'unit', string>>;

type HabitFormProps = {
  initialHabit?: HabitConfig | null;
  onCancel: () => void;
  onSave: (values: HabitConfigDraft) => void;
};

function createFormState(initialHabit?: HabitConfig | null): HabitFormState {
  return {
    name: initialHabit?.name ?? '',
    emoji: initialHabit?.emoji ?? habitEmojiOptions[0],
    trackingType: initialHabit?.trackingType ?? 'boolean',
    target: initialHabit?.target?.toString() ?? '',
    unit: initialHabit?.unit ?? '',
  };
}

export function HabitForm({ initialHabit, onCancel, onSave }: HabitFormProps) {
  const [formState, setFormState] = useState<HabitFormState>(() => createFormState(initialHabit));
  const [errors, setErrors] = useState<HabitFormErrors>({});

  const requiresGoal = formState.trackingType !== 'boolean';
  const modeLabel = initialHabit ? 'Edit habit' : 'Add habit';

  function updateField<Key extends keyof HabitFormState>(key: Key, value: HabitFormState[Key]) {
    setFormState((current) => ({ ...current, [key]: value }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const nextErrors: HabitFormErrors = {};
    const trimmedName = formState.name.trim();
    const trimmedUnit = formState.unit.trim();
    const parsedTarget = Number(formState.target);

    if (trimmedName.length === 0) {
      nextErrors.name = 'Give this habit a name.';
    }

    if (requiresGoal) {
      if (!Number.isFinite(parsedTarget) || parsedTarget <= 0) {
        nextErrors.target = 'Enter a target greater than 0.';
      }

      if (trimmedUnit.length === 0) {
        nextErrors.unit = 'Add the unit you want to track.';
      }
    }

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);

      return;
    }

    onSave({
      name: trimmedName,
      emoji: formState.emoji,
      trackingType: formState.trackingType,
      target: requiresGoal ? parsedTarget : null,
      unit: requiresGoal ? trimmedUnit : null,
    });
  }

  return (
    <Card className="gap-4 border-border/70 shadow-sm">
      <CardHeader className="gap-2">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="text-xl font-semibold text-foreground">{modeLabel}</CardTitle>
            <CardDescription>
              Pick how the habit should be tracked, then save it to your account.
            </CardDescription>
          </div>
          <div
            className={cn(
              'inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-semibold text-slate-950',
              trackingSurfaceClasses[formState.trackingType],
            )}
          >
            <span aria-hidden="true">{formState.emoji}</span>
            <span>{trackingTypeLabels[formState.trackingType]}</span>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        <form className="space-y-5" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground" htmlFor="habit-name">
              Habit name
            </label>
            <Input
              id="habit-name"
              name="name"
              autoComplete="off"
              className={cn(errors.name && 'border-destructive')}
              onChange={(event) => updateField('name', event.target.value)}
              placeholder="Morning walk"
              value={formState.name}
            />
            {errors.name ? <p className="text-sm text-destructive">{errors.name}</p> : null}
          </div>

          <div className="space-y-3">
            <div className="space-y-1">
              <p className="text-sm font-medium text-foreground">Emoji</p>
              <p className="text-sm text-muted">Choose a quick visual cue for the list.</p>
            </div>

            <div
              aria-label="Emoji picker"
              className="grid grid-cols-5 gap-2 sm:grid-cols-6"
              role="group"
            >
              {habitEmojiOptions.map((emoji) => {
                const isSelected = formState.emoji === emoji;

                return (
                  <button
                    key={emoji}
                    aria-label={`Choose ${emoji}`}
                    aria-pressed={isSelected}
                    className={cn(
                      'flex aspect-square cursor-pointer items-center justify-center rounded-2xl border text-2xl transition-colors',
                      isSelected
                        ? 'border-slate-950 bg-slate-950 text-white shadow-sm'
                        : 'border-border bg-background hover:border-slate-950/30 hover:bg-accent',
                    )}
                    onClick={() => updateField('emoji', emoji)}
                    type="button"
                  >
                    <span aria-hidden="true">{emoji}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground" htmlFor="tracking-type">
              Tracking type
            </label>
            <select
              id="tracking-type"
              className="flex min-h-[44px] w-full cursor-pointer rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30"
              onChange={(event) =>
                updateField('trackingType', event.target.value as HabitTrackingType)
              }
              value={formState.trackingType}
            >
              <option value="boolean">Boolean</option>
              <option value="numeric">Numeric</option>
              <option value="time">Time</option>
            </select>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground" htmlFor="habit-target">
                Target
              </label>
              <Input
                id="habit-target"
                min="0"
                name="target"
                step="any"
                type="number"
                className={cn(errors.target && 'border-destructive')}
                disabled={!requiresGoal}
                onChange={(event) => updateField('target', event.target.value)}
                placeholder="8"
                value={formState.target}
              />
              {errors.target ? <p className="text-sm text-destructive">{errors.target}</p> : null}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground" htmlFor="habit-unit">
                Unit
              </label>
              <Input
                id="habit-unit"
                name="unit"
                className={cn(errors.unit && 'border-destructive')}
                disabled={!requiresGoal}
                onChange={(event) => updateField('unit', event.target.value)}
                placeholder="glasses"
                value={formState.unit}
              />
              {errors.unit ? <p className="text-sm text-destructive">{errors.unit}</p> : null}
            </div>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
            <Button className="sm:order-2" type="submit">
              Save
            </Button>
            <Button className="sm:order-1" onClick={onCancel} type="button" variant="ghost">
              Cancel
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
