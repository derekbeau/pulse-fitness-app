import {
  BODY_PROTOCOL_VERSION,
  bodyMeasurementProtocols,
  calculateCanonicalBodyReading,
  createBodyCheckInInputSchema,
  type BodyCheckIn,
  type BodyCheckInMeasurementInput,
  type BodyEnabledSite,
  type BodyMealContext,
  type BodyWorkoutContext,
  type LengthUnit,
} from '@pulse/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { AlertCircle, Check, CircleDotDashed, Ruler } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router';
import { toast } from 'sonner';
import { z } from 'zod';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useConfirmation } from '@/components/ui/confirmation-dialog';
import { ApiError } from '@/lib/api-client';
import { useCreateBodyCheckIn, useUpdateBodyCheckIn } from '../api/body-progress';
import { ProtocolMedia } from './protocol-media';

type ReadingState = Record<string, [string, string, string]>;
const contextSchema = z.object({
  date: z.string().min(1, 'Choose a local date'),
  localTime: z.string(),
  mealContext: z.enum(['unspecified', 'pre_meal', 'post_meal']),
  workoutContext: z.enum(['unspecified', 'pre_workout', 'post_workout']),
  pumpPresent: z.boolean(),
  unusualBloating: z.boolean(),
  notes: z.string().max(2000, 'Notes must be 2,000 characters or less'),
  countAsScheduledOccurrence: z.boolean(),
  correctionReason: z.string(),
});
type ContextForm = z.infer<typeof contextSchema>;

const keyFor = ({ site, laterality }: BodyEnabledSite) => `${site}:${laterality}`;
const fromMm = (value: number | null, unit: LengthUnit) =>
  value === null ? '' : (value / (unit === 'cm' ? 10 : 25.4)).toFixed(1);
const measurementReadings = (entry: BodyCheckIn, enabled: BodyEnabledSite[], unit: LengthUnit) =>
  Object.fromEntries(
    enabled.map((site) => {
      const match = entry.measurements.find(
        (item) => item.site === site.site && item.laterality === site.laterality,
      );
      return [
        keyFor(site),
        match
          ? [
              fromMm(match.reading1Mm, unit),
              fromMm(match.reading2Mm, unit),
              fromMm(match.reading3Mm, unit),
            ]
          : ['', '', ''],
      ];
    }),
  ) as ReadingState;

const qualityCopy = {
  single_reading: 'Single reading · lower confidence',
  replicated: 'Readings agree · canonical average',
  needs_third_reading: 'A third reading will improve this measurement',
  replicated_with_tiebreaker: 'Closest two readings selected',
  high_variance: 'High variance · keep the values and consider remeasuring',
} as const;

