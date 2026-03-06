import { userSchema } from '@pulse/shared';
import { useThemeContext } from '@/hooks/useThemeContext';
import { Button } from '@/components/ui/button';

const demoUser = userSchema.parse({
  id: 'web-user',
  name: 'Pulse',
});

function App() {
  const { theme, toggleTheme } = useThemeContext();

  return (
    <main className="min-h-screen bg-gradient-to-br from-background to-secondary px-6 py-10 text-foreground font-sans">
      <section className="mx-auto max-w-2xl rounded-2xl border border-border bg-card/95 p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h1 className="text-3xl font-semibold text-primary">Hello {demoUser.name}</h1>
          <Button type="button" onClick={toggleTheme}>
            Theme: {theme} (cycle)
          </Button>
        </div>
        <p className="mt-3 text-base text-muted">
          Tailwind v4 is wired with theme tokens and a persistent three-theme toggle.
        </p>
      </section>
    </main>
  );
}

export default App;
