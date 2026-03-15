import { useEffect, useState } from 'react';

import {
  DASHBOARD_WIDGET_IDS,
  type CreateNutritionTargetInput,
  type DashboardTrendMetric,
  type UpdateUserInput,
  type WeightUnit,
} from '@pulse/shared';
import { BackLink } from '@/components/layout/back-link';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { AgentTokensCard } from '@/features/settings/components/agent-tokens-card';
import { TrashManager } from '@/features/settings/components/trash-manager';
import { useHabits } from '@/features/habits/api/habits';
import { useNutritionTargets, useUpdateTargets } from '@/features/nutrition/api/targets';
import { useDashboardConfig, useSaveDashboardConfig } from '@/hooks/use-dashboard-config';
import { useUpdateUser, useUser } from '@/hooks/use-user';
import type { Theme } from '@/hooks/useTheme';
import { useThemeContext } from '@/hooks/useThemeContext';
import { formatUtcDateKey } from '@/lib/date';
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
const TREND_SPARKLINE_OPTIONS: Array<{
  description: string;
  id: DashboardTrendMetric;
  label: string;
}> = [
  {
    description: 'Track your recent body weight direction.',
    id: 'weight',
    label: 'Weight',
  },
  {
    description: 'Track your daily calorie intake trend.',
    id: 'calories',
    label: 'Calories',
  },
  {
    description: 'Track your daily protein intake trend.',
    id: 'protein',
    label: 'Protein',
  },
];

const DASHBOARD_WIDGET_DESCRIPTIONS: Record<keyof typeof DASHBOARD_WIDGET_IDS, string> = {
  'snapshot-cards': 'Daily body weight, macros, workout, and habit completion snapshot.',
  'macro-rings': 'Macro progress rings against your current daily targets.',
  'habit-chain': 'Streak chains for habits selected in this settings page.',
  'trend-sparklines': 'Compact trend charts for your chosen dashboard metrics.',
  'recent-workouts': 'Latest workout sessions with completion status and duration.',
  calendar: 'Date picker for navigating historical dashboard data.',
  'log-weight': 'Quick form to log body weight for the selected date.',
  'weight-trend': 'Detailed chart with raw scale and smoothed trend lines.',
};
const DASHBOARD_WIDGET_ENTRIES = Object.entries(DASHBOARD_WIDGET_IDS) as Array<
  [keyof typeof DASHBOARD_WIDGET_IDS, string]
>;

