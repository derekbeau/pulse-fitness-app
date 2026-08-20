import { PageHeader } from '@/components/layout/page-header';
import { HelpIcon } from '@/components/ui/help-icon';
import { WeightHistory } from '@/features/weight/components/weight-history';

export function WeightHistoryPage() {
  return (
    <main className="space-y-2">
      <PageHeader
        actions={
          <HelpIcon title="Trend Weight help">
            <p>
              Weight tracking stores one entry per day. Saving again on the same day updates that
              day&apos;s value instead of creating duplicates.
            </p>
            <ul className="list-disc space-y-1 pl-5">
              <li>
                Product Trend Weight uses observations from the trailing 30 calendar days. With
                fewer than two measurements, Pulse labels the result as still learning.
              </li>
              <li>
                Use the range selector to zoom from the last 30 days out to your full history.
              </li>
              <li>You can log weight manually in the app or ask your AI agent to log it.</li>
              <li>Edit buttons let you correct a value or note without leaving the page.</li>
            </ul>
          </HelpIcon>
        }
        description="Separate daily scale changes from your smoothed direction, pace, goal context, and exact evidence."
        title="Trend Weight"
      />
      <WeightHistory />
    </main>
  );
}
