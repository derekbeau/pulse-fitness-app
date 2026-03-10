import { EquipmentPage } from '@/features/equipment';
import { PreviewBanner } from '@/components/ui/preview-banner';

export function EquipmentRoutePage() {
  return (
    <>
      <div className="mx-auto mb-6 w-full max-w-6xl">
        <PreviewBanner />
      </div>
      <EquipmentPage />
    </>
  );
}
