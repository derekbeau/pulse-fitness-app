import { PlusCircle } from 'lucide-react';
import type { FormEvent } from 'react';
import { useId, useRef, useState } from 'react';

import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

import { equipmentLocations } from '../lib/mock-data';
import { LocationCard } from './location-card';
import type { EquipmentItem } from '../types';

type EquipmentItemInput = Pick<EquipmentItem, 'category' | 'details' | 'name'>;

const initialItemCount = equipmentLocations.reduce(
  (count, location) => count + location.equipment.length,
  0,
);

export function EquipmentPage() {
  const [locations, setLocations] = useState(equipmentLocations);
  const [isAddLocationOpen, setIsAddLocationOpen] = useState(false);
  const [locationName, setLocationName] = useState('');
  const [locationNotes, setLocationNotes] = useState('');
  const locationNameId = useId();
  const locationNotesId = useId();
  const nextLocationId = useRef(equipmentLocations.length + 1);
  const nextItemId = useRef(initialItemCount + 1);

  const totalItems = locations.reduce((count, location) => count + location.equipment.length, 0);

  function resetLocationForm() {
    setLocationName('');
    setLocationNotes('');
  }

  function handleLocationDialogChange(open: boolean) {
    setIsAddLocationOpen(open);

    if (!open) {
      resetLocationForm();
    }
  }

  function handleAddLocation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const name = locationName.trim();
    const notes = toOptionalText(locationNotes);

    if (name.length === 0) {
      return;
    }

    setLocations((currentLocations) => [
      ...currentLocations,
      {
        id: `custom-location-${nextLocationId.current++}`,
        name,
        notes,
        equipment: [],
      },
    ]);
    handleLocationDialogChange(false);
  }

  function handleAddItem(locationId: string, itemInput: EquipmentItemInput) {
    setLocations((currentLocations) =>
      currentLocations.map((location) =>
        location.id === locationId
          ? {
              ...location,
              equipment: [
                ...location.equipment,
                {
                  id: `custom-item-${nextItemId.current++}`,
                  name: itemInput.name.trim(),
                  category: itemInput.category,
                  details: toOptionalText(itemInput.details),
                },
              ],
            }
          : location,
      ),
    );
  }

  function handleUpdateItem(
    locationId: string,
    itemId: string,
    itemUpdate: Pick<EquipmentItem, 'details' | 'name'>,
  ) {
    setLocations((currentLocations) =>
      currentLocations.map((location) =>
        location.id === locationId
          ? {
              ...location,
              equipment: location.equipment.map((item) =>
                item.id === itemId
                  ? {
                      ...item,
                      name: itemUpdate.name.trim(),
                      details: toOptionalText(itemUpdate.details),
                    }
                  : item,
              ),
            }
          : location,
      ),
    );
  }

  function handleRemoveItem(locationId: string, itemId: string) {
    setLocations((currentLocations) =>
      currentLocations.map((location) =>
        location.id === locationId
          ? {
              ...location,
              equipment: location.equipment.filter((item) => item.id !== itemId),
            }
          : location,
      ),
    );
  }

  return (
    <>
      <section className="mx-auto flex w-full max-w-6xl flex-col gap-6 pb-10">
        <PageHeader
          actions={
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="rounded-2xl border border-border/70 bg-secondary/35 px-4 py-3 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
                  Inventory summary
                </p>
                <p className="mt-1 text-sm font-medium text-foreground">
                  {locations.length} locations, {totalItems} total items
                </p>
              </div>

              <Button
                className="w-full sm:w-auto"
                onClick={() => setIsAddLocationOpen(true)}
                type="button"
              >
                <PlusCircle aria-hidden="true" className="size-4" />
                Add Location
              </Button>
            </div>
          }
          description="Keep a clear view of what is available in each training space before planning sessions or swapping exercises."
          showBack
          title="Equipment"
        />

        <div
          className="grid grid-cols-1 gap-4 lg:grid-cols-2"
          data-testid="equipment-location-grid"
        >
          {locations.map((location) => (
            <LocationCard
              key={location.id}
              location={location}
              onAddItem={handleAddItem}
              onRemoveItem={handleRemoveItem}
              onUpdateItem={handleUpdateItem}
            />
          ))}
        </div>
      </section>

      <Dialog onOpenChange={handleLocationDialogChange} open={isAddLocationOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add a new training location</DialogTitle>
            <DialogDescription>
              Capture another gym, studio, or travel setup in the local prototype inventory.
            </DialogDescription>
          </DialogHeader>

          <form className="space-y-4" onSubmit={handleAddLocation}>
            <div className="space-y-2">
              <Label htmlFor={locationNameId}>Location name</Label>
              <Input
                id={locationNameId}
                onChange={(event) => setLocationName(event.target.value)}
                placeholder="Apartment gym"
                required
                value={locationName}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor={locationNotesId}>Notes</Label>
              <Textarea
                id={locationNotesId}
                onChange={(event) => setLocationNotes(event.target.value)}
                placeholder="Access rules, best times to train, or what this space is best for."
                value={locationNotes}
              />
            </div>

            <DialogFooter>
              <Button
                onClick={() => handleLocationDialogChange(false)}
                type="button"
                variant="outline"
              >
                Cancel
              </Button>
              <Button disabled={locationName.trim().length === 0} type="submit">
                Create location
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

function toOptionalText(value?: string) {
  const trimmedValue = value?.trim();

  return trimmedValue ? trimmedValue : undefined;
}
