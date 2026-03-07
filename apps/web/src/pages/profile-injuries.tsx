import { BackLink } from '@/components/layout/back-link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export function ProfileInjuriesPage() {
  return (
    <section className="mx-auto flex w-full max-w-4xl flex-col gap-6 pb-10">
      <BackLink />

      <header className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
          Profile setup
        </p>
        <h1 className="text-3xl font-semibold text-primary">Injuries</h1>
        <p className="max-w-3xl text-sm text-muted">
          Injury history, active conditions, and recovery context will live here. This placeholder
          keeps the profile route structure ready for the next build step.
        </p>
      </header>

      <Card className="border-border/70 shadow-sm">
        <CardHeader className="space-y-2">
          <CardTitle>Injury tracking placeholder</CardTitle>
          <CardDescription>
            Future iterations will add timelines, severity context, and linked recovery notes on
            this page.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Return to Profile to jump into other personal setup areas while this screen is still a
            stub.
          </p>
        </CardContent>
      </Card>
    </section>
  );
}
