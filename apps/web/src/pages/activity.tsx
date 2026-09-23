import { Activity as ActivityGlyph } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import {
  useActivities,
  useActivity,
  fetchActivity,
  fetchActivities,
} from '@/features/activity/api/activity';
import { ActivityRuntimeView } from '@/features/activity/components/activity-runtime-view';
import {
  usePlanChangeProposal,
  useProposalApprovalStatements,
} from '@/features/activity/api/proposal';
import { ApiError } from '@/lib/api-client';

function ErrorState({ error, retry }: { error: unknown; retry: () => void }) {
  const message =
    error instanceof ApiError
      ? `${error.message} (${error.status}${error.code ? ` · ${error.code}` : ''})`
      : error instanceof Error
        ? error.message
        : 'Activity could not load.';
  return (
    <div role="alert" className="rounded-xl border border-destructive p-5">
      <p>{message}</p>
      <Button variant="outline" onClick={retry}>
        Try again
      </Button>
    </div>
  );
}

export function ActivityPage() {
  const [params] = useSearchParams();
  const occurrence = params.get('occurrence');
  const [page, setPage] = useState(1);
  const list = useActivities(page);
  const resolved = useQuery({
    queryKey: ['activity-occurrence', occurrence],
    enabled: Boolean(occurrence),
    queryFn: async ({ signal }) => {
      let page = 1;
      let hasMore = true;
      while (hasMore) {
        const batch = await fetchActivities(page, signal);
        for (const item of batch.data) {
          if (item.recordType !== 'canonical') continue;
          const detail = await fetchActivity(item.activity.id, signal);
          if (
            detail.recordType === 'canonical' &&
            [...detail.assignments, ...detail.executions].some((entry) => entry.id === occurrence)
          )
            return detail.activity.id;
        }
        hasMore = page * batch.meta.limit < batch.meta.total;
        page++;
      }
      throw new Error('The selected occurrence was not found for this owner.');
    },
  });
  return (
    <section className="space-y-6">
      <PageHeader
        title="Activity"
        description="Assigned plans and recorded movement keep separate dates and identities."
        icon={
          <div className="rounded-2xl bg-primary/10 p-3 text-primary">
            <ActivityGlyph className="size-6" />
          </div>
        }
      />
      {list.isPending && <p role="status">Loading activities…</p>}
      {list.isError && <ErrorState error={list.error} retry={() => void list.refetch()} />}
      {resolved.isPending && occurrence && <p role="status">Resolving activity occurrence…</p>}
      {resolved.isError && (
        <ErrorState error={resolved.error} retry={() => void resolved.refetch()} />
      )}
      {resolved.data && <ActivityDetailContent id={resolved.data} occurrence={occurrence} />}
      {list.data && (
        <div className="space-y-3">
          {list.data.data.length === 0 ? (
            <p>No activities recorded.</p>
          ) : (
            list.data.data.map((item) =>
              item.recordType === 'canonical' ? (
                <Link
                  key={item.activity.id}
                  data-record-id={item.activity.id}
                  className="block rounded-xl border border-border bg-card p-4 focus-visible:outline-2 focus-visible:outline-primary"
                  to={`/activity/${encodeURIComponent(item.activity.id)}`}
                >
                  <h2 className="font-semibold">{item.activity.name}</h2>
                  <p className="text-sm text-muted-foreground">
                    Assigned: {item.latestPlannedLocalDate ?? 'none'} · Actual:{' '}
                    {item.latestActualLocalDate ?? 'none'}
                  </p>
                  <p className="text-xs">
                    {item.activity.source.class.replaceAll('_', ' ')} ·{' '}
                    {item.activity.source.uncertainty}
                  </p>
                </Link>
              ) : (
                <Link
                  key={item.id}
                  data-record-id={item.id}
                  className="block rounded-xl border border-border bg-card p-4"
                  to={`/activity/${encodeURIComponent(item.id)}`}
                >
                  <h2 className="font-semibold">{item.name}</h2>
                  <p>Legacy date only: {item.localDate} · provenance missing</p>
                </Link>
              ),
            )
          )}
          {list.data.meta.total > list.data.data.length && (
            <nav aria-label="Activity pages" className="flex items-center gap-3">
              <Button
                disabled={page === 1}
                onClick={() => setPage((value) => value - 1)}
                variant="outline"
              >
                Previous
              </Button>
              <span>
                Page {page} of {Math.ceil(list.data.meta.total / list.data.meta.limit)}
              </span>
              <Button
                disabled={page * list.data.meta.limit >= list.data.meta.total}
                onClick={() => setPage((value) => value + 1)}
                variant="outline"
              >
                Next
              </Button>
            </nav>
          )}
        </div>
      )}
    </section>
  );
}

