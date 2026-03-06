import { type ReactNode } from 'react';
import { CheckCircle2, Flame, Timer } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ProgressBar } from '@/components/ui/progress-bar';
import { ProgressRing } from '@/components/ui/progress-ring';
import { Separator } from '@/components/ui/separator';
import { StatCard } from '@/components/ui/stat-card';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useThemeContext } from '@/hooks/useThemeContext';
import type { Theme } from '@/hooks/useTheme';
import { cn } from '@/lib/utils';

const THEME_OPTIONS: Array<{ label: string; value: Theme }> = [
  { label: 'Light', value: 'light' },
  { label: 'Dark', value: 'dark' },
  { label: 'Midnight', value: 'midnight' },
];

const COLOR_TOKENS = [
  { name: '--color-background', label: 'Background' },
  { name: '--color-foreground', label: 'Foreground' },
  { name: '--color-card', label: 'Card' },
  { name: '--color-primary', label: 'Primary' },
  { name: '--color-secondary', label: 'Secondary' },
  { name: '--color-accent-cream', label: 'Accent Cream' },
  { name: '--color-accent-pink', label: 'Accent Pink' },
  { name: '--color-accent-mint', label: 'Accent Mint' },
  { name: '--color-muted', label: 'Muted' },
  { name: '--color-border', label: 'Border' },
] as const;

type ColorTokenName = (typeof COLOR_TOKENS)[number]['name'];

const EMPTY_TOKEN_VALUES = COLOR_TOKENS.reduce(
  (accumulator, token) => {
    accumulator[token.name] = 'N/A';
    return accumulator;
  },
  {} as Record<ColorTokenName, string>,
);

const toHex = (channel: number): string => {
  const clamped = Math.max(0, Math.min(255, Math.round(channel)));
  return clamped.toString(16).padStart(2, '0').toUpperCase();
};

const normalizeColorValue = (rawValue: string): string => {
  const value = rawValue.trim();

  if (!value) {
    return 'N/A';
  }

  if (value.startsWith('#')) {
    const hex = value.slice(1);

    if (hex.length === 3) {
      const expanded = hex
        .split('')
        .map((char) => `${char}${char}`)
        .join('');
      return `#${expanded.toUpperCase()}`;
    }

    if (hex.length === 6) {
      return `#${hex.toUpperCase()}`;
    }
  }

  if (value.startsWith('rgb')) {
    const channels = value.match(/\d+(\.\d+)?/g);

    if (channels && channels.length >= 3) {
      const [red, green, blue] = channels.slice(0, 3).map(Number);
      return `#${toHex(red)}${toHex(green)}${toHex(blue)}`;
    }
  }

  return value.toUpperCase();
};

const readResolvedTokenValues = (): Record<ColorTokenName, string> => {
  if (typeof window === 'undefined') {
    return EMPTY_TOKEN_VALUES;
  }

  const rootStyles = window.getComputedStyle(document.documentElement);

  return COLOR_TOKENS.reduce(
    (accumulator, token) => {
      accumulator[token.name] = normalizeColorValue(rootStyles.getPropertyValue(token.name));
      return accumulator;
    },
    {} as Record<ColorTokenName, string>,
  );
};

type SectionCardProps = {
  title: string;
  description: string;
  children: ReactNode;
  className?: string;
};

