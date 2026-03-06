import { userSchema } from '@pulse/shared';
import { useThemeContext } from '@/hooks/useThemeContext';

const demoUser = userSchema.parse({
  id: 'web-user',
  name: 'Pulse',
});

function App() {
  const { theme, toggleTheme } = useThemeContext();
  const nextThemeLabel = theme === 'dark' ? 'light' : 'dark';

  return (
    <main className="min-h-screen bg-gradient-to-br from-background to-secondary px-6 py-10 text-foreground font-sans">
      <section className="mx-auto max-w-2xl rounded-2xl border border-border bg-card/95 p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h1 className="text-3xl font-semibold text-primary">Hello {demoUser.name}</h1>
          <button
            type="button"
            onClick={toggleTheme}
            className="rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground transition hover:opacity-85"
          >
            Switch to {nextThemeLabel} theme
          </button>
        </div>
        <p className="mt-3 text-base text-muted">
          Tailwind v4 is wired with theme tokens and a persistent dark/light toggle.
        </p>
      </section>
    </main>
  );
}

export default App;
