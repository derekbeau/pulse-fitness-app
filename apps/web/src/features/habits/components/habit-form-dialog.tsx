import { zodResolver } from '@hookform/resolvers/zod';
import { createHabitInputSchema, type CreateHabitInput, type Habit } from '@pulse/shared';
import { useEffect, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';

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
import { useCreateHabit, useUpdateHabit } from '@/features/habits/api/habits';
import {
  habitEmojiOptions,
  weekdayLabels,
  trackingSurfaceClasses,
  trackingTypeLabels,
} from '@/features/habits/lib/habit-constants';
import { cn } from '@/lib/utils';

const trackingTypeOptions = [
  { label: 'Check off', value: 'boolean' },
  { label: 'Count', value: 'numeric' },
  { label: 'Time', value: 'time' },
] as const;

const frequencyOptions = [
  { label: 'Every day', value: 'daily' },
  { label: 'X times per week', value: 'weekly' },
  { label: 'Specific days', value: 'specific_days' },
] as const;

type HabitFormDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  habit?: Habit;
};

function createDefaultValues(habit?: Habit): CreateHabitInput {
  return {
    emoji: habit?.emoji ?? habitEmojiOptions[0],
    name: habit?.name ?? '',
    description: habit?.description ?? null,
    target: habit?.target ?? null,
    trackingType: habit?.trackingType ?? 'boolean',
    unit: habit?.unit ?? null,
    frequency: habit?.frequency ?? 'daily',
    frequencyTarget: habit?.frequencyTarget ?? null,
    scheduledDays: habit?.scheduledDays ?? null,
    pausedUntil: habit?.pausedUntil ?? null,
  };
}