export function ProposalReadback({ id }: { id: string }) {
  const query = usePlanChangeProposal(id);
  const statements = useProposalApprovalStatements(id);
  if (query.isPending) return <p role="status">Loading proposal…</p>;
  if (query.isError) return <ErrorState error={query.error} retry={() => void query.refetch()} />;
  const proposal = query.data;
  return (
    <section
      aria-label="Plan change proposal"
      data-proposal-id={proposal.id}
      className="space-y-2 rounded-xl border border-border bg-card p-4"
    >
      <h3 className="font-semibold">Plan change · {proposal.state}</h3>
      <p>{proposal.summary}</p>
      <p>Proposal revision {proposal.currentRevisionId}</p>
      <p>
        Proposed {proposal.proposedAt} by {proposal.proposedBy.kind} {proposal.proposedBy.id}
      </p>
      <ul>
        {proposal.effects.map((effect, index) => (
          <li key={index}>
            {effect.kind.replaceAll('_', ' ')} · {effect.plannedLocalDate}
          </li>
        ))}
      </ul>
      {proposal.approval ? (
        <div>
          <p>
            Approved by {proposal.approval.approvedBy.kind} {proposal.approval.approvedBy.id}
          </p>
          <p>
            Relayed by{' '}
            {proposal.approval.relayedBy
              ? `${proposal.approval.relayedBy.kind} ${proposal.approval.relayedBy.id}`
              : 'none'}
          </p>
          <p>
            Statement:{' '}
            {proposal.approval.approvalStatement?.statement ?? 'direct authenticated approval'}
          </p>
          {proposal.approval.approvalStatement && (
            <p>
              Statement source {proposal.approval.approvalStatement.sourceId} ·{' '}
              {proposal.approval.approvalStatement.sourceOccurredAt}
            </p>
          )}
          <p>
            Approved {proposal.approval.approvedAt} for revision{' '}
            {proposal.approval.proposalRevisionId}
          </p>
          <p>Executed: {proposal.execution ? proposal.execution.executedAt : 'not recorded'}</p>
        </div>
      ) : (
        <p>Approval pending; no plan effect executed.</p>
      )}
      <section aria-label="Captured approval statements" className="border-t border-border pt-3">
        <h4 className="font-semibold">Captured statements · audit only</h4>
        <p className="text-xs text-muted-foreground">
          Agent-recorded claims are not authenticated external speech or plan approval.
        </p>
        {statements.isPending && <p role="status">Loading captured statements…</p>}
        {statements.isError && (
          <div>
            <p>Statement audit unavailable; no statement list was returned.</p>
            <ErrorState error={statements.error} retry={() => void statements.refetch()} />
          </div>
        )}
        {statements.data &&
          (statements.data.statements.length ? (
            <ul className="space-y-3">
              {statements.data.statements.map((statement) => {
                const boundToCurrent =
                  statement.proposalRevisionId === proposal.currentRevisionId &&
                  statement.targetRevisionFingerprint === proposal.targetRevisionFingerprint;
                const usedForApproval = proposal.approval?.approvalStatementId === statement.id;
                return (
                  <li
                    key={statement.id}
                    data-statement-id={statement.id}
                    className="rounded-lg border p-3"
                  >
                    <p className="whitespace-pre-wrap">{statement.statement}</p>
                    <p>
                      {usedForApproval
                        ? 'Used for recorded relay approval'
                        : boundToCurrent
                          ? 'Captured for current revision; not approval'
                          : 'Superseded revision claim; not current approval'}
                    </p>
                    <p className="text-xs">
                      Source {statement.sourceId} · occurred {statement.sourceOccurredAt} · recorded{' '}
                      {statement.createdAt}
                    </p>
                    <p className="text-xs">
                      Recorded by {statement.recordedBy.kind} {statement.recordedBy.id} · proposal
                      revision {statement.proposalRevisionId} · target fingerprint{' '}
                      {statement.targetRevisionFingerprint}
                    </p>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p>No statement captured.</p>
          ))}
      </section>
    </section>
  );
}

function ActivityDetailContent({
  id,
  occurrence,
  proposalId,
}: {
  id: string;
  occurrence?: string | null;
  proposalId?: string | null;
}) {
  const query = useActivity(id);
  if (query.isPending) return <p role="status">Loading activity…</p>;
  if (query.isError) return <ErrorState error={query.error} retry={() => void query.refetch()} />;
  if (query.data.recordType === 'legacy_date_only')
    return (
      <article data-record-id={query.data.id} className="rounded-xl border p-5">
        <h2 className="text-xl font-semibold">{query.data.name}</h2>
        <p>Legacy date only: {query.data.localDate}. Provenance missing.</p>
        <p>{query.data.ambiguity}</p>
      </article>
    );
  const matches =
    !occurrence ||
    [...query.data.assignments, ...query.data.executions].some((item) => item.id === occurrence);
  return (
    <>
      {!matches && <p role="alert">Selected occurrence was not found on this activity.</p>}
      <ActivityRuntimeView detail={query.data} occurrenceId={occurrence} />
      {proposalId && <ProposalReadback id={proposalId} />}
    </>
  );
}

export function ActivityDetailPage() {
  const { id = '' } = useParams();
  const [params] = useSearchParams();
  return (
    <section className="space-y-6">
      <PageHeader
        title="Activity detail"
        description="Canonical assignment and execution history."
      />
      <ActivityDetailContent
        id={id}
        occurrence={params.get('occurrence')}
        proposalId={params.get('proposal')}
      />
    </section>
  );
}
