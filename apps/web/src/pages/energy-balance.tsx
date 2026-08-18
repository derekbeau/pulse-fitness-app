import { ArrowLeft, Gauge } from 'lucide-react';
import { Link } from 'react-router';

import { PageHeader } from '@/components/layout/page-header';
import { EnergyBalanceWorkspace } from '@/features/adaptive-nutrition';

export function EnergyBalancePage() {
  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 pb-10" data-slot="energy-balance-page">
      <Link
        className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"
        to="/nutrition?view=coach"
      >
        <ArrowLeft aria-hidden="true" className="size-4" /> Nutrition Coach
      </Link>
      <PageHeader
        description="See how complete nutrition, trend weight, targets, and accepted check-ins shape your expenditure estimate."
        icon={
          <span className="grid size-11 place-items-center rounded-xl bg-primary/10 text-primary">
            <Gauge aria-hidden="true" className="size-5" />
          </span>
        }
        title="Energy Balance & Expenditure"
      />
      <EnergyBalanceWorkspace />
    </div>
  );
}
