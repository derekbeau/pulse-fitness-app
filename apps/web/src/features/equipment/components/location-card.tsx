import { ChevronDown } from 'lucide-react';
import { useId, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

import { equipmentCategoryMeta } from '../lib/mock-data';
import type { EquipmentCategory, EquipmentItem, EquipmentLocation } from '../types';

type LocationCardProps = {
  location: EquipmentLocation;
};

const categoryOrder: EquipmentCategory[] = [
  'free-weights',
  'machines',
  'cables',
  'cardio',
  'accessories',
];

export function LocationCard({ location }: LocationCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const contentId = useId();
  const groupedEquipment = groupEquipmentByCategory(location.equipment);

  return (
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
              className={cn('size-4 transition-transform duration-200', isExpanded && 'rotate-180')}
            />
          </div>
        </div>
      </button>

      {isExpanded ? (
        <div className="border-t border-border/80 px-5 py-5" id={contentId}>
          <div className="space-y-5">
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
                    {group.items.map((item) => (
                      <li
                        className="rounded-2xl border border-border/60 bg-secondary/15 px-4 py-3"
                        key={item.id}
                      >
                        <p className="font-medium text-foreground">{item.name}</p>
                        {item.details ? (
                          <p className="mt-1 text-sm text-muted-foreground">{item.details}</p>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </Card>
  );
}

function groupEquipmentByCategory(items: EquipmentItem[]) {
  return categoryOrder
    .map((category) => ({
      category,
      items: items.filter((item) => item.category === category),
    }))
    .filter((group) => group.items.length > 0);
}
