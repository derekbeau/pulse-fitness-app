import { useParams } from 'react-router';

import { SessionDetail } from '@/features/workouts';

export function WorkoutSessionDetailPage() {
  const { sessionId = '' } = useParams();

  return <SessionDetail sessionId={sessionId} />;
}
