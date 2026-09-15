import { ArrowLeft, Pencil, RotateCcw, Trash2 } from 'lucide-react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';

import { PageHeader } from '@/components/layout/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useConfirmation } from '@/components/ui/confirmation-dialog';
import {
  useBodyCheckIn,
  useBodyCheckInHistory,
  useBodyDue,
  useBodyPreferences,
  useDeleteBodyCheckIn,
} from '@/features/body-progress/api/body-progress';
import {
  formatDateTime,
  formatLength,
  qualityLabel,
  siteLabel,
} from '@/features/body-progress/components/body-format';
import { GuidedCheckInForm } from '@/features/body-progress/components/guided-check-in-form';
import { ProtocolMedia } from '@/features/body-progress/components/protocol-media';

export function BodyCheckInDetailPage() {
  const { id = '' } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const detailQuery = useBodyCheckIn(id);
  const historyQuery = useBodyCheckInHistory(id);
  const preferencesQuery = useBodyPreferences();
  const dueQuery = useBodyDue();
  const deleteMutation = useDeleteBodyCheckIn();
  const { confirm, dialog } = useConfirmation();
  const entry = detailQuery.data;
  const editing = searchParams.get('edit') === '1';

  if (detailQuery.isPending || preferencesQuery.isPending || dueQuery.isPending)
    return (
      <main aria-busy="true" className="mx-auto w-full max-w-5xl space-y-5 py-5">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-72 w-full" />
      </main>
    );
  if (detailQuery.isError || !entry)
    return (
      <main className="mx-auto w-full max-w-5xl space-y-5 py-5">
        <PageHeader title="Body check-in" />
        <Card role="alert">
          <CardHeader>
            <CardTitle>Check-in could not be loaded</CardTitle>
            <CardDescription>It may have been deleted or the request failed.</CardDescription>
          </CardHeader>
          <CardContent className="flex gap-2">
            <Button onClick={() => void detailQuery.refetch()} variant="outline">
              Retry
            </Button>
            <Button asChild variant="ghost">
              <Link to="/body">Back to Body Progress</Link>
            </Button>
          </CardContent>
        </Card>
      </main>
    );

  if (editing && (preferencesQuery.isError || dueQuery.isError))
    return (
      <main className="mx-auto w-full max-w-5xl space-y-5 py-5">
        <PageHeader title="Correct body check-in" />
        <Card role="alert">
          <CardHeader>
            <CardTitle>Editing authority could not be loaded</CardTitle>
            <CardDescription>
              The current record remains unchanged. Retry before editing its server version.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              onClick={() => void Promise.all([preferencesQuery.refetch(), dueQuery.refetch()])}
              variant="outline"
            >
              Retry editing
            </Button>
          </CardContent>
        </Card>
      </main>
    );

  if (editing && preferencesQuery.data && dueQuery.data?.localDate)
    return (
      <main className="mx-auto w-full max-w-5xl space-y-5 py-5">
        <GuidedCheckInForm
          dueState={dueQuery.data.state}
          enabledSites={preferencesQuery.data.enabledSites}
          entry={entry}
          lengthUnit={preferencesQuery.data.lengthUnit}
          serverLocalDate={dueQuery.data.localDate}
        />
      </main>
    );

  const unit = preferencesQuery.data?.lengthUnit ?? entry.measurements[0]?.unitAtEntry ?? 'cm';
  const deleteEntry = () =>
    confirm({
      title: 'Delete this body check-in?',
      description:
        'This removes the check-in and its readings. It cannot be restored from the Body Progress UI.',
      confirmLabel: 'Delete check-in',
      onConfirm: async () => {
        await deleteMutation.mutateAsync(entry);
        navigate('/body');
      },
    });

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-5 py-5">
      {dialog}
      <PageHeader
        actions={
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link to="/body">
                <ArrowLeft aria-hidden="true" />
                Back
              </Link>
            </Button>
            <Button onClick={() => setSearchParams({ edit: '1' })}>
              <Pencil aria-hidden="true" />
              {entry.status === 'draft' ? 'Resume draft' : 'Correct'}
            </Button>
            <Button disabled={deleteMutation.isPending} onClick={deleteEntry} variant="destructive">
              <Trash2 aria-hidden="true" />
              Delete
            </Button>
          </div>
        }
        description={`${entry.status === 'draft' ? 'Saved draft' : 'Completed check-in'} · exact server version ${entry.version}`}
        title={entry.date}
      />

      <Card className="border-border/70">
        <CardHeader>
          <div className="flex flex-wrap gap-2">
            <Badge>{entry.status}</Badge>
            <Badge variant="outline">Version {entry.version}</Badge>
            <Badge variant="secondary">
              {entry.source === 'agent_token' ? 'Created by AgentToken' : 'Created in web app'}
            </Badge>
            {entry.correctedAt ? <Badge variant="outline">Corrected</Badge> : null}
          </div>
          <CardTitle>Context and provenance</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <dt className="text-muted-foreground">Local date and time</dt>
              <dd className="font-medium">
                {entry.date} at {entry.localTime ?? 'time not recorded'}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Meal / workout</dt>
              <dd className="font-medium">
                {entry.mealContext.replace('_', ' ')} · {entry.workoutContext.replace('_', ' ')}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Pump / unusual bloating</dt>
              <dd className="font-medium">
                {entry.pumpPresent === null
                  ? 'Not specified'
                  : entry.pumpPresent
                    ? 'Pump present'
                    : 'No pump'}{' '}
                ·{' '}
                {entry.unusualBloating === null
                  ? 'Not specified'
                  : entry.unusualBloating
                    ? 'Unusual bloating'
                    : 'No unusual bloating'}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Counts for cadence</dt>
              <dd className="font-medium">
                {entry.countAsScheduledOccurrence ? 'Yes' : 'No · extra log'}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Completed</dt>
              <dd className="font-medium">{formatDateTime(entry.completedAt)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Last corrected</dt>
              <dd className="font-medium">{formatDateTime(entry.correctedAt)}</dd>
            </div>
            {entry.notes ? (
              <div className="sm:col-span-2 lg:col-span-3">
                <dt className="text-muted-foreground">Notes</dt>
                <dd className="whitespace-pre-wrap font-medium">{entry.notes}</dd>
              </div>
            ) : null}
            {entry.correctionReason ? (
              <div className="sm:col-span-2 lg:col-span-3">
                <dt className="text-muted-foreground">Correction reason</dt>
                <dd className="font-medium">{entry.correctionReason}</dd>
              </div>
            ) : null}
          </dl>
        </CardContent>
      </Card>

      <Card className="min-w-0 border-border/70">
        <CardHeader>
          <CardTitle>Exact readings</CardTitle>
          <CardDescription>
            Every value includes its unit. Canonical and quality values came from server version{' '}
            {entry.version}.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {entry.measurements.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px] text-left text-sm">
                <caption className="sr-only">Raw and canonical body measurement readings</caption>
                <thead>
                  <tr className="border-b">
                    <th className="p-2">Site</th>
                    <th className="p-2">Reading 1</th>
                    <th className="p-2">Reading 2</th>
                    <th className="p-2">Reading 3</th>
                    <th className="p-2">Canonical</th>
                    <th className="p-2">Quality</th>
                  </tr>
                </thead>
                <tbody>
                  {entry.measurements.map((measurement) => (
                    <tr className="border-b border-border/60" key={measurement.id}>
                      <th className="p-2 font-medium">{siteLabel(measurement)}</th>
                      <td className="p-2">{formatLength(measurement.reading1Mm, unit)}</td>
                      <td className="p-2">
                        {measurement.reading2Mm === null
                          ? 'Not taken'
                          : formatLength(measurement.reading2Mm, unit)}
                      </td>
                      <td className="p-2">
                        {measurement.reading3Mm === null
                          ? 'Not taken'
                          : formatLength(measurement.reading3Mm, unit)}
                      </td>
                      <td className="p-2 font-semibold">
                        {formatLength(measurement.canonicalMm, unit)}
                      </td>
                      <td className="p-2">
                        {qualityLabel[measurement.quality]}
                        {measurement.selectedReadingPair
                          ? ` · readings ${measurement.selectedReadingPair.join(' + ')}`
                          : ''}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              This draft has context only and no measurement readings yet.
            </p>
          )}
        </CardContent>
      </Card>

      {entry.measurements.map((measurement) => (
        <Card className="border-border/70" key={`protocol-${measurement.id}`}>
          <CardHeader>
            <CardTitle>{siteLabel(measurement)}</CardTitle>
            <CardDescription>
              {measurement.protocolId} · {measurement.protocolVersion}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <ProtocolMedia site={measurement.site} />
            <p className="text-sm">{measurement.protocolInstructions}</p>
            <div className="flex flex-wrap gap-2">
              {measurement.protocolSourceUrls.map((url) => (
                <a
                  className="min-h-11 rounded-md px-2 py-3 text-sm text-primary underline"
                  href={url}
                  key={url}
                  rel="noreferrer"
                  target="_blank"
                >
                  Protocol source
                </a>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}

      <Card className="border-border/70">
        <CardHeader>
          <CardTitle>Correction history</CardTitle>
          <CardDescription>
            Immutable versions for this record. Current server version: {entry.version}.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {historyQuery.isPending ? (
            <Skeleton className="h-24 w-full" />
          ) : historyQuery.isError ? (
            <div role="alert">
              <p>
                Version history could not be loaded; the current check-in above is still available.
              </p>
              <Button
                className="mt-3"
                onClick={() => void historyQuery.refetch()}
                variant="outline"
              >
                Retry history
              </Button>
            </div>
          ) : (
            <ol className="space-y-2">
              {historyQuery.data?.versions.length ? (
                historyQuery.data.versions.map((version) => (
                  <li className="rounded-xl border border-border/70 p-3" key={version.id}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-medium">
                        Version {version.version} · {version.changeKind.replace('_', ' ')}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {formatDateTime(version.recordedAt)}
                      </p>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {version.changeReason} · {version.measurements.length} measurement sites ·
                      actor {version.actorSource === 'agent_token' ? 'AgentToken' : 'web user'}
                    </p>
                  </li>
                ))
              ) : (
                <li className="text-sm text-muted-foreground">No version snapshots returned.</li>
              )}
            </ol>
          )}
        </CardContent>
      </Card>

      {deleteMutation.isError ? (
        <div className="rounded-xl border border-destructive/40 p-3" role="alert">
          Delete failed. The check-in remains available.
        </div>
      ) : null}
      <Button
        onClick={() => void Promise.all([detailQuery.refetch(), historyQuery.refetch()])}
        variant="ghost"
      >
        <RotateCcw aria-hidden="true" />
        Refresh server versions
      </Button>
    </main>
  );
}
