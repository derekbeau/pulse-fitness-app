import { ResourceGrid, mockResources } from '@/features/resources';
import { PreviewBanner } from '@/components/ui/preview-banner';

export function ResourcesPage() {
  return (
    <>
      <div className="mx-auto mb-6 w-full max-w-6xl">
        <PreviewBanner />
      </div>
      <ResourceGrid resources={mockResources} />
    </>
  );
}
