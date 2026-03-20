import { ScheduledWorkoutDetail } from '@/features/workouts/components/scheduled-workout-detail';
import { PageHeader } from '@/components/layout/page-header';
import { useParams } from 'react-router';

export function ScheduledWorkoutDetailPage() {
  const { id = '' } = useParams();

  return (
    <section className="space-y-4">
      <PageHeader showBack title="Scheduled Workout" />
      <ScheduledWorkoutDetail id={id} />
    </section>
  );
}
