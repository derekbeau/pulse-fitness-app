import { useEffect, useState } from 'react';

import type { CreateNutritionTargetInput } from '@pulse/shared';
import { BackLink } from '@/components/layout/back-link';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { defaultHabitConfigs, HabitSettings } from '@/features/habits';
import { useNutritionTargets, useUpdateTargets } from '@/features/nutrition/api/targets';
import type { Theme } from '@/hooks/useTheme';
import { useThemeContext } from '@/hooks/useThemeContext';
import { formatDateKey } from '@/lib/date';
import { cn } from '@/lib/utils';

type ThemePreview = {
  background: string;
  border: string;
  card: string;
  muted: string;
  text: string;
};

type ThemeOption = {
  description: string;
  label: string;
  preview: ThemePreview;
  value: Theme;
};

const THEME_OPTIONS: ThemeOption[] = [
  {
    description: 'Bright surfaces and navy copy for daytime planning.',
    label: 'Light',
    preview: {
      background: '#FFFFFF',
      border: '#D6DCE8',
      card: '#F8F9FA',
      muted: '#5D6476',
      text: '#1A1A2E',
    },
    value: 'light',
  },
  {
    description: 'Soft dark surfaces with high-contrast text for everyday use.',
    label: 'Dark',
    preview: {
      background: '#1A1A2E',
      border: '#303B59',
      card: '#202942',
      muted: '#AEB6CC',
      text: '#E8E8E8',
    },
    value: 'dark',
  },
  {
    description: 'A deeper night palette tuned for low-glare late sessions.',
    label: 'Midnight',
    preview: {
      background: '#0D1B2A',
      border: '#31465F',
      card: '#1B2838',
      muted: '#91A2BF',
      text: '#CCD6F6',
    },
    value: 'midnight',
  },
];

const SETTINGS_STORAGE_KEY = 'pulse-prototype-settings';
const TREND_SPARKLINE_OPTIONS = ['Weight', 'Calories', 'Protein', 'Steps'] as const;
const HABIT_CHAIN_OPTIONS = defaultHabitConfigs.map((habit) => ({
  id: habit.id,
  label: habit.name,
}));

type SettingsFormState = {
  dashboardConfig: {
    habitChains: string[];
    trendSparklines: string[];
  };
  nutritionTargets: {
    calories: number;
    carbs: number;
    fat: number;
    protein: number;
  };
};

const DEFAULT_SETTINGS: SettingsFormState = {
  dashboardConfig: {
    habitChains: HABIT_CHAIN_OPTIONS.slice(0, 3).map((habit) => habit.id),
    trendSparklines: ['Weight', 'Calories', 'Protein'],
  },
  nutritionTargets: {
    calories: 2000,
    carbs: 250,
    fat: 65,
    protein: 150,
  },
};

function isTheme(value: string): value is Theme {
  return THEME_OPTIONS.some((option) => option.value === value);
}

function isTrendSparkline(value: string): value is (typeof TREND_SPARKLINE_OPTIONS)[number] {
  return TREND_SPARKLINE_OPTIONS.includes(value as (typeof TREND_SPARKLINE_OPTIONS)[number]);
}

function clampNumber(value: unknown, fallback: number) {
  if (typeof value !== 'number' || Number.isNaN(value) || value < 0) {
    return fallback;
  }

  return value;
}

