import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ApiError } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { useSessionContext } from '../api/session-context';
import { projectWhatMattersToday } from '../lib/session-context-migration';

const XL_BREAKPOINT_QUERY = '(min-width: 1280px)';
export function SessionContext({
  className,
  sessionId,
}: {
  className?: string;
  sessionId: string | null;
}) {
  const [expanded, setExpanded] = useState(
    () =>
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia(XL_BREAKPOINT_QUERY).matches,
  );
  const query = useSessionContext(sessionId ?? '');
  const view = query.data ? projectWhatMattersToday(query.data) : null;
  return (
    <section
      aria-label="Session context"
      className={cn(
        'overflow-hidden rounded-3xl border border-border bg-card shadow-sm',
        className,
      )}
    >
      <button
        aria-controls="session-context-panel"
        aria-expanded={expanded}
        className="flex w-full items-center justify-between gap-4 px-5 py-5 text-left sm:px-6 focus-visible:outline-2 focus-visible:outline-primary"
        onClick={() => setExpanded((value) => !value)}
        type="button"
      >
        <span>
          <span className="block text-lg font-semibold">What matters today</span>
          <span className="block text-sm text-muted-foreground">
            Session-specific facts and gaps
          </span>
        </span>
        <ChevronDown className={cn('size-4', expanded && 'rotate-180')} />
      </button>
      <div
        id="session-context-panel"
        hidden={!expanded}
        className="space-y-5 border-t border-border p-5 sm:p-6"
      >
        {!sessionId && <p>Start a workout to load its context.</p>}
        {query.isPending && sessionId && <p role="status">Loading session context…</p>}
        {query.isError && (
          <div role="alert">
            <p>
              {query.error instanceof ApiError
                ? `${query.error.message} (${query.error.status}${query.error.code ? ` · ${query.error.code}` : ''})`
                : query.error instanceof Error
                  ? query.error.message
                  : 'Session context could not load.'}
            </p>
            <Button onClick={() => void query.refetch()} variant="outline">
              Try again
            </Button>
          </div>
        )}
        {view && (
          <>
            <p className="text-xs text-muted-foreground">
              {view.localDate} · {query.data?.timeZone}
            </p>
            <div className="grid gap-4 md:grid-cols-2">
              <section className="rounded-xl border p-4">
                <h3 className="font-semibold">Positive focus</h3>
                {view.focus.length ? (
                  <ul>
                    {view.focus.map((item) => (
                      <li key={item.id} data-record-id={item.id}>
                        {item.label} · {item.provenance.replaceAll('_', ' ')} ·{' '}
                        {item.freshness.state}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>Positive focus not recorded.</p>
                )}
              </section>
              <section className="rounded-xl border p-4">
                <h3 className="font-semibold">Relevant cautions</h3>
                {view.cautions.length ? (
                  <ul>
                    {view.cautions.map((item) => (
                      <li key={item.id} data-record-id={item.id}>
                        {item.label} · symptoms {item.symptomState} · management{' '}
                        {item.managementState} · {item.provenance.replaceAll('_', ' ')}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>
                    No relevant concern was identified from recorded evidence; this is not
                    clearance.
                  </p>
                )}
              </section>
              <section className="rounded-xl border p-4">
                <h3 className="font-semibold">Current guidance</h3>
                {view.guidance.length ? (
                  <ul>
                    {view.guidance.map((item) => (
                      <li key={item.id} data-record-id={item.id}>
                        {item.text} · {item.provenance.replaceAll('_', ' ')} ·{' '}
                        {item.freshness.state}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>No applicable guidance recorded.</p>
                )}
              </section>
              <section className="rounded-xl border p-4">
                <h3 className="font-semibold">Tracked, not relevant to this session</h3>
                {view.trackedIrrelevantConcerns.length ? (
                  <ul>
                    {view.trackedIrrelevantConcerns.map((item) => (
                      <li key={item.id} data-record-id={item.id}>
                        {item.label} · {item.symptomState} · {item.managementState}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>No other tracked concerns in this read.</p>
                )}
              </section>
              <section className="rounded-xl border p-4">
                <h3 className="font-semibold">Uncertain relevance</h3>
                {view.uncertainRelevanceConcerns.length ? (
                  <ul>
                    {view.uncertainRelevanceConcerns.map((item) => (
                      <li key={item.id} data-record-id={item.id}>
                        {item.label}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>No uncertain relevance flagged.</p>
                )}
                {view.unknownSessionExerciseSetIds.length > 0 && (
                  <p>
                    Missing muscle identity for {view.unknownSessionExerciseSetIds.length} set(s).
                  </p>
                )}
              </section>
              <section className="rounded-xl border p-4">
                <h3 className="font-semibold">Recorded workload</h3>
                <ul>
                  {view.workload.items.map((item) => (
                    <li
                      key={`${item.identityKind}:${item.identityId}`}
                      data-record-id={item.identityId}
                    >
                      {item.localDate} · {item.identityKind.replaceAll('_', ' ')} ·{' '}
                      {item.activityDurationMinutes === null
                        ? item.workoutDurationSeconds === null
                          ? 'duration unknown'
                          : `${item.workoutDurationSeconds} seconds`
                        : `${item.activityDurationMinutes} minutes`}
                    </li>
                  ))}
                </ul>
                {view.workload.items.length === 0 && <p>No actual load recorded in this window.</p>}
              </section>
            </div>
            <section>
              <h3 className="font-semibold">Missing inputs</h3>
              <p>
                {view.missingInputs.length
                  ? view.missingInputs.join(', ')
                  : 'None reported by this read.'}
              </p>
            </section>
            <section>
              <h3 className="font-semibold">Same-day co-occurrences</h3>
              <ul>
                {view.coOccurrences.map((item, index) => (
                  <li key={`${item.observationId}:${item.loadId}:${index}`}>
                    {item.localDate} · {item.observationKind} and {item.loadKind} · same local date
                    only
                  </li>
                ))}
              </ul>
              {view.coOccurrences.length === 0 && <p>None recorded.</p>}
            </section>
          </>
        )}
      </div>
    </section>
  );
}
