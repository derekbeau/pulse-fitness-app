import { BackLink } from '@/components/layout/back-link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export function ProfileResourcesPage() {
  return (
    <section className="mx-auto flex w-full max-w-4xl flex-col gap-6 pb-10">
      <BackLink />

      <header className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
          Profile setup
        </p>
        <h1 className="text-3xl font-semibold text-primary">Resources</h1>
        <p className="max-w-3xl text-sm text-muted">
          Saved books, programs, and reference material will live here. This placeholder keeps the
          route available while the full library UI is still pending.
        </p>
      </header>

      <Card className="border-border/70 shadow-sm">
        <CardHeader className="space-y-2">
          <CardTitle>Resources library placeholder</CardTitle>
          <CardDescription>
            The finished version of this route will surface searchable resources and linked
            exercises.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Use the Profile hub as the parent destination for now.
          </p>
        </CardContent>
      </Card>
    </section>
  );
}