function loadSettings(): SettingsFormState {
  if (typeof window === 'undefined') {
    return DEFAULT_SETTINGS;
  }

  try {
    const rawSettings = window.localStorage.getItem(SETTINGS_STORAGE_KEY);

    if (!rawSettings) {
      return DEFAULT_SETTINGS;
    }

    const parsedSettings = JSON.parse(rawSettings) as Partial<SettingsFormState>;

    const savedNutritionTargets = parsedSettings.nutritionTargets;
    const savedDashboardConfig = parsedSettings.dashboardConfig;

    return {
      dashboardConfig: {
        habitChains:
          savedDashboardConfig?.habitChains?.filter((habitId) =>
            HABIT_CHAIN_OPTIONS.some((habit) => habit.id === habitId),
          ) ?? DEFAULT_SETTINGS.dashboardConfig.habitChains,
        trendSparklines:
          savedDashboardConfig?.trendSparklines?.filter(isTrendSparkline) ??
          DEFAULT_SETTINGS.dashboardConfig.trendSparklines,
      },
      nutritionTargets: {
        calories: clampNumber(
          savedNutritionTargets?.calories,
          DEFAULT_SETTINGS.nutritionTargets.calories,
        ),
        carbs: clampNumber(savedNutritionTargets?.carbs, DEFAULT_SETTINGS.nutritionTargets.carbs),
        fat: clampNumber(savedNutritionTargets?.fat, DEFAULT_SETTINGS.nutritionTargets.fat),
        protein: clampNumber(
          savedNutritionTargets?.protein,
          DEFAULT_SETTINGS.nutritionTargets.protein,
        ),
      },
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function ThemePreviewSwatch({ label, preview }: Pick<ThemeOption, 'label' | 'preview'>) {
  return (
    <div
      aria-hidden="true"
      className="rounded-xl border p-3 shadow-sm"
      style={{ backgroundColor: preview.background, borderColor: preview.border }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <p
            className="text-[0.65rem] font-semibold uppercase tracking-[0.18em]"
            style={{ color: preview.muted }}
          >
            {label}
          </p>
          <p className="text-sm font-semibold" style={{ color: preview.text }}>
            Aa readable text
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <span
            className="size-3 rounded-full border"
            style={{ backgroundColor: preview.background, borderColor: preview.border }}
          />
          <span
            className="size-3 rounded-full border"
            style={{ backgroundColor: preview.card, borderColor: preview.border }}
          />
          <span className="size-3 rounded-full" style={{ backgroundColor: preview.text }} />
        </div>
      </div>

      <div className="mt-3 rounded-lg px-3 py-2" style={{ backgroundColor: preview.card }}>
        <p
          className="text-[0.65rem] font-semibold uppercase tracking-[0.18em]"
          style={{ color: preview.muted }}
        >
          Card surface
        </p>
        <p className="mt-1 text-sm font-semibold" style={{ color: preview.text }}>
          Snapshot preview
        </p>
      </div>
    </div>
  );
}

function ThemeOptionCard({
  checked,
  description,
  label,
  preview,
  value,
}: ThemeOption & {
  checked: boolean;
}) {
  const id = `theme-${value}`;

  return (
    <Label
      className={cn(
        'grid cursor-pointer gap-4 rounded-2xl border p-4 transition-colors',
        checked
          ? 'border-primary bg-secondary/70 shadow-sm'
          : 'border-border hover:border-primary/40 hover:bg-secondary/40',
      )}
      htmlFor={id}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <RadioGroupItem checked={checked} id={id} value={value} />
            <span className="text-base font-semibold text-foreground">{label}</span>
          </div>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        <span className="rounded-full border border-border/80 px-2 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          {checked ? 'Active' : 'Preview'}
        </span>
      </div>

      <ThemePreviewSwatch label={label} preview={preview} />
    </Label>
  );
}

export function SettingsPage() {
  const { setTheme, theme } = useThemeContext();
  const [storedSettings] = useState<SettingsFormState>(() => loadSettings());
  const [dashboardConfig, setDashboardConfig] = useState(storedSettings.dashboardConfig);
  const [draftNutritionTargets, setDraftNutritionTargets] = useState<
    SettingsFormState['nutritionTargets'] | null
  >(null);
  const [saveMessage, setSaveMessage] = useState('');
  const { data: currentTargets } = useNutritionTargets();
  const updateTargetsMutation = useUpdateTargets();
  const nutritionTargets =
    draftNutritionTargets ??
    (currentTargets
      ? {
          calories: currentTargets.calories,
          carbs: currentTargets.carbs,
          fat: currentTargets.fat,
          protein: currentTargets.protein,
        }
      : storedSettings.nutritionTargets);
  const settings: SettingsFormState = {
    dashboardConfig,
    nutritionTargets,
  };

  useEffect(() => {
    if (!saveMessage) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setSaveMessage('');
    }, 2400);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [saveMessage]);

  function handleThemeChange(nextValue: string) {
    if (!isTheme(nextValue)) {
      return;
    }

    setTheme(nextValue);
  }

  function handleNutritionTargetChange(
    field: keyof SettingsFormState['nutritionTargets'],
    value: string,
  ) {
    const parsedValue = Number(value);

    setSaveMessage('');
    setDraftNutritionTargets((currentTargetsState) => ({
      ...(currentTargetsState ?? nutritionTargets),
      [field]: Number.isNaN(parsedValue) || parsedValue < 0 ? 0 : parsedValue,
    }));
  }

  function toggleHabitChain(habitId: string, checked: boolean) {
    setSaveMessage('');
    setDashboardConfig((currentDashboardConfig) => ({
      ...currentDashboardConfig,
      habitChains: checked
        ? [...currentDashboardConfig.habitChains, habitId]
        : currentDashboardConfig.habitChains.filter((value) => value !== habitId),
    }));
  }

  function toggleTrendSparkline(
    metric: (typeof TREND_SPARKLINE_OPTIONS)[number],
    checked: boolean,
  ) {
    setSaveMessage('');
    setDashboardConfig((currentDashboardConfig) => ({
      ...currentDashboardConfig,
      trendSparklines: checked
        ? [...currentDashboardConfig.trendSparklines, metric]
        : currentDashboardConfig.trendSparklines.filter((value) => value !== metric),
    }));
  }

  async function handleSave() {
    const nextTargets: CreateNutritionTargetInput = {
      ...settings.nutritionTargets,
      effectiveDate: formatDateKey(new Date()),
    };

    try {
      window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // Local persistence is best-effort.
    }

    try {
      await updateTargetsMutation.mutateAsync(nextTargets);
    } catch {
      setSaveMessage(
        'Nutrition targets could not be saved right now. Dashboard preferences were saved locally.',
      );
      return;
    }

    setSaveMessage('Nutrition targets and dashboard preferences saved.');
  }

  return (
    <section className="mx-auto flex w-full max-w-6xl flex-col gap-6 pb-10">
      <BackLink />

      <header className="space-y-2">
        <h1 className="text-3xl font-semibold text-primary">Settings</h1>
        <p className="max-w-3xl text-sm text-muted">
          Manage the profile and appearance details that shape the Pulse experience across devices.
        </p>
      </header>

      <Card className="gap-4 border-border/70 shadow-sm">
        <CardHeader className="space-y-2">
          <CardTitle>
            <h2 className="text-xl font-semibold text-foreground">Profile</h2>
          </CardTitle>
          <CardDescription>
            Profile editing will land in a later phase. This placeholder keeps the future surface
            visible in the prototype.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Label className="text-sm font-medium text-foreground" htmlFor="display-name">
            Display name
          </Label>
          <Input id="display-name" placeholder="User" readOnly value="" />
          <p className="text-sm text-muted-foreground">
            Profile details are read-only in this prototype.
          </p>
        </CardContent>
      </Card>

      <Card className="gap-4 border-border/70 shadow-sm">
        <CardHeader className="space-y-2">
          <CardTitle>
            <h2 className="text-xl font-semibold text-foreground">Theme</h2>
          </CardTitle>
          <CardDescription>
            Choose how Pulse looks. Changes apply immediately and stay saved on this device.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <RadioGroup
            aria-label="Theme options"
            className="grid gap-3 lg:grid-cols-3"
            onValueChange={handleThemeChange}
            value={theme}
          >
            {THEME_OPTIONS.map((option) => (
              <ThemeOptionCard key={option.value} checked={theme === option.value} {...option} />
            ))}
          </RadioGroup>
          <p className="text-sm text-muted-foreground">
            Current theme: <span className="font-semibold text-foreground">{theme}</span>
          </p>
        </CardContent>
      </Card>

      <Card className="gap-4 border-border/70 shadow-sm">
        <CardHeader className="space-y-2">
          <CardTitle>
            <h2 className="text-xl font-semibold text-foreground">Nutrition Targets</h2>
          </CardTitle>
          <CardDescription>
            Set daily macro targets for the dashboard rings and nutrition summaries.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className="space-y-2">
            <Label className="text-sm font-medium text-foreground" htmlFor="target-calories">
              Daily calories
            </Label>
            <Input
              id="target-calories"
              min={0}
              onChange={(event) => handleNutritionTargetChange('calories', event.target.value)}
              step={1}
              type="number"
              value={settings.nutritionTargets.calories}
            />
            <p className="text-sm text-muted-foreground">Baseline energy target for each day.</p>
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium text-foreground" htmlFor="target-protein">
              Protein (g)
            </Label>
            <Input
              id="target-protein"
              min={0}
              onChange={(event) => handleNutritionTargetChange('protein', event.target.value)}
              step={1}
              type="number"
              value={settings.nutritionTargets.protein}
            />
            <p className="text-sm text-muted-foreground">Use grams for the daily protein goal.</p>
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium text-foreground" htmlFor="target-carbs">
              Carbs (g)
            </Label>
            <Input
              id="target-carbs"
              min={0}
              onChange={(event) => handleNutritionTargetChange('carbs', event.target.value)}
              step={1}
              type="number"
              value={settings.nutritionTargets.carbs}
            />
            <p className="text-sm text-muted-foreground">Carbohydrate target for daily fueling.</p>
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium text-foreground" htmlFor="target-fat">
              Fat (g)
            </Label>
            <Input
              id="target-fat"
              min={0}
              onChange={(event) => handleNutritionTargetChange('fat', event.target.value)}
              step={1}
              type="number"
              value={settings.nutritionTargets.fat}
            />
            <p className="text-sm text-muted-foreground">Fat target to round out macro balance.</p>
          </div>
        </CardContent>
      </Card>

      <Card className="gap-4 border-border/70 shadow-sm">
        <CardHeader className="space-y-2">
          <CardTitle>
            <h2 className="text-xl font-semibold text-foreground">Dashboard Configuration</h2>
          </CardTitle>
          <CardDescription>
            Choose which habit streaks and trend sparklines show up on the dashboard.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-3">
            <div className="space-y-1">
              <h3 className="text-base font-semibold text-foreground">Habit Chains</h3>
              <p className="text-sm text-muted-foreground">
                Select the habit streaks to spotlight in the daily dashboard snapshot.
              </p>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {HABIT_CHAIN_OPTIONS.map((habit) => {
                const checkboxId = `habit-chain-${habit.id}`;

                return (
                  <Label
                    key={habit.id}
                    className="flex cursor-pointer items-start gap-3 rounded-xl border border-border/80 p-3"
                    htmlFor={checkboxId}
                  >
                    <Checkbox
                      checked={settings.dashboardConfig.habitChains.includes(habit.id)}
                      id={checkboxId}
                      onCheckedChange={(checked) => toggleHabitChain(habit.id, checked === true)}
                    />
                    <div className="space-y-1">
                      <span className="text-sm font-medium text-foreground">{habit.label}</span>
                      <p className="text-sm text-muted-foreground">
                        Show this streak chain in the dashboard summary row.
                      </p>
                    </div>
                  </Label>
                );
              })}
            </div>
          </div>

          <div className="space-y-3">
            <div className="space-y-1">
              <h3 className="text-base font-semibold text-foreground">Trend Sparklines</h3>
              <p className="text-sm text-muted-foreground">
                Pick the quick-glance metrics that stay pinned to the dashboard.
              </p>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {TREND_SPARKLINE_OPTIONS.map((metric) => {
                const checkboxId = `trend-sparkline-${metric.toLowerCase()}`;

                return (
                  <Label
                    key={metric}
                    className="flex cursor-pointer items-start gap-3 rounded-xl border border-border/80 p-3"
                    htmlFor={checkboxId}
                  >
                    <Checkbox
                      checked={settings.dashboardConfig.trendSparklines.includes(metric)}
                      id={checkboxId}
                      onCheckedChange={(checked) => toggleTrendSparkline(metric, checked === true)}
                    />
                    <div className="space-y-1">
                      <span className="text-sm font-medium text-foreground">{metric}</span>
                      <p className="text-sm text-muted-foreground">
                        Keep the {metric.toLowerCase()} sparkline visible on the dashboard.
                      </p>
                    </div>
                  </Label>
                );
              })}
            </div>
          </div>

          <div className="flex flex-col gap-3 border-t border-border/80 pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p aria-live="polite" className="text-sm text-muted-foreground">
              {saveMessage || 'Save changes to keep these preferences on this device.'}
            </p>
            <Button disabled={updateTargetsMutation.isPending} onClick={handleSave} type="button">
              {updateTargetsMutation.isPending ? 'Saving...' : 'Save settings'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <HabitSettings />
    </section>
  );
}

export { DEFAULT_SETTINGS, SETTINGS_STORAGE_KEY };