export function HabitFormDialog({ open, onOpenChange, habit }: HabitFormDialogProps) {
  const [errorMessage, setErrorMessage] = useState('');

  const createHabitMutation = useCreateHabit();
  const updateHabitMutation = useUpdateHabit();
  const isEditMode = habit != null;
  const isSaving = isEditMode ? updateHabitMutation.isPending : createHabitMutation.isPending;

  const {
    clearErrors,
    control,
    formState: { errors },
    handleSubmit,
    register,
    reset,
    setValue,
  } = useForm<CreateHabitInput>({
    defaultValues: createDefaultValues(habit),
    resolver: zodResolver(createHabitInputSchema),
  });

  const selectedEmoji = useWatch({ control, name: 'emoji' }) ?? habitEmojiOptions[0];
  const trackingType = useWatch({ control, name: 'trackingType' }) ?? 'boolean';
  const frequency = useWatch({ control, name: 'frequency' }) ?? 'daily';
  const showTargetFields = trackingType !== 'boolean';
  const showWeeklyTarget = frequency === 'weekly';
  const showSpecificDays = frequency === 'specific_days';
  const unitPlaceholder = trackingType === 'time' ? 'hours' : 'glasses';

  useEffect(() => {
    if (!open) {
      return;
    }

    reset(createDefaultValues(habit));
  }, [habit, open, reset]);

  useEffect(() => {
    if (trackingType !== 'boolean') {
      return;
    }

    clearErrors(['target', 'unit']);
    setValue('target', null, { shouldDirty: true, shouldValidate: true });
    setValue('unit', null, { shouldDirty: true, shouldValidate: true });
  }, [clearErrors, setValue, trackingType]);

  useEffect(() => {
    if (frequency === 'daily') {
      clearErrors(['frequencyTarget', 'scheduledDays']);
      setValue('frequencyTarget', null, { shouldDirty: true, shouldValidate: true });
      setValue('scheduledDays', null, { shouldDirty: true, shouldValidate: true });
      return;
    }

    if (frequency === 'weekly') {
      clearErrors('scheduledDays');
      setValue('scheduledDays', null, { shouldDirty: true, shouldValidate: true });
      return;
    }

    clearErrors('frequencyTarget');
    setValue('frequencyTarget', null, { shouldDirty: true, shouldValidate: true });
  }, [clearErrors, frequency, setValue]);

  async function onSubmit(values: CreateHabitInput) {
    setErrorMessage('');

    try {
      if (habit) {
        await updateHabitMutation.mutateAsync({
          id: habit.id,
          values,
        });
      } else {
        await createHabitMutation.mutateAsync(values);
      }

      onOpenChange(false);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Habit changes could not be saved.');
    }
  }

  const modeTitle = habit ? 'Edit habit' : 'Add habit';

  return (
    <Dialog
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          setErrorMessage('');
        }

        onOpenChange(nextOpen);
      }}
      open={open}
    >
      <DialogContent className="max-h-[calc(100vh-2rem)] gap-4 overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{modeTitle}</DialogTitle>
          <DialogDescription>
            Pick how the habit should be tracked, then save it to your account.
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
          <div className="space-y-2">
            <Label htmlFor="habit-name">Habit name</Label>
            <Input
              id="habit-name"
              aria-invalid={errors.name ? true : undefined}
              autoComplete="off"
              className={cn(errors.name && 'border-destructive')}
              disabled={isSaving}
              placeholder="Morning walk"
              {...register('name')}
            />
            {errors.name?.message ? (
              <p className="text-sm text-destructive">{errors.name.message}</p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="habit-description">Notes</Label>
            <Controller
              control={control}
              name="description"
              render={({ field }) => (
                <textarea
                  id="habit-description"
                  className={cn(
                    'flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-none transition-[color,box-shadow] placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30',
                  )}
                  disabled={isSaving}
                  placeholder="Why this habit matters, tips for consistency, etc."
                  name={field.name}
                  onBlur={field.onBlur}
                  onChange={(event) => {
                    const nextValue = event.target.value;
                    field.onChange(nextValue.length === 0 ? null : nextValue);
                  }}
                  ref={field.ref}
                  rows={3}
                  value={field.value ?? ''}
                />
              )}
            />
          </div>

          <div className="space-y-2.5">
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
                const isSelected = selectedEmoji === emoji;

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
                    disabled={isSaving}
                    onClick={() => setValue('emoji', emoji, { shouldDirty: true })}
                    type="button"
                  >
                    <span aria-hidden="true">{emoji}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="tracking-type">Tracking type</Label>
            <select
              id="tracking-type"
              className={cn(
                'flex min-h-[44px] w-full cursor-pointer rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30',
                errors.trackingType && 'border-destructive',
              )}
              disabled={isSaving}
              {...register('trackingType')}
            >
              {trackingTypeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2.5">
            <div className="space-y-1">
              <Label htmlFor="habit-frequency">Frequency</Label>
              <p className="text-sm text-muted">Choose how often this habit should be scheduled.</p>
            </div>
            <select
              id="habit-frequency"
              className={cn(
                'flex min-h-[44px] w-full cursor-pointer rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30',
                errors.frequency && 'border-destructive',
              )}
              disabled={isSaving}
              {...register('frequency')}
            >
              {frequencyOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>

            {showWeeklyTarget ? (
              <div className="space-y-2">
                <Label htmlFor="habit-frequency-target">Times per week</Label>
                <Controller
                  control={control}
                  name="frequencyTarget"
                  render={({ field }) => (
                    <Input
                      disabled={isSaving}
                      id="habit-frequency-target"
                      max="7"
                      min="1"
                      name={field.name}
                      onBlur={field.onBlur}
                      onChange={(event) => {
                        const nextValue = event.target.value;
                        field.onChange(nextValue.length === 0 ? null : Number(nextValue));
                      }}
                      placeholder="3"
                      ref={field.ref}
                      step="1"
                      type="number"
                      value={field.value ?? ''}
                    />
                  )}
                />
                {errors.frequencyTarget?.message ? (
                  <p className="text-sm text-destructive">{errors.frequencyTarget.message}</p>
                ) : null}
              </div>
            ) : null}

            {showSpecificDays ? (
              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground">Days of week</p>
                <Controller
                  control={control}
                  name="scheduledDays"
                  render={({ field }) => {
                    const selectedDays = field.value ?? [];

                    return (
                      <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
                        {weekdayLabels.map((label, index) => {
                          const isSelected = selectedDays.includes(index);

                          return (
                            <button
                              key={label}
                              aria-label={label}
                              aria-pressed={isSelected}
                              className={cn(
                                'min-h-[44px] rounded-md border px-2 text-sm font-medium transition-colors',
                                isSelected
                                  ? 'border-slate-950 bg-slate-950 text-white'
                                  : 'border-border bg-background hover:border-slate-950/30 hover:bg-accent',
                              )}
                              disabled={isSaving}
                              onClick={() => {
                                const nextValues = isSelected
                                  ? selectedDays.filter((value) => value !== index)
                                  : [...selectedDays, index];
                                field.onChange(nextValues.sort((left, right) => left - right));
                              }}
                              type="button"
                            >
                              {label}
                            </button>
                          );
                        })}
                      </div>
                    );
                  }}
                />
                {errors.scheduledDays?.message ? (
                  <p className="text-sm text-destructive">{errors.scheduledDays.message}</p>
                ) : null}
              </div>
            ) : null}
          </div>

          {showTargetFields ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="habit-target">Target</Label>
                <Controller
                  control={control}
                  name="target"
                  render={({ field }) => (
                    <Input
                      disabled={isSaving}
                      id="habit-target"
                      min="0"
                      name={field.name}
                      onBlur={field.onBlur}
                      onChange={(event) => {
                        const nextValue = event.target.value;
                        field.onChange(nextValue.length === 0 ? null : Number(nextValue));
                      }}
                      placeholder="8"
                      ref={field.ref}
                      step="any"
                      type="number"
                      value={field.value ?? ''}
                    />
                  )}
                />
                {errors.target?.message ? (
                  <p className="text-sm text-destructive">{errors.target.message}</p>
                ) : null}
              </div>

              <div className="space-y-2">
                <Label htmlFor="habit-unit">Unit</Label>
                <Controller
                  control={control}
                  name="unit"
                  render={({ field }) => (
                    <Input
                      disabled={isSaving}
                      id="habit-unit"
                      name={field.name}
                      onBlur={field.onBlur}
                      onChange={(event) => {
                        const nextValue = event.target.value;
                        field.onChange(nextValue.length === 0 ? null : nextValue);
                      }}
                      placeholder={unitPlaceholder}
                      ref={field.ref}
                      value={field.value ?? ''}
                    />
                  )}
                />
                {errors.unit?.message ? (
                  <p className="text-sm text-destructive">{errors.unit.message}</p>
                ) : null}
              </div>
            </div>
          ) : null}

          <div
            className={cn(
              'inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-sm font-semibold text-slate-950',
              trackingSurfaceClasses[trackingType],
            )}
          >
            <span aria-hidden="true">{selectedEmoji}</span>
            <span>{trackingTypeLabels[trackingType]}</span>
          </div>

          {errorMessage ? (
            <p className="text-sm text-destructive" role="alert">
              {errorMessage}
            </p>
          ) : null}

          <DialogFooter className="pt-1">
            <Button
              disabled={isSaving}
              onClick={() => onOpenChange(false)}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            <Button disabled={isSaving} type="submit">
              {isSaving ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