function SectionCard({ title, description, children, className }: SectionCardProps) {
  return (
    <Card className={cn('gap-4', className)}>
      <CardHeader className="space-y-1">
        <h2 className="text-lg font-semibold text-foreground">{title}</h2>
        <p className="text-sm text-muted">{description}</p>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export function DesignSystemPage() {
  const { theme, setTheme } = useThemeContext();
  const tokenValues = readResolvedTokenValues();

  return (
    <section className="mx-auto flex w-full max-w-7xl flex-col gap-6 pb-10">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold text-primary">Design System</h1>
        <p className="text-sm text-muted">
          Reference page for Pulse design tokens, shadcn primitives, and custom UI components.
        </p>
      </header>

      <Card className="gap-4">
        <CardHeader className="space-y-1">
          <CardTitle>Theme Switcher</CardTitle>
          <CardDescription>
            Switch themes live and preview all components in-context.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          {THEME_OPTIONS.map((option) => (
            <Button
              key={option.value}
              aria-pressed={theme === option.value}
              onClick={() => setTheme(option.value)}
              type="button"
              variant={theme === option.value ? 'default' : 'outline'}
            >
              {option.label}
            </Button>
          ))}
          <Badge variant="secondary">Current: {theme}</Badge>
        </CardContent>
      </Card>

      <Separator />

      <div className="grid gap-6 xl:grid-cols-2">
        <SectionCard
          className="xl:col-span-2"
          description="Core token palette with live values resolved from the active theme."
          title="Color Swatches"
        >
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {COLOR_TOKENS.map((token) => (
              <div key={token.name} className="space-y-2 rounded-lg border border-border p-3">
                <div
                  aria-label={`${token.name} swatch`}
                  className="h-16 rounded-md border border-border"
                  style={{ backgroundColor: `var(${token.name})` }}
                />
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-foreground">{token.label}</p>
                  <p className="font-mono text-[0.7rem] text-muted">{token.name}</p>
                  <p className="font-mono text-xs text-foreground">{tokenValues[token.name]}</p>
                </div>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard description="Headings, body copy, and utility text styles." title="Typography">
          <div className="space-y-3">
            <h1 className="text-3xl font-semibold tracking-tight">Heading 1</h1>
            <h2 className="text-2xl font-semibold tracking-tight">Heading 2</h2>
            <h3 className="text-xl font-semibold tracking-tight">Heading 3</h3>
            <h4 className="text-lg font-semibold tracking-tight">Heading 4</h4>
            <p className="text-base text-foreground">
              Body text for standard reading, descriptions, and chart context.
            </p>
            <p className="text-sm text-foreground">Small text for compact metadata.</p>
            <p className="text-sm text-muted">Muted text for tertiary information.</p>
          </div>
        </SectionCard>

        <SectionCard
          description="All shadcn button variants available in the system."
          title="Buttons"
        >
          <div className="flex flex-wrap items-center gap-3">
            <Button type="button">Default</Button>
            <Button type="button" variant="secondary">
              Secondary
            </Button>
            <Button type="button" variant="destructive">
              Destructive
            </Button>
            <Button type="button" variant="outline">
              Outline
            </Button>
            <Button type="button" variant="ghost">
              Ghost
            </Button>
            <Button type="button" variant="link">
              Link
            </Button>
          </div>
        </SectionCard>

        <SectionCard
          description="Example card anatomy with header, content, and footer."
          title="Cards"
        >
          <Card className="gap-4 bg-card">
            <CardHeader className="space-y-1">
              <CardTitle>Weekly Training Snapshot</CardTitle>
              <CardDescription>Structured card for summary content.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="text-sm text-foreground">
                Completed 4 of 5 planned workouts this week.
              </p>
              <p className="text-sm text-muted">Consistency remains above your 8-week average.</p>
            </CardContent>
            <CardFooter className="justify-end">
              <Button size="sm" type="button">
                View Details
              </Button>
            </CardFooter>
          </Card>
        </SectionCard>

        <SectionCard
          description="Standard text inputs, including disabled and labeled states."
          title="Inputs"
        >
          <div className="space-y-4">
            <Input placeholder="Standard text input" type="text" />
            <Input disabled placeholder="Disabled input" type="text" />
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground" htmlFor="input-with-label">
                Input with label
              </label>
              <Input id="input-with-label" placeholder="Session notes" type="text" />
            </div>
          </div>
        </SectionCard>

        <SectionCard
          description="Badge variants for status and metadata treatments."
          title="Badges"
        >
          <div className="flex flex-wrap items-center gap-2">
            <Badge>Default</Badge>
            <Badge variant="secondary">Secondary</Badge>
            <Badge variant="destructive">Destructive</Badge>
            <Badge variant="outline">Outline</Badge>
            <Badge variant="ghost">Ghost</Badge>
            <Badge variant="link">Link</Badge>
          </div>
        </SectionCard>

        <SectionCard
          description="Interactive dialog built from shadcn dialog primitives."
          title="Dialog"
        >
          <Dialog>
            <DialogTrigger asChild>
              <Button type="button" variant="secondary">
                Open Dialog
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Sample Dialog</DialogTitle>
                <DialogDescription>
                  Dialog content can hold forms, confirmations, and contextual actions.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter showCloseButton>
                <Button type="button">Save</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </SectionCard>

        <SectionCard
          description="Hover and focus affordance for compact contextual help."
          title="Tooltip"
        >
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button type="button" variant="outline">
                  Hover for tooltip
                </Button>
              </TooltipTrigger>
              <TooltipContent sideOffset={8}>Use tooltips for concise helper text.</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </SectionCard>

        <SectionCard
          description="Circular progress indicators at common completion points."
          title="Progress Ring"
        >
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div className="space-y-2 text-center">
              <ProgressRing color="var(--color-primary)" value={25} />
              <p className="text-xs text-muted">25%</p>
            </div>
            <div className="space-y-2 text-center">
              <ProgressRing color="var(--color-accent-cream)" value={50} />
              <p className="text-xs text-muted">50%</p>
            </div>
            <div className="space-y-2 text-center">
              <ProgressRing color="var(--color-accent-pink)" value={75} />
              <p className="text-xs text-muted">75%</p>
            </div>
            <div className="space-y-2 text-center">
              <ProgressRing color="var(--color-accent-mint)" value={100} />
              <p className="text-xs text-muted">100%</p>
            </div>
          </div>
        </SectionCard>

        <SectionCard
          description="Linear bars for task completion and measured goals."
          title="Progress Bar"
        >
          <div className="space-y-4">
            <ProgressBar label="Workout volume" max={100} showValue value={20} />
            <ProgressBar
              color="var(--color-accent-cream)"
              label="Protein target"
              max={100}
              showValue
              value={55}
            />
            <ProgressBar
              color="var(--color-accent-pink)"
              label="Sleep consistency"
              max={100}
              showValue
              value={80}
            />
            <ProgressBar
              color="var(--color-accent-mint)"
              label="Habit completion"
              max={100}
              showValue
              value={100}
            />
          </div>
        </SectionCard>

        <SectionCard
          className="xl:col-span-2"
          description="Example stat cards with up/down/neutral trend states."
          title="Stat Cards"
        >
          <div className="grid gap-4 md:grid-cols-3">
            <StatCard
              icon={<Flame className="size-4" />}
              label="Calories Burned"
              trend={{ direction: 'up', value: 12 }}
              value="2,180"
            />
            <StatCard
              icon={<Timer className="size-4" />}
              label="Avg Session Length"
              trend={{ direction: 'down', value: 4 }}
              value="47m"
            />
            <StatCard
              icon={<CheckCircle2 className="size-4" />}
              label="Habit Completion"
              trend={{ direction: 'neutral', value: 0 }}
              value="86%"
            />
          </div>
        </SectionCard>
      </div>
    </section>
  );
}
