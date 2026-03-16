import { ScheduledWorkoutDetail } from '@/features/workouts/components/scheduled-workout-detail';
import { useParams } from 'react-router';

export function ScheduledWorkoutDetailPage() {
  const { id = '' } = useParams();

  return <ScheduledWorkoutDetail id={id} />;
}
