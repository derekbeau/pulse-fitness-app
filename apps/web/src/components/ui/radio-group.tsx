import * as React from 'react';

import { cn } from '@/lib/utils';

type RadioGroupContextValue = {
  name: string;
  onValueChange?: (value: string) => void;
  value?: string;
};

const RadioGroupContext = React.createContext<RadioGroupContextValue | null>(null);

type RadioGroupProps = Omit<React.ComponentProps<'div'>, 'defaultValue' | 'onChange'> & {
  defaultValue?: string;
  name?: string;
  onValueChange?: (value: string) => void;
  value?: string;
};

const RadioGroup = React.forwardRef<HTMLDivElement, RadioGroupProps>(
  ({ children, className, defaultValue, name, onValueChange, value, ...props }, ref) => {
    const generatedName = React.useId();
    const isControlled = value !== undefined;
    const [internalValue, setInternalValue] = React.useState(defaultValue);

    const currentValue = isControlled ? value : internalValue;

    const contextValue = React.useMemo<RadioGroupContextValue>(
      () => ({
        name: name ?? generatedName,
        onValueChange: (nextValue) => {
          if (!isControlled) {
            setInternalValue(nextValue);
          }

          onValueChange?.(nextValue);
        },
        value: currentValue,
      }),
      [currentValue, generatedName, isControlled, name, onValueChange],
    );

    return (
      <RadioGroupContext.Provider value={contextValue}>
        <div
          ref={ref}
          className={cn('grid gap-2', className)}
          data-slot="radio-group"
          role="radiogroup"
          {...props}
        >
          {children}
        </div>
      </RadioGroupContext.Provider>
    );
  },
);

RadioGroup.displayName = 'RadioGroup';

type RadioGroupItemProps = Omit<React.ComponentProps<'input'>, 'name' | 'onChange' | 'type'> & {
  value: string;
};

const RadioGroupItem = React.forwardRef<HTMLInputElement, RadioGroupItemProps>(
  ({ checked, className, disabled, id, onBlur, onFocus, value, ...props }, ref) => {
    const context = React.useContext(RadioGroupContext);

    if (!context) {
      throw new Error('RadioGroupItem must be used within a RadioGroup');
    }

    const generatedId = React.useId();
    const inputId = id ?? generatedId;
    const isChecked = checked ?? context.value === value;

    return (
      <span
        className={cn(
          'relative inline-flex size-4 shrink-0 items-center justify-center',
          disabled ? 'opacity-50' : '',
          className,
        )}
      >
        <input
          ref={ref}
          checked={isChecked}
          className="peer sr-only"
          data-slot="radio-group-item"
          disabled={disabled}
          id={inputId}
          name={context.name}
          onBlur={onBlur}
          onChange={() => context.onValueChange?.(value)}
          onFocus={onFocus}
          type="radio"
          value={value}
          {...props}
        />
        <span
          aria-hidden="true"
          className={cn(
            'flex size-4 items-center justify-center rounded-full border border-border bg-background transition-colors peer-focus-visible:ring-[3px] peer-focus-visible:ring-ring/50',
            isChecked ? 'border-primary' : '',
          )}
        >
          <span
            className={cn(
              'size-2 rounded-full bg-primary transition-opacity',
              isChecked ? 'opacity-100' : 'opacity-0',
            )}
          />
        </span>
      </span>
    );
  },
);

RadioGroupItem.displayName = 'RadioGroupItem';

export { RadioGroup, RadioGroupItem };
