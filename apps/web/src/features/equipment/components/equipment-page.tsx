import { BackLink } from '@/components/layout/back-link';
import { equipmentLocations } from '../lib/mock-data';
import { LocationCard } from './location-card';

const totalItems = equipmentLocations.reduce(
  (count, location) => count + location.equipment.length,
  0,
);

export function EquipmentPage() {
  return (
    <section className="mx-auto flex w-full max-w-6xl flex-col gap-6 pb-10">
      <BackLink />

      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
            Profile inventory
          </p>
          <h1 className="text-3xl font-semibold text-primary">Equipment</h1>
          <p className="max-w-3xl text-sm text-muted">
            Keep a clear view of what is available in each training space before planning sessions
            or swapping exercises.
          </p>
        </div>

        <div className="rounded-2xl border border-border/70 bg-secondary/35 px-4 py-3 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
            Inventory summary
          </p>
          <p className="mt-1 text-sm font-medium text-foreground">
            {equipmentLocations.length} locations, {totalItems} total items
          </p>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2" data-testid="equipment-location-grid">
        {equipmentLocations.map((location) => (
          <LocationCard key={location.id} location={location} />
        ))}
      </div>
    </section>
  );
}
