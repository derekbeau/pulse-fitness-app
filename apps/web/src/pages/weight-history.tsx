import { BackLink } from '@/components/layout/back-link';
import { HelpIcon } from '@/components/ui/help-icon';
import { WeightHistory } from '@/features/weight/components/weight-history';

export function WeightHistoryPage() {
  return (
    <main className="space-y-2">
      <BackLink label="Back to Dashboard" to="/" />
      <div className="flex items-center gap-2">
        <h1 className="text-3xl font-semibold text-primary">Weight History</h1>
        <HelpIcon title="Weight history help">
          <p>
            Weight tracking stores one entry per day. Saving again on the same day updates that day&apos;s
            value instead of creating duplicates.
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>The dashboard trend line uses an exponentially weighted moving average (EWMA).</li>
            <li>You can log weight manually in the app or ask your AI agent to log it.</li>
            <li>Use this history page to delete incorrect entries and keep your trend clean.</li>
          </ul>
        </HelpIcon>
      </div>
      <p className="max-w-2xl text-sm text-muted">
        Review your full body weight log and remove entries you no longer want to keep.
      </p>
      <WeightHistory />
    </main>
  );
}
