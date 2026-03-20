import { cn } from '@/lib/utils';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './select';

const perPageOptions = [10, 25, 50] as const;
const DEFAULT_PER_PAGE = 25;

type PerPageSelectorProps = {
  value: number;
  onChange: (value: number) => void;
  ariaLabel?: string;
  triggerClassName?: string;
};

export function PerPageSelector({
  value,
  onChange,
  ariaLabel = 'Items per page',
  triggerClassName,
}: PerPageSelectorProps) {
  const selectedValue = perPageOptions.includes(value as (typeof perPageOptions)[number])
    ? value
    : DEFAULT_PER_PAGE;

  return (
    <Select onValueChange={(nextValue) => onChange(Number(nextValue))} value={String(selectedValue)}>
      <SelectTrigger
        aria-label={ariaLabel}
        className={cn('h-9 min-h-9 w-[6.5rem] text-xs sm:text-sm', triggerClassName)}
      >
        <SelectValue>{`${selectedValue} / page`}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {perPageOptions.map((option) => (
          <SelectItem key={option} value={String(option)}>
            {`${option} / page`}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
