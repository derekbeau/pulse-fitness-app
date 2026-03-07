import { BackLink } from '@/components/layout/back-link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export function ProfileEquipmentPage() {
  return (
    <section className="mx-auto flex w-full max-w-4xl flex-col gap-6 pb-10">
      <BackLink />

      <header className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
          Profile setup
        </p>
        <h1 className="text-3xl font-semibold text-primary">Equipment</h1>
        <p className="max-w-3xl text-sm text-muted">
          Equipment inventory, storage locations, and setup details land in the next prototype
          slice. This placeholder keeps the route and back-navigation in place.
        </p>
      </header>

      <Card className="border-border/70 shadow-sm">
        <CardHeader className="space-y-2">
          <CardTitle>Equipment inventory placeholder</CardTitle>
          <CardDescription>
            The full equipment experience will expand this route with inventory cards, locations,
            and edit flows.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Use the Profile hub to move between setup areas while the detailed UI is still being
            built.
          </p>
        </CardContent>
      </Card>
    </section>
  );
}
