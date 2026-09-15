import { zodResolver } from '@hookform/resolvers/zod';
import {
  defaultBodyEnabledSites,
  type BodyEnabledSite,
  type BodyMeasurementSite,
} from '@pulse/shared';
import { useEffect } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useBodyDue, useBodyPreferences, useSaveBodyPreferences } from '../api/body-progress';

const siteLabels: Record<BodyMeasurementSite, string> = {
  waist_iliac_crest_nhanes: 'NHANES iliac-crest waist',
  chest_nipple_line_relaxed: 'Relaxed nipple-line chest',
  hips_maximum: 'Maximum hip circumference',
  upper_arm_midpoint_flexed: 'Flexed midpoint upper arm',
  thigh_midpoint: 'Midpoint thigh',
};

const preferenceFormSchema = z.object({
  cadence: z.coerce.number().int().min(7, 'Use 7–90 days').max(90, 'Use 7–90 days'),
  cadenceMode: z.enum(['7', '14', '28', 'custom']),
  lengthUnit: z.enum(['cm', 'in']),
  anchorDate: z.string().min(1, 'Choose a cadence anchor'),
  reminderLocalTime: z.string(),
  sites: z
    .array(z.object({ site: z.string(), laterality: z.string() }))
    .min(1, 'Choose at least one site'),
  cadenceChange: z.enum(['preserve_anchor', 'restart']),
});
type PreferenceForm = z.infer<typeof preferenceFormSchema>;

const defaults = (localDate = ''): PreferenceForm => ({
  cadence: 14,
  cadenceMode: '14',
  lengthUnit: 'cm',
  anchorDate: localDate,
  reminderLocalTime: '',
  sites: defaultBodyEnabledSites,
  cadenceChange: 'restart',
});