export function GuidedCheckInForm({
  dueState,
  enabledSites,
  entry,
  lengthUnit,
  serverLocalDate,
}: {
  dueState?: string;
  enabledSites: BodyEnabledSite[];
  entry?: BodyCheckIn;
  lengthUnit: LengthUnit;
  serverLocalDate: string;
}) {
  const navigate = useNavigate();
  const createMutation = useCreateBodyCheckIn();
  const updateMutation = useUpdateBodyCheckIn();
  const { confirm, dialog } = useConfirmation();
  const idempotencyKey = useRef(`body-ui-${crypto.randomUUID()}`);
  const thirdRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const [readings, setReadings] = useState<ReadingState>(() =>
    entry
      ? measurementReadings(entry, enabledSites, lengthUnit)
      : (Object.fromEntries(
          enabledSites.map((site) => [keyFor(site), ['', '', '']]),
        ) as ReadingState),
  );
  const [omitted, setOmitted] = useState<Set<string>>(
    () =>
      new Set(
        entry
          ? enabledSites
              .filter(
                (site) =>
                  !entry.measurements.some(
                    (item) => item.site === site.site && item.laterality === site.laterality,
                  ),
              )
              .map(keyFor)
          : [],
      ),
  );
  const [serverError, setServerError] = useState<string>('');
  const [conflictingCheckInId, setConflictingCheckInId] = useState<string | null>(null);
  const [measurementDirty, setMeasurementDirty] = useState(false);
  const form = useForm<ContextForm>({
    resolver: zodResolver(contextSchema),
    defaultValues: {
      date: entry?.date ?? serverLocalDate,
      localTime: entry?.localTime ?? '',
      mealContext: entry?.mealContext ?? 'unspecified',
      workoutContext: entry?.workoutContext ?? 'unspecified',
      pumpPresent: entry?.pumpPresent ?? false,
      unusualBloating: entry?.unusualBloating ?? false,
      notes: entry?.notes ?? '',
      countAsScheduledOccurrence:
        entry?.countAsScheduledOccurrence ??
        ['due_today', 'overdue', 'snoozed'].includes(dueState ?? ''),
      correctionReason: '',
    },
  });
  const isCorrection = entry?.status === 'completed';
  const isPending = createMutation.isPending || updateMutation.isPending;
  const isContextDirty = form.formState.isDirty;

  useEffect(() => {
    for (const site of enabledSites) {
      const key = keyFor(site);
      const values = readings[key] ?? ['', '', ''];
      const parsed = values.slice(0, 2).map(Number);
      if (values[0] && values[1] && parsed.every(Number.isFinite)) {
        try {
          if (
            calculateCanonicalBodyReading(parsed, lengthUnit).quality === 'needs_third_reading' &&
            !values[2]
          ) {
            thirdRefs.current[key]?.focus();
          }
        } catch {
          /* server schema reports bounds on save */
        }
      }
    }
  }, [enabledSites, lengthUnit, readings]);

  const activeMeasurements = useMemo(
    () =>
      enabledSites.flatMap((site) => {
        const key = keyFor(site);
        if (omitted.has(key)) return [];
        const values = readings[key] ?? ['', '', ''];
        const parsed = values.filter((value) => value.trim() !== '').map(Number);
        if (parsed.length === 0 || parsed.some((value) => !Number.isFinite(value))) return [];
        return [{ ...site, unit: lengthUnit, readings: parsed } as BodyCheckInMeasurementInput];
      }),
    [enabledSites, lengthUnit, omitted, readings],
  );

  const save = async (status: 'draft' | 'completed') => {
    setServerError('');
    setConflictingCheckInId(null);
    const validContext = await form.trigger();
    if (!validContext) {
      document.getElementById('check-in-error-summary')?.focus();
      return;
    }
    const values = form.getValues();
    const mutablePayload = {
      status,
      measurements: activeMeasurements,
      localTime: values.localTime || null,
      mealContext: values.mealContext as BodyMealContext,
      workoutContext: values.workoutContext as BodyWorkoutContext,
      pumpPresent: values.pumpPresent,
      unusualBloating: values.unusualBloating,
      notes: values.notes.trim() || null,
      countAsScheduledOccurrence: values.countAsScheduledOccurrence,
    };
    const payload = { date: values.date, ...mutablePayload };
    const parsed = createBodyCheckInInputSchema.safeParse({
      ...payload,
      idempotencyKey: idempotencyKey.current,
    });
    if (!parsed.success) {
      const message = parsed.error.issues[0]?.message ?? 'Review the measurement values.';
      setServerError(message);
      document.getElementById('check-in-error-summary')?.focus();
      return;
    }
    if (isCorrection && !values.correctionReason.trim()) {
      form.setError('correctionReason', {
        message: 'Explain why this completed check-in is being corrected.',
      });
      document.getElementById('correction-reason')?.focus();
      return;
    }
    try {
      const saved = entry
        ? await updateMutation.mutateAsync({
            id: entry.id,
            input: {
              ...mutablePayload,
              expectedVersion: entry.version,
              ...(isCorrection ? { correctionReason: values.correctionReason.trim() } : {}),
            },
          })
        : await createMutation.mutateAsync(parsed.data);
      toast.success(
        status === 'draft'
          ? 'Draft saved across devices.'
          : isCorrection
            ? 'Correction saved.'
            : 'Body check-in completed.',
      );
      navigate(`/body/check-ins/${saved.id}`);
    } catch (error) {
      if (
        error instanceof ApiError &&
        error.code === 'BODY_CHECK_IN_DATE_CONFLICT' &&
        error.existingId
      ) {
        setServerError(`A check-in already exists for ${values.date}. Your input is still here.`);
        setConflictingCheckInId(error.existingId);
        toast.error('A check-in already exists on that date.', {
          action: {
            label: 'Open existing',
            onClick: () => navigate(`/body/check-ins/${error.existingId}`),
          },
        });
      } else if (error instanceof ApiError && error.code === 'BODY_CHECK_IN_VERSION_CONFLICT') {
        setServerError(
          `This check-in changed on another device (server version ${error.currentVersion ?? 'newer'}). Your values remain on screen; reload before retrying.`,
        );
      } else
        setServerError(error instanceof Error ? error.message : 'The check-in could not be saved.');
    }
  };

  const cancel = () => {
    const leave = () => navigate(entry ? `/body/check-ins/${entry.id}` : '/body');
    if (!isContextDirty && !measurementDirty) return leave();
    confirm({
      title: 'Leave this check-in?',
      description:
        'Unsaved changes will stay only on this screen. Save a draft to resume on another device.',
      confirmLabel: 'Leave without saving',
      onConfirm: leave,
    });
  };

  const hasWaist = activeMeasurements.some(
    (measurement) => measurement.site === 'waist_iliac_crest_nhanes',
  );

  return (
    <div className="space-y-5" data-testid="guided-check-in-form">
      {dialog}
      <Card className="border-border/70">
        <CardHeader>
          <CardTitle>
            {isCorrection ? 'Correct check-in' : entry ? 'Resume draft' : 'Guided body check-in'}
          </CardTitle>
          <CardDescription>
            Use the same landmark and conditions each time. All raw readings are preserved; the
            server decides the saved canonical value and quality.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="check-in-date">Server-local date</Label>
            <Input
              className="min-h-11"
              id="check-in-date"
              max={serverLocalDate}
              type="date"
              {...form.register('date')}
              disabled={Boolean(entry)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="check-in-time">Local time</Label>
            <Input
              className="min-h-11"
              id="check-in-time"
              type="time"
              {...form.register('localTime')}
            />
          </div>
          <div className="rounded-xl bg-secondary/30 p-3 text-sm">
            <p className="font-medium">Protocol version</p>
            <p className="text-muted-foreground">{BODY_PROTOCOL_VERSION}</p>
          </div>
        </CardContent>
      </Card>

      {serverError || Object.keys(form.formState.errors).length ? (
        <div
          className="rounded-xl border border-destructive/40 bg-destructive/5 p-3"
          id="check-in-error-summary"
          role="alert"
          tabIndex={-1}
        >
          <p className="font-semibold">This check-in needs attention.</p>
          <p className="text-sm">{serverError || 'Review the highlighted fields below.'}</p>
          <div className="mt-2 flex flex-wrap gap-3 text-sm">
            {conflictingCheckInId ? (
              <Link
                className="font-medium text-primary underline"
                to={`/body/check-ins/${conflictingCheckInId}`}
              >
                Open the existing check-in
              </Link>
            ) : null}
            <a
              className="font-medium text-primary underline"
              href={`#measurement-${keyFor(enabledSites[0] ?? { site: 'waist_iliac_crest_nhanes', laterality: 'none' })}`}
            >
              Review measurement fields
            </a>
            <a className="font-medium text-primary underline" href="#measurement-context">
              Review context
            </a>
          </div>
        </div>
      ) : null}

      {enabledSites.map((site, index) => {
        const key = keyFor(site);
        const values = readings[key] ?? ['', '', ''];
        const numeric = values.filter(Boolean).map(Number);
        let preview: ReturnType<typeof calculateCanonicalBodyReading> | null = null;
        try {
          if (numeric.length > 0 && numeric.every(Number.isFinite))
            preview = calculateCanonicalBodyReading(numeric, lengthUnit);
        } catch {
          preview = null;
        }
        const needsThird = preview?.quality === 'needs_third_reading' || Boolean(values[2]);
        const protocol = bodyMeasurementProtocols[site.site];
        const isOmitted = omitted.has(key);
        return (
          <Card
            className="overflow-hidden border-border/70"
            data-measurement-site={site.site}
            id={`measurement-${key}`}
            key={key}
          >
            <CardHeader className="border-b border-border/60 bg-secondary/10">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    Step {index + 1} · {site.laterality === 'none' ? 'center' : site.laterality}
                  </p>
                  <CardTitle className="mt-1">{protocol.name}</CardTitle>
                  <CardDescription>{protocol.instructions}</CardDescription>
                </div>
                <Ruler aria-hidden="true" className="size-5 shrink-0 text-primary" />
              </div>
            </CardHeader>
            <CardContent className="space-y-4 pt-4">
              <Label
                className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-border/70 p-3"
                htmlFor={`omit-${key}`}
              >
                <Checkbox
                  checked={isOmitted}
                  id={`omit-${key}`}
                  onCheckedChange={(checked) =>
                    setOmitted((current) => {
                      setMeasurementDirty(true);
                      const next = new Set(current);
                      if (checked) next.add(key);
                      else next.delete(key);
                      return next;
                    })
                  }
                />
                Omit this optional site today
              </Label>
              {!isOmitted ? (
                <>
                  <ProtocolMedia site={site.site} />
                  <div className="grid gap-3 sm:grid-cols-3">
                    {[0, 1, 2].map((readingIndex) =>
                      readingIndex === 2 && !needsThird ? null : (
                        <div className="space-y-2" key={readingIndex}>
                          <Label htmlFor={`${key}-reading-${readingIndex + 1}`}>
                            Reading {readingIndex + 1} ({lengthUnit})
                          </Label>
                          <div className="relative">
                            <Input
                              className="min-h-11 pr-10"
                              aria-describedby={`${key}-quality`}
                              id={`${key}-reading-${readingIndex + 1}`}
                              inputMode="decimal"
                              max={lengthUnit === 'cm' ? 300 : 118.1}
                              min={lengthUnit === 'cm' ? 20 : 7.9}
                              onChange={(event) => {
                                const nextValue = event.currentTarget.value;
                                setMeasurementDirty(true);
                                setReadings((current) => ({
                                  ...current,
                                  [key]: current[key].map((value, valueIndex) =>
                                    valueIndex === readingIndex ? nextValue : value,
                                  ) as [string, string, string],
                                }));
                              }}
                              ref={
                                readingIndex === 2
                                  ? (node) => {
                                      thirdRefs.current[key] = node;
                                    }
                                  : undefined
                              }
                              step="0.1"
                              type="number"
                              value={values[readingIndex]}
                            />
                            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                              {lengthUnit}
                            </span>
                          </div>
                        </div>
                      ),
                    )}
                  </div>
                  {preview ? (
                    <div
                      className="flex items-start gap-3 rounded-xl border border-border/70 bg-secondary/20 p-3"
                      id={`${key}-quality`}
                    >
                      <div className="mt-0.5">
                        {preview.quality === 'needs_third_reading' ||
                        preview.quality === 'high_variance' ? (
                          <AlertCircle aria-hidden="true" className="size-5 text-amber-600" />
                        ) : preview.quality === 'single_reading' ? (
                          <CircleDotDashed aria-hidden="true" className="size-5" />
                        ) : (
                          <Check aria-hidden="true" className="size-5 text-emerald-600" />
                        )}
                      </div>
                      <div>
                        <p className="font-medium">
                          Preview:{' '}
                          {(preview.canonicalMm / (lengthUnit === 'cm' ? 10 : 25.4)).toFixed(1)}{' '}
                          {lengthUnit}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {qualityCopy[preview.quality]}. The saved server response is
                          authoritative.
                          {preview.selectedReadingPair
                            ? ` Selected readings ${preview.selectedReadingPair.join(' and ')}; equal ties keep the earliest pair.`
                            : ''}
                        </p>
                      </div>
                    </div>
                  ) : null}
                </>
              ) : null}
            </CardContent>
          </Card>
        );
      })}

      {!hasWaist ? (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3">
          <p className="font-medium">Waist is not included</p>
          <p className="text-sm text-muted-foreground">
            You can still save. Future composition interpretation will have less evidence.
          </p>
        </div>
      ) : null}

      <Card id="measurement-context">
        <CardHeader>
          <CardTitle>Measurement context</CardTitle>
          <CardDescription>
            These details help compare like with like; they do not change the raw values.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="meal-context">Meal timing</Label>
            <select
              className="min-h-11 w-full rounded-md border bg-background px-3"
              id="meal-context"
              {...form.register('mealContext')}
            >
              <option value="unspecified">Not specified</option>
              <option value="pre_meal">Before a meal</option>
              <option value="post_meal">After a meal</option>
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="workout-context">Workout timing</Label>
            <select
              className="min-h-11 w-full rounded-md border bg-background px-3"
              id="workout-context"
              {...form.register('workoutContext')}
            >
              <option value="unspecified">Not specified</option>
              <option value="pre_workout">Before workout</option>
              <option value="post_workout">After workout</option>
            </select>
          </div>
          <Label className="flex min-h-11 items-center gap-3">
            <Checkbox
              checked={form.watch('pumpPresent')}
              onCheckedChange={(checked) =>
                form.setValue('pumpPresent', checked === true, { shouldDirty: true })
              }
            />
            Pump present
          </Label>
          <Label className="flex min-h-11 items-center gap-3">
            <Checkbox
              checked={form.watch('unusualBloating')}
              onCheckedChange={(checked) =>
                form.setValue('unusualBloating', checked === true, { shouldDirty: true })
              }
            />
            Unusual bloating
          </Label>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="check-in-notes">Notes</Label>
            <Textarea id="check-in-notes" {...form.register('notes')} />
          </div>
          <Label className="flex min-h-11 items-start gap-3 rounded-xl border p-3 sm:col-span-2">
            <Checkbox
              checked={form.watch('countAsScheduledOccurrence')}
              onCheckedChange={(checked) =>
                form.setValue('countAsScheduledOccurrence', checked === true, { shouldDirty: true })
              }
            />
            <span>
              <span className="font-medium">Count as the current scheduled occurrence</span>
              <span className="mt-1 block text-sm text-muted-foreground">
                Turn this off for an extra log. Extra logs do not reset the cadence anchor.
              </span>
            </span>
          </Label>
          {isCorrection ? (
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="correction-reason">Correction reason</Label>
              <Textarea
                aria-invalid={Boolean(form.formState.errors.correctionReason)}
                id="correction-reason"
                {...form.register('correctionReason')}
              />
              {form.formState.errors.correctionReason ? (
                <p className="text-sm text-destructive" role="alert">
                  {form.formState.errors.correctionReason.message}
                </p>
              ) : null}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <div className="sticky bottom-3 z-10 flex flex-wrap gap-2 rounded-2xl border border-border/70 bg-background/95 p-3 shadow-lg backdrop-blur">
        <Button disabled={isPending} onClick={() => void save('completed')} type="button">
          {isPending ? 'Saving…' : isCorrection ? 'Save correction' : 'Complete check-in'}
        </Button>
        {!isCorrection ? (
          <Button
            disabled={isPending}
            onClick={() => void save('draft')}
            type="button"
            variant="outline"
          >
            Save draft
          </Button>
        ) : null}
        <Button disabled={isPending} onClick={cancel} type="button" variant="ghost">
          Cancel safely
        </Button>
        <Button asChild variant="link">
          <Link to="/body">Body Progress home</Link>
        </Button>
      </div>
    </div>
  );
}
