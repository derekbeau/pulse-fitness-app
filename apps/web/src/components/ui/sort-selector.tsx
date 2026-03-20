import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';

import { cn } from '@/lib/utils';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './select';

export type SortDirection = 'asc' | 'desc' | 'none';

export type SortOption = {
  value: string;
  label: string;
  direction?: SortDirection;
};

type SortSelectorProps = {
  options: SortOption[];
  value: string;
  onChange: (value: string) => void;
  ariaLabel?: string;
  className?: string;
  triggerClassName?: string;
};

const directionIconByValue: Record<SortDirection, typeof ArrowUpDown> = {
  asc: ArrowUp,
  desc: ArrowDown,
  none: ArrowUpDown,
};

export function SortSelector({
  options,
  value,
  onChange,
  ariaLabel = 'Sort',
  className,
  triggerClassName,
}: SortSelectorProps) {
  const selectedOption = options.find((option) => option.value === value);
  const selectedDirection = selectedOption?.direction ?? 'none';
  const SelectedDirectionIcon = directionIconByValue[selectedDirection];

  return (
    <Select onValueChange={onChange} value={value}>
      <SelectTrigger aria-label={ariaLabel} className={cn('min-h-[44px]', triggerClassName)}>
        <SelectValue>
          <span className={cn('inline-flex items-center gap-2', className)}>
            <SelectedDirectionIcon aria-hidden="true" className="size-4 text-muted-foreground" />
            <span>{selectedOption?.label ?? 'Sort'}</span>
          </span>
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => {
          const direction = option.direction ?? 'none';
          const DirectionIcon = directionIconByValue[direction];

          return (
            <SelectItem key={option.value} value={option.value}>
              <span className="inline-flex items-center gap-2">
                <DirectionIcon aria-hidden="true" className="size-4 text-muted-foreground" />
                <span>{option.label}</span>
              </span>
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}