export function BodyPreferencesForm({ onSaved }: { onSaved?: () => void }) {
  const preferenceQuery = useBodyPreferences();
  const dueQuery = useBodyDue();
  const saveMutation = useSaveBodyPreferences();
  const form = useForm<PreferenceForm>({
    resolver: zodResolver(preferenceFormSchema),
    defaultValues: defaults(),
  });
  const cadenceMode = form.watch('cadenceMode');
  const sites = form.watch('sites');
  const cadenceChange = form.watch('cadenceChange');

  useEffect(() => {
    if (preferenceQuery.data) {
      const cadence = preferenceQuery.data.measurementCadenceDays;
      form.reset({
        cadence,
        cadenceMode:
          cadence === 7 || cadence === 14 || cadence === 28
            ? (String(cadence) as '7' | '14' | '28')
            : 'custom',
        lengthUnit: preferenceQuery.data.lengthUnit,
        anchorDate: preferenceQuery.data.anchorDate,
        reminderLocalTime: preferenceQuery.data.reminderLocalTime ?? '',
        sites: preferenceQuery.data.enabledSites,
        cadenceChange: 'preserve_anchor',
      });
    } else if (preferenceQuery.data === null && dueQuery.data?.localDate) {
      form.reset(defaults(dueQuery.data.localDate));
    }
  }, [dueQuery.data?.localDate, form, preferenceQuery.data]);

  const toggleSite = (site: BodyMeasurementSite, checked: boolean) => {
    const defaultSite = defaultBodyEnabledSites.find((item) => item.site === site);
    const next = checked
      ? defaultSite
        ? [...sites, defaultSite]
        : sites
      : sites.filter((item) => item.site !== site);
    form.setValue('sites', next, { shouldDirty: true, shouldValidate: true });
  };

  const updateLaterality = (site: BodyMeasurementSite, laterality: 'left' | 'right') => {
    form.setValue(
      'sites',
      sites.map((item) => (item.site === site ? { ...item, laterality } : item)),
      { shouldDirty: true },
    );
  };

  const submit = form.handleSubmit(async (values) => {
    const cadence = values.cadenceMode === 'custom' ? values.cadence : Number(values.cadenceMode);
    await saveMutation.mutateAsync({
      measurementCadenceDays: cadence,
      lengthUnit: values.lengthUnit,
      enabledSites: values.sites as BodyEnabledSite[],
      reminderLocalTime: values.reminderLocalTime || null,
      cadenceChange: preferenceQuery.data ? values.cadenceChange : 'restart',
      ...(preferenceQuery.data && values.cadenceChange === 'preserve_anchor'
        ? {}
        : { restartAnchorDate: values.anchorDate }),
    });
    onSaved?.();
  });

  if (preferenceQuery.isPending || dueQuery.isPending)
    return (
      <Card aria-busy="true">
        <CardContent className="p-5">Loading server preferences…</CardContent>
      </Card>
    );
  if (preferenceQuery.isError || dueQuery.isError)
    return (
      <Card className="border-destructive/40" role="alert">
        <CardHeader>
          <CardTitle>Body Progress setup unavailable</CardTitle>
          <CardDescription>
            Pulse could not load server preferences and date authority. No defaults were saved.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            onClick={() => void Promise.all([preferenceQuery.refetch(), dueQuery.refetch()])}
            variant="outline"
          >
            Retry setup
          </Button>
        </CardContent>
      </Card>
    );

  return (
    <Card className="border-border/70" data-testid="body-preferences-form">
      <CardHeader>
        <CardTitle>
          {preferenceQuery.data ? 'Measurement preferences' : 'Set up Body Progress'}
        </CardTitle>
        <CardDescription>
          Measurements can show circumference direction, not exact fat or muscle mass. A 14-day
          cadence is Pulse’s product default, not a medical standard.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-6" noValidate onSubmit={(event) => void submit(event)}>
          {Object.keys(form.formState.errors).length > 0 ? (
            <div
              className="rounded-xl border border-destructive/40 bg-destructive/5 p-3"
              role="alert"
            >
              <p className="font-medium">Review the highlighted setup fields.</p>
              <a className="text-sm underline" href="#body-cadence">
                Go to cadence
              </a>
            </div>
          ) : null}
          <fieldset className="space-y-3">
            <legend className="font-semibold">Cadence</legend>
            <Controller
              control={form.control}
              name="cadenceMode"
              render={({ field }) => (
                <RadioGroup
                  aria-label="Cadence"
                  className="grid grid-cols-2 gap-2 sm:grid-cols-4"
                  onValueChange={(value) => {
                    field.onChange(value);
                    if (value !== 'custom') form.setValue('cadence', Number(value));
                  }}
                  value={field.value}
                >
                  {['7', '14', '28', 'custom'].map((value) => (
                    <Label
                      className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-border/80 p-3"
                      htmlFor={`cadence-${value}`}
                      key={value}
                    >
                      <RadioGroupItem id={`cadence-${value}`} value={value} />
                      <span>{value === 'custom' ? 'Custom' : `Every ${value} days`}</span>
                    </Label>
                  ))}
                </RadioGroup>
              )}
            />
            {cadenceMode === 'custom' ? (
              <div className="max-w-xs space-y-2">
                <Label htmlFor="body-cadence">Custom cadence (7–90 days)</Label>
                <Input
                  className="min-h-11"
                  aria-invalid={Boolean(form.formState.errors.cadence)}
                  id="body-cadence"
                  max={90}
                  min={7}
                  type="number"
                  {...form.register('cadence', { valueAsNumber: true })}
                />
                {form.formState.errors.cadence ? (
                  <p className="text-sm text-destructive">
                    {form.formState.errors.cadence.message}
                  </p>
                ) : null}
              </div>
            ) : null}
          </fieldset>

          <fieldset className="space-y-3">
            <legend className="font-semibold">Length unit</legend>
            <Controller
              control={form.control}
              name="lengthUnit"
              render={({ field }) => (
                <RadioGroup
                  aria-label="Length unit"
                  className="grid grid-cols-2 gap-2"
                  onValueChange={field.onChange}
                  value={field.value}
                >
                  {(['cm', 'in'] as const).map((unit) => (
                    <Label
                      className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-border/80 p-3"
                      htmlFor={`length-${unit}`}
                      key={unit}
                    >
                      <RadioGroupItem id={`length-${unit}`} value={unit} />
                      {unit}
                    </Label>
                  ))}
                </RadioGroup>
              )}
            />
            <p className="text-sm text-muted-foreground">
              This is independent from your body-weight unit.
            </p>
          </fieldset>

          <fieldset className="space-y-3">
            <legend className="font-semibold">Measurement sites</legend>
            <p className="text-sm text-muted-foreground">
              Waist is recommended for future interpretation, but it is optional.
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {(Object.keys(siteLabels) as BodyMeasurementSite[]).map((site) => {
                const enabled = sites.some((item) => item.site === site);
                const selected = sites.find((item) => item.site === site);
                const sided = site === 'upper_arm_midpoint_flexed' || site === 'thigh_midpoint';
                return (
                  <div className="rounded-xl border border-border/80 p-3" key={site}>
                    <Label
                      className="flex min-h-11 cursor-pointer items-center gap-3"
                      htmlFor={`site-${site}`}
                    >
                      <Checkbox
                        checked={enabled}
                        id={`site-${site}`}
                        onCheckedChange={(checked) => toggleSite(site, checked === true)}
                      />
                      <span>{siteLabels[site]}</span>
                    </Label>
                    {enabled && sided ? (
                      <div className="ml-7 mt-2 flex gap-4">
                        {(['left', 'right'] as const).map((side) => (
                          <Label
                            className="flex min-h-11 items-center gap-2"
                            htmlFor={`${site}-${side}`}
                            key={side}
                          >
                            <input
                              checked={selected?.laterality === side}
                              id={`${site}-${side}`}
                              name={`${site}-side`}
                              onChange={() => updateLaterality(site, side)}
                              type="radio"
                            />
                            {side}
                          </Label>
                        ))}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
            {form.formState.errors.sites ? (
              <p className="text-sm text-destructive" role="alert">
                {form.formState.errors.sites.message}
              </p>
            ) : null}
          </fieldset>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="body-anchor">Cadence anchor</Label>
              <Input
                className="min-h-11"
                disabled={Boolean(preferenceQuery.data) && cadenceChange === 'preserve_anchor'}
                id="body-anchor"
                type="date"
                {...form.register('anchorDate')}
              />
              <p className="text-xs text-muted-foreground">
                Server local date: {dueQuery.data?.localDate ?? 'unresolved'} ·{' '}
                {dueQuery.data?.timeZone ?? 'time zone unresolved'}
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="body-reminder">Optional in-app reminder time</Label>
              <Input
                className="min-h-11"
                id="body-reminder"
                type="time"
                {...form.register('reminderLocalTime')}
              />
              <p className="text-xs text-muted-foreground">
                Scheduling metadata only; Pulse does not claim push, email, or SMS delivery.
              </p>
            </div>
          </div>

          {preferenceQuery.data ? (
            <fieldset className="space-y-2">
              <legend className="font-semibold">When cadence changes</legend>
              <Controller
                control={form.control}
                name="cadenceChange"
                render={({ field }) => (
                  <RadioGroup
                    aria-label="When cadence changes"
                    className="grid gap-2 sm:grid-cols-2"
                    onValueChange={field.onChange}
                    value={field.value}
                  >
                    <Label
                      className="flex min-h-11 items-center gap-2 rounded-xl border p-3"
                      htmlFor="preserve-anchor"
                    >
                      <RadioGroupItem id="preserve-anchor" value="preserve_anchor" />
                      Preserve current anchor
                    </Label>
                    <Label
                      className="flex min-h-11 items-center gap-2 rounded-xl border p-3"
                      htmlFor="restart-anchor"
                    >
                      <RadioGroupItem id="restart-anchor" value="restart" />
                      Restart from selected date
                    </Label>
                  </RadioGroup>
                )}
              />
            </fieldset>
          ) : null}
          <p className="text-sm text-muted-foreground">
            Extra logs are welcome and never silently reset this cadence.
          </p>
          {saveMutation.isError ? (
            <p className="text-sm text-destructive" role="alert">
              Preferences were not saved. Verify your time zone and try again.
            </p>
          ) : null}
          <Button disabled={saveMutation.isPending} type="submit">
            {saveMutation.isPending
              ? 'Saving…'
              : preferenceQuery.data
                ? 'Save preferences'
                : 'Finish setup'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