type SettingsFormState = {
  dashboardConfig: {
    habitChainIds: string[];
    trendMetrics: DashboardTrendMetric[];
    visibleWidgets: string[];
    widgetOrder?: string[];
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
    habitChainIds: [],
    trendMetrics: ['weight', 'calories', 'protein'],
    visibleWidgets: Object.keys(DASHBOARD_WIDGET_IDS),
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

    return {
      dashboardConfig: DEFAULT_SETTINGS.dashboardConfig,
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
        'grid cursor-pointer gap-3 rounded-2xl border p-3.5 transition-colors',
        checked
          ? 'border-primary bg-secondary/70 shadow-sm'
          : 'border-border hover:border-primary/40 hover:bg-secondary/40',
      )}
      htmlFor={id}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1.5">
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
  const { data: user } = useUser();
  const updateUserMutation = useUpdateUser();
  const [displayNameDraft, setDisplayNameDraft] = useState<string | null>(null);
  const [weightUnitDraft, setWeightUnitDraft] = useState<WeightUnit | null>(null);
  const [profileMessage, setProfileMessage] = useState('');
  const displayName = displayNameDraft ?? user?.name ?? '';
  const weightUnit = weightUnitDraft ?? user?.weightUnit ?? 'lbs';
  const isProfileDirty =
    (displayNameDraft !== null && displayName.trim() !== (user?.name ?? '')) ||
    (weightUnitDraft !== null && weightUnit !== (user?.weightUnit ?? 'lbs'));
  const [storedSettings] = useState<SettingsFormState>(() => loadSettings());
  const [dashboardConfigDraft, setDashboardConfigDraft] = useState<
    SettingsFormState['dashboardConfig'] | null
  >(null);
  const [draftNutritionTargets, setDraftNutritionTargets] = useState<
    SettingsFormState['nutritionTargets'] | null
  >(null);
  const [saveMessage, setSaveMessage] = useState('');
  const { data: habits = [] } = useHabits();
  const { data: persistedDashboardConfig } = useDashboardConfig();
  const saveDashboardConfigMutation = useSaveDashboardConfig();
  const { data: currentTargets } = useNutritionTargets();
  const updateTargetsMutation = useUpdateTargets();
  const dashboardConfig =
    dashboardConfigDraft ?? persistedDashboardConfig ?? DEFAULT_SETTINGS.dashboardConfig;
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

  useEffect(() => {
    if (!profileMessage) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setProfileMessage('');
    }, 2400);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [profileMessage]);

  async function handleProfileSave() {
    if (!isProfileDirty) {
      return;
    }

    const payload: UpdateUserInput = {};

    if (displayNameDraft !== null) {
      const nextName = displayName.trim();
      if (!nextName) {
        setProfileMessage('Display name cannot be empty.');
        return;
      }

      payload.name = nextName;
    }

    if (weightUnitDraft !== null) {
      payload.weightUnit = weightUnitDraft;
    }

    try {
      await updateUserMutation.mutateAsync(payload);
      setDisplayNameDraft(null);
      setWeightUnitDraft(null);
      setProfileMessage('Profile updated.');
    } catch {
      setProfileMessage('Could not save profile. Please try again.');
    }
  }

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
    setDashboardConfigDraft((currentDashboardConfig) => {
      const sourceConfig =
        currentDashboardConfig ?? persistedDashboardConfig ?? DEFAULT_SETTINGS.dashboardConfig;

      return {
        ...sourceConfig,
        habitChainIds: checked
          ? Array.from(new Set([...sourceConfig.habitChainIds, habitId]))
          : sourceConfig.habitChainIds.filter((value) => value !== habitId),
      };
    });
  }

  function toggleTrendSparkline(metric: DashboardTrendMetric, checked: boolean) {
    setSaveMessage('');
    setDashboardConfigDraft((currentDashboardConfig) => {
      const sourceConfig =
        currentDashboardConfig ?? persistedDashboardConfig ?? DEFAULT_SETTINGS.dashboardConfig;

      return {
        ...sourceConfig,
        trendMetrics: checked
          ? Array.from(new Set([...sourceConfig.trendMetrics, metric]))
          : sourceConfig.trendMetrics.filter((value) => value !== metric),
      };
    });
  }

  function toggleWidgetVisibility(widgetId: string, checked: boolean) {
    setSaveMessage('');
    setDashboardConfigDraft((currentDashboardConfig) => {
      const sourceConfig =
        currentDashboardConfig ?? persistedDashboardConfig ?? DEFAULT_SETTINGS.dashboardConfig;

      return {
        ...sourceConfig,
        visibleWidgets: checked
          ? Array.from(new Set([...sourceConfig.visibleWidgets, widgetId]))
          : sourceConfig.visibleWidgets.filter((value) => value !== widgetId),
      };
    });
  }

  async function handleSave() {
    const nextTargets: CreateNutritionTargetInput = {
      ...settings.nutritionTargets,
      effectiveDate: formatUtcDateKey(new Date()),
    };

    const [nutritionResult, dashboardConfigResult] = await Promise.allSettled([
      updateTargetsMutation.mutateAsync(nextTargets),
      saveDashboardConfigMutation.mutateAsync(settings.dashboardConfig),
    ]);

    if (nutritionResult.status === 'fulfilled') {
      setDraftNutritionTargets(null);
    }
    if (dashboardConfigResult.status === 'fulfilled') {
      setDashboardConfigDraft(null);
    }

    if (nutritionResult.status === 'fulfilled' && dashboardConfigResult.status === 'fulfilled') {
      setSaveMessage('Nutrition targets and dashboard preferences saved.');
      return;
    }

    if (nutritionResult.status === 'rejected' && dashboardConfigResult.status === 'rejected') {
      setSaveMessage(
        'Nutrition targets and dashboard preferences could not be saved right now. Please try again.',
      );
      return;
    }

    if (nutritionResult.status === 'rejected') {
      setSaveMessage(
        'Nutrition targets could not be saved right now. Dashboard preferences were saved.',
      );
      return;
    }

    setSaveMessage(
      'Dashboard preferences could not be saved right now. Nutrition targets were saved.',
    );
  }

  return (
    <section className="mx-auto flex w-full max-w-6xl flex-col gap-5 pb-8">
      <BackLink />

      <header className="space-y-1.5">
        <h1 className="text-3xl font-semibold text-primary">Settings</h1>
        <p className="max-w-3xl text-sm text-muted">
          Manage the profile and appearance details that shape the Pulse experience across devices.
        </p>
      </header>

      <Card className="gap-4 border-border/70 shadow-sm">
        <CardHeader className="space-y-1.5">
          <CardTitle>
            <h2 className="text-xl font-semibold text-foreground">Profile</h2>
          </CardTitle>
          <CardDescription>Update your display name and view account details.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            <Label className="text-sm font-medium text-foreground" htmlFor="display-name">
              Display name
            </Label>
            <Input
              id="display-name"
              onChange={(e) => {
                setDisplayNameDraft(e.target.value);
                setProfileMessage('');
              }}
              placeholder="Enter your name"
              value={displayName}
            />
          </div>

          {user?.username && (
            <div className="space-y-1">
              <p className="text-sm font-medium text-foreground">Username</p>
              <p className="text-sm text-muted-foreground">{user.username}</p>
            </div>
          )}

          {user?.createdAt && (
            <div className="space-y-1">
              <p className="text-sm font-medium text-foreground">Member since</p>
              <p className="text-sm text-muted-foreground">
                {new Intl.DateTimeFormat('en-US', {
                  month: 'long',
                  year: 'numeric',
                }).format(new Date(user.createdAt))}
              </p>
            </div>
          )}

          <div className="space-y-2">
            <p className="text-sm font-medium text-foreground">Weight unit</p>
            <RadioGroup
              aria-label="Weight unit"
              className="grid gap-2 sm:grid-cols-2"
              onValueChange={(value) => {
                if (value === 'lbs' || value === 'kg') {
                  setWeightUnitDraft(value);
                  setProfileMessage('');
                }
              }}
              value={weightUnit}
            >
              <Label
                className="flex cursor-pointer items-center gap-2 rounded-xl border border-border/80 p-2.5"
                htmlFor="weight-unit-lbs"
              >
                <RadioGroupItem id="weight-unit-lbs" value="lbs" />
                <span className="text-sm text-foreground">lbs</span>
              </Label>
              <Label
                className="flex cursor-pointer items-center gap-2 rounded-xl border border-border/80 p-2.5"
                htmlFor="weight-unit-kg"
              >
                <RadioGroupItem id="weight-unit-kg" value="kg" />
                <span className="text-sm text-foreground">kg</span>
              </Label>
            </RadioGroup>
          </div>

          <div className="flex flex-col gap-2.5 border-t border-border/80 pt-3 sm:flex-row sm:items-center sm:justify-between">
            <p aria-live="polite" className="text-sm text-muted-foreground">
              {profileMessage || '\u00A0'}
            </p>
            <Button
              disabled={updateUserMutation.isPending || !isProfileDirty}
              onClick={handleProfileSave}
              type="button"
            >
              {updateUserMutation.isPending ? 'Saving...' : 'Save profile'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <AgentTokensCard />

      <Card className="gap-4 border-border/70 shadow-sm">
        <CardHeader className="space-y-1.5">
          <CardTitle>
            <h2 className="text-xl font-semibold text-foreground">Theme</h2>
          </CardTitle>
          <CardDescription>
            Choose how Pulse looks. Changes apply immediately and stay saved on this device.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
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
        <CardHeader className="space-y-1.5">
          <CardTitle>
            <h2 className="text-xl font-semibold text-foreground">Nutrition Targets</h2>
          </CardTitle>
          <CardDescription>
            Set daily macro targets for the dashboard rings and nutrition summaries.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
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
        <CardHeader className="space-y-1.5">
          <CardTitle>
            <h2 className="text-xl font-semibold text-foreground">Dashboard Configuration</h2>
          </CardTitle>
          <CardDescription>
            Choose which habit streaks and trend sparklines show up on the dashboard.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2.5">
            <div className="space-y-1">
              <h3 className="text-base font-semibold text-foreground">Habit Chains</h3>
              <p className="text-sm text-muted-foreground">
                Select the habit streaks to spotlight in the daily dashboard snapshot.
              </p>
            </div>
            {habits.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No active habits yet. Create habits to customize chain visibility.
              </p>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {habits.map((habit) => {
                  const checkboxId = `habit-chain-${habit.id}`;

                  return (
                    <Label
                      key={habit.id}
                      className="flex cursor-pointer items-start gap-3 rounded-xl border border-border/80 p-2.5"
                      htmlFor={checkboxId}
                    >
                      <Checkbox
                        checked={settings.dashboardConfig.habitChainIds.includes(habit.id)}
                        id={checkboxId}
                        onCheckedChange={(checked) => toggleHabitChain(habit.id, checked === true)}
                      />
                      <div className="space-y-1">
                        <span className="text-sm font-medium text-foreground">{habit.name}</span>
                        <p className="text-sm text-muted-foreground">
                          Show this streak chain in the dashboard summary row.
                        </p>
                      </div>
                    </Label>
                  );
                })}
              </div>
            )}
          </div>

          <div className="space-y-2.5">
            <div className="space-y-1">
              <h3 className="text-base font-semibold text-foreground">Trend Sparklines</h3>
              <p className="text-sm text-muted-foreground">
                Pick the quick-glance metrics that stay pinned to the dashboard.
              </p>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {TREND_SPARKLINE_OPTIONS.map((metric) => {
                const checkboxId = `trend-sparkline-${metric.id}`;

                return (
                  <Label
                    key={metric.id}
                    className="flex cursor-pointer items-start gap-3 rounded-xl border border-border/80 p-2.5"
                    htmlFor={checkboxId}
                  >
                    <Checkbox
                      checked={settings.dashboardConfig.trendMetrics.includes(metric.id)}
                      id={checkboxId}
                      onCheckedChange={(checked) =>
                        toggleTrendSparkline(metric.id, checked === true)
                      }
                    />
                    <div className="space-y-1">
                      <span className="text-sm font-medium text-foreground">{metric.label}</span>
                      <p className="text-sm text-muted-foreground">{metric.description}</p>
                    </div>
                  </Label>
                );
              })}
            </div>
          </div>

          <div className="space-y-2.5">
            <div className="space-y-1">
              <h3 className="text-base font-semibold text-foreground">Widget Visibility</h3>
              <p className="text-sm text-muted-foreground">
                Show or hide dashboard widgets from settings.
              </p>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {DASHBOARD_WIDGET_ENTRIES.map(([widgetId, widgetName]) => {
                const checkboxId = `widget-visibility-${widgetId}`;

                return (
                  <Label
                    key={widgetId}
                    className="flex cursor-pointer items-start gap-3 rounded-xl border border-border/80 p-2.5"
                    htmlFor={checkboxId}
                  >
                    <Checkbox
                      checked={settings.dashboardConfig.visibleWidgets.includes(widgetId)}
                      id={checkboxId}
                      onCheckedChange={(checked) =>
                        toggleWidgetVisibility(widgetId, checked === true)
                      }
                    />
                    <div className="space-y-1">
                      <span className="text-sm font-medium text-foreground">{widgetName}</span>
                      <p className="text-sm text-muted-foreground">
                        {DASHBOARD_WIDGET_DESCRIPTIONS[widgetId]}
                      </p>
                    </div>
                  </Label>
                );
              })}
            </div>
          </div>

          <div className="flex flex-col gap-2.5 border-t border-border/80 pt-3 sm:flex-row sm:items-center sm:justify-between">
            <p aria-live="polite" className="text-sm text-muted-foreground">
              {saveMessage || 'Save changes to sync these preferences to your account.'}
            </p>
            <Button
              disabled={updateTargetsMutation.isPending || saveDashboardConfigMutation.isPending}
              onClick={handleSave}
              type="button"
            >
              {updateTargetsMutation.isPending || saveDashboardConfigMutation.isPending
                ? 'Saving...'
                : 'Save settings'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <TrashManager />
    </section>
  );
}

export { DEFAULT_SETTINGS, SETTINGS_STORAGE_KEY };
