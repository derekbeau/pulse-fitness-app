import { useParams } from 'react-router';

import { PageHeader } from '@/components/layout/page-header';
import { SessionDetail } from '@/features/workouts';

export function WorkoutSessionDetailPage() {
  const { sessionId = '' } = useParams();

  return (
    <section className="space-y-6">
      <PageHeader backFallbackHref="/workouts?view=history" showBack title="Workout Session" />
      <SessionDetail sessionId={sessionId} />
    </section>
  );
}
