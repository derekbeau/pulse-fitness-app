import { zodResolver } from '@hookform/resolvers/zod';
import type { DailyNutritionTargetValues } from '@pulse/shared';
import { SlidersHorizontal } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

import {
  useDailyNutritionTarget,
  usePatchDailyNutritionTarget,
  useRestoreDailyNutritionTarget,
} from '../api/daily-target';

const optionalNumber = (max: number) =>
  z
    .string()
    .trim()
    .refine((value) => value === '' || Number.isFinite(Number(value)), 'Enter a valid number')
    .refine((value) => value === '' || Number(value) >= 0, 'Enter zero or more')
    .refine(
      (value) => value === '' || Number(value) <= max,
      `Enter ${max.toLocaleString()} or less`,
    );

const formSchema = z.object({
  calories: optionalNumber(10_000),
  protein: optionalNumber(1_000),
  carbs: optionalNumber(1_000),
  fat: optionalNumber(1_000),
  reason: z.string().trim().max(2_000, 'Use 2,000 characters or fewer'),
});
type FormValues = z.infer<typeof formSchema>;

const fields = [
  { key: 'calories', label: 'Calories', unit: 'kcal' },
  { key: 'protein', label: 'Protein', unit: 'g' },
  { key: 'carbs', label: 'Carbohydrates', unit: 'g' },
  { key: 'fat', label: 'Fat', unit: 'g' },
] as const;

const toDefaults = (
  values: Partial<Record<keyof DailyNutritionTargetValues, number | null>> | null | undefined,
  reason: string | null | undefined,
): FormValues => ({
  calories: values?.calories?.toString() ?? '',
  protein: values?.protein?.toString() ?? '',
  carbs: values?.carbs?.toString() ?? '',
  fat: values?.fat?.toString() ?? '',
  reason: reason ?? '',
});

export function DailyTargetAdjustment({
  date,
  disabled = false,
}: {
  date: string;
  disabled?: boolean;
}) {
  const query = useDailyNutritionTarget(date);
  const patch = usePatchDailyNutritionTarget();
  const restore = useRestoreDailyNutritionTarget();
  const [editing, setEditing] = useState(false);
  const id = useId();
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: toDefaults(null, null),
  });
  const target = query.data;
  const pending = patch.isPending || restore.isPending;

  useEffect(() => {
    if (editing) form.setFocus('calories');
  }, [editing, form]);

  const beginEditing = () => {
    form.reset(toDefaults(target?.override, target?.override?.reason));
    patch.reset();
    setEditing(true);
  };
  const closeEditing = () => {
    setEditing(false);
    window.setTimeout(() => document.getElementById(`${id}-action`)?.focus(), 0);
  };
  const save = async (values: FormValues) => {
    try {
      await patch.mutateAsync({
        date,
        input: {
          calories: values.calories === '' ? null : Number(values.calories),
          protein: values.protein === '' ? null : Number(values.protein),
          carbs: values.carbs === '' ? null : Number(values.carbs),
          fat: values.fat === '' ? null : Number(values.fat),
          reason: values.reason === '' ? null : values.reason,
        },
      });
      closeEditing();
    } catch {
      // The mutation retains the draft and exposes the request error below.
    }
  };

  if (query.isPending) {
    return (
      <section
        className="h-28 animate-pulse rounded-2xl border border-border/70 bg-card"
        aria-label="Loading daily targets"
      />
    );
  }

  return (
    <section
      className="space-y-3 rounded-2xl border border-border/70 bg-card p-4 sm:p-5"
      aria-labelledby={`${id}-heading`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <SlidersHorizontal aria-hidden="true" className="size-4 text-primary" />
            <h2 className="text-base font-semibold" id={`${id}-heading`}>
              Daily targets
            </h2>
            {target?.adjusted ? <Badge variant="outline">Adjusted</Badge> : null}
          </div>
          <p className="mt-1 text-sm text-muted">
            Changes apply only to {date}. Tomorrow and your ongoing program stay unchanged.
          </p>
        </div>
        {!editing ? (
          <div className="flex flex-wrap gap-2">
            <Button
              id={`${id}-action`}
              disabled={disabled || pending || !target?.baseline}
              size="sm"
              variant="outline"
              onClick={beginEditing}
            >
              {target?.adjusted ? 'Edit adjustment' : 'Adjust this day'}
            </Button>
            {target?.adjusted ? (
              <Button
                disabled={disabled || pending}
                size="sm"
                variant="ghost"
                onClick={() => restore.mutate(date)}
              >
                Restore baseline
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>

      {target?.effective ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {fields.map(({ key, label, unit }) => (
            <div
              className="rounded-xl border border-border/70 bg-background/40 px-3 py-2"
              key={key}
            >
              <p className="text-xs text-muted">{label}</p>
              <p className="font-semibold tabular-nums">
                {target.effective?.[key].toLocaleString()} {unit}
              </p>
              {target.override?.[key] !== null && target.override?.[key] !== undefined ? (
                <p className="text-xs text-muted">
                  Baseline {target.baseline?.[key].toLocaleString()} {unit}
                </p>
              ) : null}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted">
          No accepted baseline target was effective on this date.
        </p>
      )}

      {target?.override?.reason ? (
        <p className="text-sm text-muted">
          <span className="font-medium text-foreground">Reason:</span> {target.override.reason}
        </p>
      ) : null}

      {editing ? (
        <form
          className="space-y-4 border-t border-border/70 pt-4"
          onSubmit={form.handleSubmit(save)}
        >
          <p className="text-sm text-muted">Leave a field blank to inherit its baseline value.</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {fields.map(({ key, label, unit }) => {
              const error = form.formState.errors[key]?.message;
              return (
                <div className="space-y-1" key={key}>
                  <Label htmlFor={`${id}-${key}`}>
                    {label} ({unit})
                  </Label>
                  <Input
                    {...form.register(key)}
                    aria-invalid={Boolean(error)}
                    disabled={pending || disabled}
                    id={`${id}-${key}`}
                    inputMode="decimal"
                    placeholder={target?.baseline?.[key].toString()}
                  />
                  {error ? (
                    <p className="text-xs text-destructive" role="alert">
                      {error}
                    </p>
                  ) : null}
                </div>
              );
            })}
          </div>
          <div className="space-y-1">
            <Label htmlFor={`${id}-reason`}>Reason (optional)</Label>
            <Textarea
              {...form.register('reason')}
              disabled={pending || disabled}
              id={`${id}-reason`}
              maxLength={2_000}
              placeholder="Travel day, planned event, recovery day…"
            />
          </div>
          {patch.isError ? (
            <p className="text-sm text-destructive" role="alert">
              Could not save the adjustment. Your entries are still here.
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button disabled={pending || disabled} type="submit">
              {pending ? 'Saving…' : 'Save adjustment'}
            </Button>
            <Button disabled={pending} type="button" variant="outline" onClick={closeEditing}>
              Cancel
            </Button>
          </div>
        </form>
      ) : null}
    </section>
  );
}
