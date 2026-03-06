import { userSchema } from '@pulse/shared';

const demoUser = userSchema.parse({
  id: 'web-user',
  name: 'Pulse',
});

function App() {
  return (
    <main className="min-h-screen bg-background px-6 py-10 text-foreground font-sans">
      <section className="mx-auto max-w-2xl rounded-2xl border border-border bg-card p-6">
        <h1 className="text-3xl font-semibold text-primary">Hello {demoUser.name}</h1>
        <p className="mt-3 text-base text-muted">
          Tailwind v4 is wired with CSS-variable design tokens.
        </p>
      </section>
    </main>
  );
}

export default App;
