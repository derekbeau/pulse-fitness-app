import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/api-client';

type AuditPage = {
  items: { id: string; rawPayload: string; classification: string; receivedAt: number }[];
  total: number;
  hasMore: boolean;
};
export function FeedbackAudit({
  sessionId,
  userId,
  resource = 'workout-sessions',
}: {
  sessionId: string;
  userId: string;
  resource?: 'workout-sessions' | 'workout-templates' | 'scheduled-workouts' | 'exercises';
}) {
  const [open, setOpen] = useState(false);
  const [offset, setOffset] = useState(0);
  const query = useQuery({
    queryKey: ['workouts', 'feedback-audit', resource, userId, sessionId, offset],
    enabled: open,
    gcTime: 0,
    staleTime: 0,
    queryFn: () =>
      apiRequest<AuditPage>(
        `/api/v1/${resource}/${encodeURIComponent(sessionId)}/feedback-audit?offset=${offset}`,
      ),
  });
  return (
    <details onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary className="cursor-pointer text-sm font-medium">
        Original feedback audit — not coaching evidence
      </summary>
      {open ? (
        <div className="mt-3 space-y-3">
          <p className="text-sm text-muted">
            Original submissions and remediation history are retained for review. Unsupported
            ratings are not reported answers.
          </p>
          {query.isPending ? <p role="status">Loading private audit…</p> : null}
          {query.isError ? (
            <div role="alert">
              Unable to load audit.{' '}
              <button type="button" onClick={() => void query.refetch()}>
                Retry
              </button>
            </div>
          ) : null}
          {query.data?.items.map((item) => (
            <article
              key={`${item.id}:${item.receivedAt}`}
              className="rounded-lg border border-border p-3"
            >
              <p className="text-sm">{item.classification}</p>
              <pre className="mt-2 whitespace-pre-wrap break-all text-xs">{item.rawPayload}</pre>
            </article>
          ))}
          {query.data?.total === 0 ? <p>No retained audit entries.</p> : null}
          {offset > 0 ? (
            <button type="button" onClick={() => setOffset(Math.max(0, offset - 50))}>
              Previous audit page
            </button>
          ) : null}
          {query.data?.hasMore ? (
            <button type="button" onClick={() => setOffset(offset + 50)}>
              Next audit page
            </button>
          ) : null}
        </div>
      ) : null}
    </details>
  );
}

export function FeedbackNoteReviewNotice({
  reviews,
}: {
  reviews?: { id: string; reason: string }[];
}) {
  if (!reviews?.length) return null;
  return (
    <aside role="status" className="rounded-lg border border-border p-3 text-sm">
      <p>
        Some coaching notes need provenance review or have been superseded. These interpretations
        are not actionable training evidence.
      </p>
      <ul>
        {reviews.map((review) => (
          <li key={review.id}>{review.reason}</li>
        ))}
      </ul>
    </aside>
  );
}
