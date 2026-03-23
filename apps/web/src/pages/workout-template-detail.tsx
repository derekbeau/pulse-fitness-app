import { WorkoutTemplateDetail } from '@/features/workouts';
import { PageHeader } from '@/components/layout/page-header';
import { useParams } from 'react-router';

export function WorkoutTemplateDetailPage() {
  const { templateId = '' } = useParams();

  return (
    <section className="space-y-6">
      <PageHeader title="Workout Template" />
      <WorkoutTemplateDetail templateId={templateId} />
    </section>
  );
}
