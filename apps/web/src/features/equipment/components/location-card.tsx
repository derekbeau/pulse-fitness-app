import { ChevronDown, Pencil, PlusCircle, Save, Trash2, X } from 'lucide-react';
import type { FormEvent } from 'react';
import { useId, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

import { equipmentCategoryMeta, equipmentCategoryOrder } from '../lib/mock-data';
import type { EquipmentCategory, EquipmentItem, EquipmentLocation } from '../types';

type LocationCardProps = {
  location: EquipmentLocation;
  onAddItem: (
    locationId: string,
    item: Pick<EquipmentItem, 'category' | 'details' | 'name'>,
  ) => void;
  onRemoveItem: (locationId: string, itemId: string) => void;
  onUpdateItem: (
    locationId: string,
    itemId: string,
    item: Pick<EquipmentItem, 'details' | 'name'>,
  ) => void;
};

export function LocationCard({
  location,
  onAddItem,
  onRemoveItem,
  onUpdateItem,
}: LocationCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isAddItemOpen, setIsAddItemOpen] = useState(false);
  const [itemName, setItemName] = useState('');
  const [itemCategory, setItemCategory] = useState<EquipmentCategory>('free-weights');
  const [itemDetails, setItemDetails] = useState('');
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [editingDetails, setEditingDetails] = useState('');
  const [pendingRemovalItem, setPendingRemovalItem] = useState<EquipmentItem | null>(null);
  const contentId = useId();
  const addItemNameId = useId();
  const addItemDetailsId = useId();
  const addItemCategoryId = useId();
  const groupedEquipment = groupEquipmentByCategory(location.equipment);

  function resetAddItemForm() {
    setItemName('');
    setItemCategory('free-weights');
    setItemDetails('');
  }

  function handleAddItemDialogChange(open: boolean) {
    setIsAddItemOpen(open);

    if (!open) {
      resetAddItemForm();
    }
  }

  function handleAddItemSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (itemName.trim().length === 0) {
      return;
    }

    onAddItem(location.id, {
      name: itemName,
      category: itemCategory,
      details: itemDetails,
    });
    handleAddItemDialogChange(false);
    setIsExpanded(true);
  }

  function handleEditStart(item: EquipmentItem) {
    setEditingItemId(item.id);
    setEditingName(item.name);
    setEditingDetails(item.details ?? '');
  }

  function handleEditCancel() {
    setEditingItemId(null);
    setEditingName('');
    setEditingDetails('');
  }

  function handleEditSave(itemId: string) {
    if (editingName.trim().length === 0) {
      return;
    }

    onUpdateItem(location.id, itemId, {
      name: editingName,
      details: editingDetails,
    });
    handleEditCancel();
  }

  function handleRemoveConfirm() {
    if (!pendingRemovalItem) {
      return;
    }

    onRemoveItem(location.id, pendingRemovalItem.id);

    if (editingItemId === pendingRemovalItem.id) {
      handleEditCancel();
    }

    setPendingRemovalItem(null);
  }

  return (
    <>
      <Card className="gap-0 overflow-hidden border-border/70 bg-card/95 py-0 shadow-sm">
        <button
          aria-controls={contentId}
          aria-expanded={isExpanded}
          className="flex w-full cursor-pointer flex-col gap-4 px-5 py-5 text-left transition-colors hover:bg-secondary/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
          type="button"
          onClick={() => setIsExpanded((current) => !current)}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-xl font-semibold text-foreground">{location.name}</h2>
                <Badge
                  className="rounded-full px-2.5 py-1 text-[0.65rem] uppercase tracking-[0.16em]"
                  variant="secondary"
                >
                  {location.equipment.length} items
                </Badge>
              </div>
              {location.notes ? <p className="text-sm text-muted">{location.notes}</p> : null}
            </div>

            <div className="flex items-center gap-2 rounded-full border border-border/70 bg-background/65 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              <span>{isExpanded ? 'Hide list' : 'View list'}</span>
              <ChevronDown
                aria-hidden="true"
                className={cn(
                  'size-4 transition-transform duration-200',
                  isExpanded && 'rotate-180',
                )}
              />
            </div>
          </div>
        </button>

        {isExpanded ? (
          <div className="border-t border-border/80 px-5 py-5" id={contentId}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">Manage inventory</p>
                <p className="text-xs text-muted-foreground">
                  Add items, refine notes, or remove tools from this location.
                </p>
              </div>

              <Button
                onClick={() => handleAddItemDialogChange(true)}
                type="button"
                variant="outline"
              >
                <PlusCircle aria-hidden="true" className="size-4" />
                Add Item
              </Button>
            </div>

            {groupedEquipment.length > 0 ? (
              <div className="mt-5 space-y-5">
                {groupedEquipment.map((group, index) => {
                  const Icon = equipmentCategoryMeta[group.category].icon;

                  return (
                    <div className="space-y-3" key={group.category}>
                      {index > 0 ? <Separator /> : null}

                      <div className="flex items-center gap-3 pt-1">
                        <div className="flex size-10 items-center justify-center rounded-2xl bg-secondary text-primary">
                          <Icon aria-hidden="true" className="size-4" />
                        </div>
                        <div>
                          <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-foreground">
                            {equipmentCategoryMeta[group.category].label}
                          </h3>
                          <p className="text-xs text-muted-foreground">
                            {group.items.length} {group.items.length === 1 ? 'item' : 'items'}
                          </p>
                        </div>
                      </div>

                      <ul className="space-y-2">
                        {group.items.map((item) => {
                          const isEditing = editingItemId === item.id;

                          return (
                            <li
                              className="rounded-2xl border border-border/60 bg-secondary/15 px-4 py-3"
                              key={item.id}
                            >
                              {isEditing ? (
                                <div className="space-y-3">
                                  <div className="space-y-2">
                                    <Label htmlFor={`${item.id}-name`}>Item name</Label>
                                    <Input
                                      id={`${item.id}-name`}
                                      onChange={(event) => setEditingName(event.target.value)}
                                      value={editingName}
                                    />
                                  </div>

                                  <div className="space-y-2">
                                    <Label htmlFor={`${item.id}-details`}>Details</Label>
                                    <Textarea
                                      id={`${item.id}-details`}
                                      onChange={(event) => setEditingDetails(event.target.value)}
                                      placeholder="Add setup notes, load range, or attachment details."
                                      value={editingDetails}
                                    />
                                  </div>

                                  <div className="flex flex-col gap-2 sm:flex-row">
                                    <Button
                                      disabled={editingName.trim().length === 0}
                                      onClick={() => handleEditSave(item.id)}
                                      type="button"
                                    >
                                      <Save aria-hidden="true" className="size-4" />
                                      Save
                                    </Button>
                                    <Button
                                      onClick={handleEditCancel}
                                      type="button"
                                      variant="outline"
                                    >
                                      <X aria-hidden="true" className="size-4" />
                                      Cancel
                                    </Button>
                                  </div>
                                </div>
                              ) : (
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0 space-y-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <p className="font-medium text-foreground">{item.name}</p>
                                      <Badge
                                        className="rounded-full px-2 py-0.5 text-[0.65rem]"
                                        variant="outline"
                                      >
                                        {equipmentCategoryMeta[item.category].label}
                                      </Badge>
                                    </div>
                                    {item.details ? (
                                      <p className="text-sm text-muted-foreground">
                                        {item.details}
                                      </p>
                                    ) : (
                                      <p className="text-sm text-muted-foreground">
                                        No details added yet.
                                      </p>
                                    )}
                                  </div>

                                  <div className="flex shrink-0 items-center gap-1">
                                    <Button
                                      aria-label={`Edit ${item.name}`}
                                      onClick={() => handleEditStart(item)}
                                      size="icon-xs"
                                      type="button"
                                      variant="ghost"
                                    >
                                      <Pencil aria-hidden="true" className="size-3.5" />
                                    </Button>
                                    <Button
                                      aria-label={`Remove ${item.name}`}
                                      onClick={() => setPendingRemovalItem(item)}
                                      size="icon-xs"
                                      type="button"
                                      variant="ghost"
                                    >
                                      <Trash2 aria-hidden="true" className="size-3.5" />
                                    </Button>
                                  </div>
                                </div>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="mt-5 rounded-2xl border border-dashed border-border/70 bg-secondary/10 px-4 py-6 text-center">
                <p className="font-medium text-foreground">No equipment added yet</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Use this card to track what is available in this location.
                </p>
              </div>
            )}
          </div>
        ) : null}
      </Card>

      <Dialog onOpenChange={handleAddItemDialogChange} open={isAddItemOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add equipment to {location.name}</DialogTitle>
            <DialogDescription>
              This updates local prototype state only and will reset on refresh.
            </DialogDescription>
          </DialogHeader>

          <form className="space-y-4" onSubmit={handleAddItemSubmit}>
            <div className="space-y-2">
              <Label htmlFor={addItemNameId}>Item name</Label>
              <Input
                id={addItemNameId}
                onChange={(event) => setItemName(event.target.value)}
                placeholder="Trap Bar"
                required
                value={itemName}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor={addItemCategoryId}>Category</Label>
              <Select
                onValueChange={(value) => setItemCategory(value as EquipmentCategory)}
                value={itemCategory}
              >
                <SelectTrigger aria-label="Equipment category" id={addItemCategoryId}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {equipmentCategoryOrder.map((category) => (
                    <SelectItem key={category} value={category}>
                      {equipmentCategoryMeta[category].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor={addItemDetailsId}>Details</Label>
              <Textarea
                id={addItemDetailsId}
                onChange={(event) => setItemDetails(event.target.value)}
                placeholder="Anything worth remembering about this piece of equipment."
                value={itemDetails}
              />
            </div>

            <DialogFooter>
              <Button
                onClick={() => handleAddItemDialogChange(false)}
                type="button"
                variant="outline"
              >
                Cancel
              </Button>
              <Button disabled={itemName.trim().length === 0} type="submit">
                Save item
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        onOpenChange={(open) => !open && setPendingRemovalItem(null)}
        open={pendingRemovalItem !== null}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {pendingRemovalItem ? `Remove ${pendingRemovalItem.name}?` : 'Remove item?'}
            </DialogTitle>
            <DialogDescription>
              This only updates local prototype state for the current session.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter>
            <Button onClick={() => setPendingRemovalItem(null)} type="button" variant="outline">
              Cancel
            </Button>
            <Button onClick={handleRemoveConfirm} type="button" variant="destructive">
              Remove item
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function groupEquipmentByCategory(items: EquipmentItem[]) {
  return equipmentCategoryOrder
    .map((category) => ({
      category,
      items: items.filter((item) => item.category === category),
    }))
    .filter((group) => group.items.length > 0);
}
