import { Link, useParams } from 'react-router';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { useJournalEntry } from '@/features/journal/api/journal';
import { RuntimeSourceLink } from '@/features/journal/components/runtime-source-link';
import { ApiError } from '@/lib/api-client';

export function JournalEntryPage() {
  const { entryId = '' } = useParams();
  const query = useJournalEntry(entryId);
  return (
    <section className="space-y-5">
      <PageHeader
        title="Journal observation"
        description="Recorded meaning, source, uncertainty, and history."
      />
      {query.isPending && <p role="status">Loading observation…</p>}
      {query.isError && (
        <div role="alert" className="rounded-xl border border-destructive p-4">
          <p>
            {query.error instanceof ApiError
              ? `${query.error.message} (${query.error.status})`
              : query.error instanceof Error
                ? query.error.message
                : 'Observation could not load.'}
          </p>
          <Button variant="outline" onClick={() => void query.refetch()}>
            Try again
          </Button>
        </div>
      )}
      {query.data && (
        <article
          data-record-id={query.data.observation.id}
          className="space-y-5 rounded-xl border border-border bg-card p-5"
        >
          <header>
            <h2 className="text-xl font-semibold">{query.data.observation.title}</h2>
            <p className="text-sm text-muted-foreground">
              {query.data.observation.localDate} · {query.data.observation.category}
            </p>
          </header>
          <p className="whitespace-pre-wrap">{query.data.observation.content}</p>
          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="font-semibold">Provenance</dt>
              <dd>{query.data.observation.source.class.replaceAll('_', ' ')}</dd>
            </div>
            <div>
              <dt className="font-semibold">Uncertainty</dt>
              <dd>{query.data.observation.source.uncertainty}</dd>
            </div>
            <div>
              <dt className="font-semibold">Freshness</dt>
              <dd>{query.data.observation.source.freshness.state}</dd>
            </div>
            <div>
              <dt className="font-semibold">Source</dt>
              <dd>{query.data.observation.source.sourceLabel}</dd>
            </div>
          </dl>
          <section aria-label="Source links">
            <h3 className="font-semibold">Source links</h3>
            <ul>
              {query.data.observation.sourceReferences.map((reference) => (
                <li key={`${reference.kind}:${reference.id}`}>
                  <RuntimeSourceLink reference={reference} />
                </li>
              ))}
            </ul>
          </section>
          <p className="text-xs text-muted-foreground">
            {query.data.history.length} recorded revision(s) · current{' '}
            {query.data.observation.currentRevisionId}
          </p>
          <details className="rounded-xl border border-border p-4">
            <summary className="cursor-pointer font-semibold">Revision history</summary>
            <ol className="mt-3 space-y-3">
              {query.data.history.map((item) => (
                <li key={item.id} className="border-t border-border pt-2">
                  <p className="text-sm">
                    Revision {item.revision} · {item.recordedAt} · {item.recordedBy.kind}
                    {item.reason ? ` · ${item.reason}` : ''}
                  </p>
                  <p className="font-medium">{item.observation.title}</p>
                  <p className="whitespace-pre-wrap text-sm">{item.observation.content}</p>
                  <p className="text-xs">
                    {item.observation.source.class.replaceAll('_', ' ')} ·{' '}
                    {item.observation.source.uncertainty}
                  </p>
                </li>
              ))}
            </ol>
          </details>
          <Link className="text-primary underline" to="/journal">
            All observations
          </Link>
        </article>
      )}
    </section>
  );
}
