import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  bodyCapabilityDetailSchema,
  bodyConcernDetailSchema,
  bodyGuidanceDetailSchema,
  type JournalDetail,
} from '@pulse/shared';
import { Link } from 'react-router';
import { apiRequest, ApiError } from '@/lib/api-client';

type Reference = JournalDetail['observation']['sourceReferences'][number];
type BodyKind = 'body_concern' | 'capability' | 'guidance';
const bodyPath = (kind: BodyKind) =>
  kind === 'body_concern' ? 'concerns' : kind === 'capability' ? 'capabilities' : 'guidance';
const asRecord = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
const readable = (value: unknown) => (typeof value === 'string' ? value : null);

export function BodySourceAudit({
  kind,
  id,
  revisionId,
}: {
  kind: BodyKind;
  id: string;
  revisionId: string | null;
}) {
  const [open, setOpen] = useState(false);
  const query = useQuery({
    queryKey: ['body-source-audit', kind, id],
    enabled: open,
    queryFn: async ({ signal }) => {
      const raw = await apiRequest<unknown>(
        `/api/v1/body-context/${bodyPath(kind)}/${encodeURIComponent(id)}`,
        { signal },
      );
      if (kind === 'body_concern') return { kind, detail: bodyConcernDetailSchema.parse(raw) };
      if (kind === 'capability') return { kind, detail: bodyCapabilityDetailSchema.parse(raw) };
      return { kind, detail: bodyGuidanceDetailSchema.parse(raw) };
    },
    retry: (attempt, error) =>
      !(error instanceof ApiError && [400, 401, 404].includes(error.status)) && attempt < 2,
  });
  const value = query.data;
  const record = value
    ? value.kind === 'body_concern'
      ? value.detail.concern
      : value.kind === 'capability'
        ? value.detail.capability
        : value.detail.guidance
    : null;
  const history = value?.detail.revisions ?? [];
  const requestedRevision = revisionId ? history.find((item) => item.id === revisionId) : null;
  const snapshot = asRecord(requestedRevision?.snapshot);
  const historicalSource = asRecord(snapshot?.source);
  return (
    <div className="space-y-1" data-source-id={id}>
      <button
        type="button"
        aria-expanded={open}
        className="text-left text-primary underline focus-visible:outline-2 focus-visible:outline-primary"
        onClick={() => setOpen((current) => !current)}
      >
        Inspect {kind.replaceAll('_', ' ')} · {id}
      </button>
      <p className="text-xs">Referenced revision {revisionId ?? 'not recorded'}</p>
      {open && (
        <div className="rounded-lg border border-border p-3 text-sm">
          {query.isPending && <p role="status">Loading owned source…</p>}
          {query.isError && (
            <p role="alert">
              Source detail unavailable:{' '}
              {query.error instanceof Error ? query.error.message : 'read failed'}. Reference {kind}{' '}
              {id} · revision {revisionId ?? 'not recorded'} remains recorded.
            </p>
          )}
          {record && (
            <>
              <p>Current record · revision {record.currentRevisionId}</p>
              <p>
                Current provenance: {record.source.class.replaceAll('_', ' ')} ·{' '}
                {record.source.sourceLabel} · source {record.source.sourceId} · occurred{' '}
                {record.source.sourceOccurredAt ?? 'unknown'} · captured {record.source.capturedAt}
              </p>
              {revisionId && requestedRevision ? (
                <div data-revision-id={revisionId}>
                  <p>
                    Exact recorded revision {requestedRevision.revision} ·{' '}
                    {requestedRevision.createdAt}
                  </p>
                  <p>
                    Historical fact:{' '}
                    {readable(snapshot?.label) ??
                      readable(snapshot?.text) ??
                      'see immutable snapshot'}
                    {readable(snapshot?.symptomState)
                      ? ` · symptoms ${readable(snapshot?.symptomState)}`
                      : ''}
                    {readable(snapshot?.managementState)
                      ? ` · management ${readable(snapshot?.managementState)}`
                      : ''}
                    {readable(snapshot?.state) ? ` · state ${readable(snapshot?.state)}` : ''}
                  </p>
                  <p className="text-xs">
                    Historical provenance:{' '}
                    {readable(historicalSource?.class)?.replaceAll('_', ' ') ?? 'not recorded'} ·
                    source {readable(historicalSource?.sourceId) ?? 'not recorded'} · occurred{' '}
                    {readable(historicalSource?.sourceOccurredAt) ?? 'unknown'}
                  </p>
                  <details>
                    <summary className="cursor-pointer text-xs text-primary">
                      Raw immutable snapshot
                    </summary>
                    <pre className="overflow-auto whitespace-pre-wrap break-all text-xs">
                      {JSON.stringify(requestedRevision.snapshot, null, 2)}
                    </pre>
                  </details>
                </div>
              ) : (
                <p>
                  {revisionId
                    ? 'Referenced revision unavailable in this owned read; current content is not a historical snapshot.'
                    : 'No revision was supplied; current content is not a historical snapshot.'}
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export function RuntimeSourceLink({ reference }: { reference: Reference }) {
  if (
    reference.kind === 'body_concern' ||
    reference.kind === 'capability' ||
    reference.kind === 'guidance'
  )
    return (
      <BodySourceAudit kind={reference.kind} id={reference.id} revisionId={reference.revisionId} />
    );
  const href =
    reference.kind === 'activity'
      ? `/activity/${encodeURIComponent(reference.id)}`
      : reference.kind === 'activity_assignment' || reference.kind === 'activity_execution'
        ? `/activity?occurrence=${encodeURIComponent(reference.id)}`
        : reference.kind === 'journal_entry'
          ? `/journal/${encodeURIComponent(reference.id)}`
          : reference.kind === 'workout_session'
            ? `/workouts/session/${encodeURIComponent(reference.id)}`
            : reference.kind === 'scheduled_workout'
              ? `/workouts/scheduled/${encodeURIComponent(reference.id)}`
              : null;
  return href ? (
    <span className="block text-xs" data-source-id={reference.id}>
      <Link
        className="text-primary underline focus-visible:outline-2 focus-visible:outline-primary"
        to={href}
      >
        {reference.kind.replaceAll('_', ' ')} · {reference.id}
      </Link>{' '}
      · referenced revision {reference.revisionId} (destination may show current record)
    </span>
  ) : (
    <span className="block text-xs" data-source-id={reference.id}>
      {reference.kind.replaceAll('_', ' ')} · {reference.id} · revision {reference.revisionId}.
      Owned detail is unavailable here; no current content is asserted as historical fact.
    </span>
  );
}
