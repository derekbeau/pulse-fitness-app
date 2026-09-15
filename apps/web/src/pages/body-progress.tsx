import { Activity, ArrowRight, History, Settings2 } from 'lucide-react';
import { Link, useSearchParams } from 'react-router';

import { PageHeader } from '@/components/layout/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useBodyCheckIns,
  useBodyDue,
  useBodyPreferences,
  useLegacyBodyMeasurements,
} from '@/features/body-progress/api/body-progress';
import { BodyDueCard } from '@/features/body-progress/components/body-due-card';
import {
  formatLength,
  qualityLabel,
  siteLabel,
} from '@/features/body-progress/components/body-format';
import { BodyPreferencesForm } from '@/features/body-progress/components/body-preferences-form';
import { GuidedCheckInForm } from '@/features/body-progress/components/guided-check-in-form';

export function BodyProgressPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const preferencesQuery = useBodyPreferences();
  const dueQuery = useBodyDue();
  const checkInsQuery = useBodyCheckIns();
  const legacyQuery = useLegacyBodyMeasurements();
  const showSetup = searchParams.get('setup') === '1' || preferencesQuery.data === null;
  const showCheckIn = searchParams.get('check-in') === '1';
  const checkIns = checkInsQuery.data?.data ?? [];
  const latestCompleted = checkIns.find((entry) => entry.status === 'completed');
  const activeDraft = checkIns.find((entry) => entry.status === 'draft');
  const lengthUnit = preferencesQuery.data?.lengthUnit ?? 'cm';

  if (preferencesQuery.isPending) {
    return (
      <main aria-busy="true" className="mx-auto w-full max-w-6xl space-y-5 py-5">
        <PageHeader title="Body Progress" />
        <Skeleton className="h-64 w-full rounded-2xl" />
        <Skeleton className="h-48 w-full rounded-2xl" />
      </main>
    );
  }

  if (preferencesQuery.isError) {
    return (
      <main className="mx-auto w-full max-w-6xl space-y-5 py-5">
        <PageHeader title="Body Progress" />
        <Card role="alert">
          <CardHeader>
            <CardTitle>Body Progress preferences could not be loaded</CardTitle>
            <CardDescription>No setup state or unit was guessed.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => void preferencesQuery.refetch()} variant="outline">
              Retry preferences
            </Button>
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main
      className="mx-auto flex w-full max-w-6xl flex-col gap-5 py-5"
      data-testid="body-progress-page"
    >
      <PageHeader
        actions={
          !showSetup && !showCheckIn ? (
            <Button onClick={() => setSearchParams({ setup: '1' })} variant="outline">
              <Settings2 aria-hidden="true" />
              Preferences
            </Button>
          ) : undefined
        }
        description="Standardized circumference check-ins with transparent raw readings and server-owned scheduling. Measurements show direction, not exact fat or muscle mass."
        title="Body Progress"
      />

      {showSetup ? <BodyPreferencesForm onSaved={() => setSearchParams({})} /> : null}
      {!showSetup && showCheckIn && preferencesQuery.data && dueQuery.data?.localDate ? (
        <GuidedCheckInForm
          dueState={dueQuery.data.state}
          enabledSites={preferencesQuery.data.enabledSites}
          lengthUnit={preferencesQuery.data.lengthUnit}
          serverLocalDate={dueQuery.data.localDate}
        />
      ) : null}
      {!showSetup && showCheckIn && (dueQuery.isPending || dueQuery.isError) ? (
        <BodyDueCard />
      ) : null}

      {!showSetup && !showCheckIn ? (
        <>
          <BodyDueCard />
          {activeDraft ? (
            <Card className="border-primary/35 bg-primary/5">
              <CardHeader>
                <CardTitle>Draft from {activeDraft.date}</CardTitle>
                <CardDescription>
                  Saved across devices with {activeDraft.measurements.length} measurement site
                  {activeDraft.measurements.length === 1 ? '' : 's'}.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button asChild>
                  <Link to={`/body/check-ins/${activeDraft.id}?edit=1`}>
                    Resume draft <ArrowRight aria-hidden="true" />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ) : null}
          <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
            <Card className="min-w-0 border-border/70">
              <CardHeader>
                <CardTitle>Latest completed check-in</CardTitle>
                <CardDescription>
                  Exact server-canonical values; open detail for all raw readings and protocol
                  provenance.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {checkInsQuery.isPending ? (
                  <Skeleton className="h-32 w-full" />
                ) : checkInsQuery.isError ? (
                  <div role="alert">
                    <p>History could not be loaded.</p>
                    <Button
                      className="mt-3"
                      onClick={() => void checkInsQuery.refetch()}
                      variant="outline"
                    >
                      Retry history
                    </Button>
                  </div>
                ) : latestCompleted && preferencesQuery.data ? (
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge>{latestCompleted.date}</Badge>
                      <Badge variant="outline">Complete</Badge>
                      {latestCompleted.source === 'agent_token' ? (
                        <Badge variant="secondary">Added by agent</Badge>
                      ) : null}
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[420px] text-left text-sm">
                        <caption className="sr-only">Latest Body Progress exact values</caption>
                        <thead>
                          <tr className="border-b">
                            <th className="p-2">Site</th>
                            <th className="p-2">Value</th>
                            <th className="p-2">Quality</th>
                          </tr>
                        </thead>
                        <tbody>
                          {latestCompleted.measurements.map((measurement) => (
                            <tr className="border-b border-border/50" key={measurement.id}>
                              <th className="p-2 font-medium">{siteLabel(measurement)}</th>
                              <td className="p-2">
                                {formatLength(measurement.canonicalMm, lengthUnit)}
                              </td>
                              <td className="p-2">{qualityLabel[measurement.quality]}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {!latestCompleted.measurements.some(
                      (measurement) => measurement.site === 'waist_iliac_crest_nhanes',
                    ) ? (
                      <p className="text-sm text-muted-foreground">
                        Waist was omitted, so future composition interpretation has less evidence.
                      </p>
                    ) : null}
                    <Button asChild variant="outline">
                      <Link to={`/body/check-ins/${latestCompleted.id}`}>View raw readings</Link>
                    </Button>
                  </div>
                ) : (
                  <EmptyState
                    icon={Activity}
                    title="No completed check-ins"
                    description="Complete a guided check-in to establish your first circumference baseline."
                    action={{
                      label: 'Start check-in',
                      onClick: () => setSearchParams({ 'check-in': '1' }),
                    }}
                  />
                )}
              </CardContent>
            </Card>

            <Card className="min-w-0 border-border/70">
              <CardHeader>
                <CardTitle>Check-in history</CardTitle>
                <CardDescription>
                  Newest first, including drafts, corrections, and AgentToken-created records.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {checkInsQuery.isPending ? (
                  <div className="space-y-2">
                    {[1, 2, 3].map((item) => (
                      <Skeleton className="h-16 w-full" key={item} />
                    ))}
                  </div>
                ) : checkIns.length ? (
                  <ol className="space-y-2">
                    {checkIns.map((entry) => (
                      <li key={entry.id}>
                        <Link
                          className="flex min-h-14 items-center justify-between gap-3 rounded-xl border border-border/70 p-3 transition-colors hover:bg-secondary/40 focus-visible:ring-2 focus-visible:ring-ring"
                          to={`/body/check-ins/${entry.id}`}
                        >
                          <span>
                            <span className="block font-medium">{entry.date}</span>
                            <span className="block text-sm text-muted-foreground">
                              {entry.measurements.length} sites · version {entry.version}
                              {entry.correctedAt ? ' · corrected' : ''}
                            </span>
                          </span>
                          <span className="flex flex-col items-end gap-1">
                            <Badge variant={entry.status === 'draft' ? 'secondary' : 'outline'}>
                              {entry.status}
                            </Badge>
                            {entry.measurements.some(
                              (measurement) => measurement.quality === 'high_variance',
                            ) ? (
                              <Badge variant="outline">High variance</Badge>
                            ) : null}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <div className="py-8 text-center">
                    <History
                      aria-hidden="true"
                      className="mx-auto mb-3 size-8 text-muted-foreground"
                    />
                    <p className="font-medium">History will appear here</p>
                    <p className="text-sm text-muted-foreground">
                      Drafts and completed check-ins share one chronological record.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <Card className="border-border/70">
            <CardHeader>
              <CardTitle>Historical measurements</CardTitle>
              <CardDescription>
                Compatibility records created before repeated Body Progress check-ins. These are
                scalar values only; Pulse does not invent raw repeats, protocols, or versions for
                them.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {legacyQuery.isPending ? (
                <Skeleton className="h-20 w-full" />
              ) : legacyQuery.isError ? (
                <p role="alert">
                  Historical scalar measurements could not be loaded. Current check-ins are still
                  available.
                </p>
              ) : legacyQuery.data?.length ? (
                <ul className="grid gap-2 sm:grid-cols-2">
                  {legacyQuery.data.map((entry) => (
                    <li className="rounded-xl border border-border/70 p-3" key={entry.id}>
                      <p className="font-medium">{entry.date}</p>
                      <p className="text-sm text-muted-foreground">
                        Legacy scalar record · no replicate or protocol provenance
                      </p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">No historical scalar measurements.</p>
              )}
            </CardContent>
          </Card>

          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setSearchParams({ 'check-in': '1' })}>New check-in</Button>
            <Button asChild variant="outline">
              <Link to="/weight/history">Open Trend Weight</Link>
            </Button>
          </div>
        </>
      ) : null}
    </main>
  );
}
