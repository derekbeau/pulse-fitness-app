import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type ChartRangeOption<TValue extends string> = {
  value: TValue;
  label: string;
};

type ChartRangeControlProps<TValue extends string> = {
  'aria-controls'?: string;
  className?: string;
  disabled?: boolean;
  label: string;
  onChange: (value: TValue) => void;
  options: readonly ChartRangeOption<TValue>[];
  statusText?: string;
  value: TValue;
};

export function ChartRangeControl<TValue extends string>({
  'aria-controls': ariaControls,
  className,
  disabled = false,
  label,
  onChange,
  options,
  statusText,
  value,
}: ChartRangeControlProps<TValue>) {
  return (
    <div className={cn('min-w-0', className)}>
      <div aria-label={label} className="flex flex-wrap gap-1" role="group">
        {options.map((option) => (
          <Button
            aria-controls={ariaControls}
            aria-pressed={option.value === value}
            className="min-h-11 min-w-11 rounded-full px-3"
            disabled={disabled}
            key={option.value}
            onClick={() => onChange(option.value)}
            type="button"
            variant={option.value === value ? 'default' : 'ghost'}
          >
            {option.label}
          </Button>
        ))}
      </div>
      {statusText ? (
        <p aria-live="polite" className="sr-only">
          {statusText}
        </p>
      ) : null}
    </div>
  );
}
