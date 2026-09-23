import type { ActivityDetail } from '@pulse/shared';
import { Link } from 'react-router';

type Canonical = Extract<ActivityDetail, { recordType: 'canonical' }>;
export function ActivityRuntimeView({
  detail,
  occurrenceId,
}: {
  detail: Canonical;
  occurrenceId?: string | null;
}) {
  const { activity } = detail;
  return (
    <div className="space-y-6" data-record-id={activity.id}>
      <header className="rounded-2xl border border-border bg-card p-5">
        <h2 className="text-2xl font-semibold">{activity.name}</h2>
        <p className="text-sm text-muted-foreground">
          {activity.kind.replaceAll('_', ' ')} · {activity.source.class.replaceAll('_', ' ')} ·{' '}
          {activity.source.uncertainty}
        </p>
        <p className="text-sm">
          Source: {activity.source.sourceLabel} · {activity.source.freshness.state}
        </p>
      </header>
      <section aria-label="Planned assignments" className="space-y-2">
        <h3 className="text-lg font-semibold">Assigned</h3>
        {detail.assignments.length ? (
          detail.assignments.map((item) => (
            <article
              key={item.id}
              data-occurrence-id={item.id}
              className={`rounded-xl border p-4 ${occurrenceId === item.id ? 'border-primary bg-primary/10' : 'border-border'}`}
            >
              <p>
                Planned {item.plannedLocalDate} · {item.state}
              </p>
              <p className="text-xs text-muted-foreground">
                Assignment {item.id} · revision {item.revision}
              </p>
            </article>
          ))
        ) : (
          <p>No assignments recorded.</p>
        )}
      </section>
      <section aria-label="Actual executions" className="space-y-2">
        <h3 className="text-lg font-semibold">Actual</h3>
        {detail.executions.length ? (
          detail.executions.map((item) => (
            <article
              key={item.id}
              data-occurrence-id={item.id}
              className={`rounded-xl border p-4 ${occurrenceId === item.id ? 'border-primary bg-primary/10' : 'border-border'}`}
            >
              <p>
                Actual {item.actualLocalDate} · {item.outcome}
                {item.durationMinutes === null
                  ? ' · duration unknown'
                  : ` · ${item.durationMinutes} min`}
              </p>
              <p className="text-xs text-muted-foreground">
                Execution {item.id} · {item.source.class.replaceAll('_', ' ')} ·{' '}
                {item.source.uncertainty}
              </p>
            </article>
          ))
        ) : (
          <p>No execution recorded.</p>
        )}
      </section>
      <details className="rounded-xl border border-border bg-card p-4">
        <summary className="cursor-pointer font-semibold">Revision history</summary>
        <div className="mt-3 space-y-3 text-sm">
          <section>
            <h4 className="font-semibold">Activity revisions</h4>
            <ul>
              {detail.revisions.map((item) => (
                <li key={item.id}>
                  Revision {item.revision} · {item.changeKind} · {item.createdAt}
                  {item.reason ? ` · ${item.reason}` : ''}
                </li>
              ))}
            </ul>
          </section>
          <section>
            <h4 className="font-semibold">Assignment history</h4>
            <ul>
              {detail.assignmentHistory.map((item) => (
                <li key={`${item.id}:${item.revision}`}>
                  {item.id} · revision {item.revision} · planned {item.plannedLocalDate} ·{' '}
                  {item.state}
                </li>
              ))}
            </ul>
          </section>
          <section>
            <h4 className="font-semibold">Execution corrections</h4>
            {detail.executionCorrections.length ? (
              <ul>
                {detail.executionCorrections.map((item) => (
                  <li key={item.id}>
                    {item.record.id} · revision {item.revision} · {item.reason}
                  </li>
                ))}
              </ul>
            ) : (
              <p>No execution corrections recorded.</p>
            )}
          </section>
        </div>
      </details>
      {detail.sourceLinks.length > 0 && (
        <section aria-label="Source links">
          <h3 className="font-semibold">Linked records</h3>
          <ul>
            {detail.sourceLinks.map((link) => (
              <li key={link.id}>
                <Link
                  className="text-primary underline"
                  to={
                    link.target.kind === 'activity'
                      ? `/activity/${encodeURIComponent(link.target.id)}`
                      : link.target.kind === 'workout_session'
                        ? `/workouts/session/${encodeURIComponent(link.target.id)}`
                        : `/workouts/scheduled/${encodeURIComponent(link.target.id)}`
                  }
                >
                  {link.target.kind.replaceAll('_', ' ')} · {link.target.id}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      <Link className="text-primary underline" to="/activity">
        All activities
      </Link>
    </div>
  );
}
