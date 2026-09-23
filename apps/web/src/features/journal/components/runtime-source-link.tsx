import type { JournalDetail } from '@pulse/shared';
import { Link } from 'react-router';

type Reference = JournalDetail['observation']['sourceReferences'][number];
export function RuntimeSourceLink({ reference }: { reference: Reference }) {
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
    <Link
      className="text-primary underline focus-visible:outline-2 focus-visible:outline-primary"
      data-source-id={reference.id}
      to={href}
    >
      {reference.kind.replaceAll('_', ' ')} · {reference.id}
    </Link>
  ) : (
    <span data-source-id={reference.id}>
      {reference.kind.replaceAll('_', ' ')} · {reference.id} (source id)
    </span>
  );
}
