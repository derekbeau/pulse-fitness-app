import { userSchema } from '@pulse/shared';
import { Activity, Dumbbell, HeartPulse } from 'lucide-react';
import { useThemeContext } from '@/hooks/useThemeContext';
import { ProgressBar } from '@/components/ui/progress-bar';
import { ProgressRing } from '@/components/ui/progress-ring';
import { StatCard } from '@/components/ui/stat-card';
import { Button } from '@/components/ui/button';

const demoUser = userSchema.parse({
  id: 'web-user',
  name: 'Pulse',
});

function App() {
  const { theme, toggleTheme } = useThemeContext();

  return (
    <main className="min-h-screen bg-gradient-to-br from-background to-secondary px-6 py-10 text-foreground font-sans">
      <section className="mx-auto max-w-5xl space-y-6 rounded-2xl border border-border bg-card/95 p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h1 className="text-3xl font-semibold text-primary">Hello {demoUser.name}</h1>
          <Button type="button" onClick={toggleTheme}>
            Theme: {theme} (cycle)
          </Button>
        </div>
        <p className="mt-3 text-base text-muted">
          Tailwind v4 is wired with theme tokens and a persistent three-theme toggle.
        </p>
        <div className="grid gap-4 md:grid-cols-3">
          <StatCard
            icon={<Dumbbell className="size-4" />}
            label="Workouts This Week"
            trend={{ direction: 'up', value: 18 }}
            value={4}
          />
          <StatCard
            icon={<HeartPulse className="size-4" />}
            label="Avg Recovery"
            trend={{ direction: 'down', value: 6 }}
            value="72%"
          />
          <StatCard
            icon={<Activity className="size-4" />}
            label="Active Minutes"
            trend={{ direction: 'neutral', value: 0 }}
            value={340}
          />
        </div>
        <div className="grid gap-6 md:grid-cols-2">
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="mb-4 text-sm font-medium text-muted">Daily Macro Targets</p>
            <div className="flex flex-wrap items-center gap-4">
              <ProgressRing label="Protein" size={90} strokeWidth={10} value={76} />
              <ProgressRing
                color="var(--color-accent-pink)"
                label="Carbs"
                size={90}
                strokeWidth={10}
                value={58}
              />
              <ProgressRing
                color="var(--color-accent-mint)"
                label="Fat"
                size={90}
                strokeWidth={10}
                value={84}
              />
            </div>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="mb-4 text-sm font-medium text-muted">Habit Completion</p>
            <div className="space-y-4">
              <ProgressBar label="Hydration" max={8} showValue value={6} />
              <ProgressBar
                color="var(--color-accent-pink)"
                label="Sleep Goal"
                max={7}
                showValue
                value={5}
              />
              <ProgressBar
                color="var(--color-accent-mint)"
                label="Steps (x1k)"
                max={12}
                showValue
                value={9}
              />
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

export default App;
