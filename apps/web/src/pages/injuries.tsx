import { ConditionsList } from '@/features/injuries';
import { PreviewBanner } from '@/components/ui/preview-banner';

export function InjuriesPage() {
  return (
    <>
      <div className="mx-auto mb-6 w-full max-w-6xl">
        <PreviewBanner />
      </div>
      <ConditionsList />
    </>
  );
}
