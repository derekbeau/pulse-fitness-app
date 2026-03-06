import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { HabitSettings } from '@/features/habits';
import type { Theme } from '@/hooks/useTheme';
import { useThemeContext } from '@/hooks/useThemeContext';
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

function isTheme(value: string): value is Theme {
  return THEME_OPTIONS.some((option) => option.value === value);
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

  function handleThemeChange(nextValue: string) {
    if (!isTheme(nextValue)) {
      return;
    }

    setTheme(nextValue);
  }

  return (
    <section className="mx-auto flex w-full max-w-6xl flex-col gap-6 pb-10">
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
          <Input
            id="display-name"
            placeholder="User"
            readOnly
            value=""
          />
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
              <ThemeOptionCard
                key={option.value}
                checked={theme === option.value}
                {...option}
              />
            ))}
          </RadioGroup>
          <p className="text-sm text-muted-foreground">
            Current theme: <span className="font-semibold text-foreground">{theme}</span>
          </p>
        </CardContent>
      </Card>

      <HabitSettings />
    </section>
  );
}
