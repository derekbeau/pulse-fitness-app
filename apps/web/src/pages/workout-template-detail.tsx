import { WorkoutTemplateDetail } from '@/features/workouts';
import { useParams } from 'react-router';

export function WorkoutTemplateDetailPage() {
  const { templateId = '' } = useParams();

  return <WorkoutTemplateDetail templateId={templateId} />;
}
