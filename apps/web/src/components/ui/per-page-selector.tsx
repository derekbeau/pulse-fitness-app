import { cn } from '@/lib/utils';
import { DEFAULT_PER_PAGE, PER_PAGE_OPTIONS } from './per-page-constants';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './select';

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
  const selectedValue = PER_PAGE_OPTIONS.includes(value as (typeof PER_PAGE_OPTIONS)[number])
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
        {PER_PAGE_OPTIONS.map((option) => (
          <SelectItem key={option} value={String(option)}>
            {`${option} / page`}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
