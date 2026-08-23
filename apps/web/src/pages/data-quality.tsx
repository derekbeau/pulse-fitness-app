import { ShieldCheck } from 'lucide-react';

import { PageHeader } from '@/components/layout/page-header';
import { DataQualityCalendarWorkspace } from '@/features/data-quality/components/data-quality-calendar-workspace';

export function DataQualityPage() {
  return (
    <main className="space-y-5">
      <PageHeader
        description="Audit what Pulse recorded, what is pending or excluded, and how each date affects coaching—without turning your data into a score."
        icon={
          <div className="rounded-2xl bg-primary/12 p-3 text-primary">
            <ShieldCheck aria-hidden="true" className="size-6" />
          </div>
        }
        title="Data Quality & Trust"
      />
      <DataQualityCalendarWorkspace />
    </main>
  );
}
