/* eslint-disable react-refresh/only-export-components */
import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const toggleVariants = cva(
  "inline-flex min-h-[36px] cursor-pointer items-center justify-center gap-2 rounded-md border text-sm font-medium transition-colors outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary text-primary-foreground hover:bg-primary/90',
        outline:
          'border-border bg-card text-card-foreground hover:bg-accent hover:text-accent-foreground',
      },
      size: {
        default: 'h-9 px-3',
        sm: 'h-8 px-2.5 text-xs',
        lg: 'h-10 px-4',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

type ToggleProps = Omit<React.ComponentProps<'button'>, 'onChange'> &
  VariantProps<typeof toggleVariants> & {
    onPressedChange?: (pressed: boolean) => void;
    pressed?: boolean;
  };

function Toggle({
  className,
  onPressedChange,
  pressed = false,
  size,
  type = 'button',
  variant,
  ...props
}: ToggleProps) {
  return (
    <button
      aria-pressed={pressed}
      className={cn(toggleVariants({ variant, size, className }))}
      data-slot="toggle"
      onClick={() => {
        onPressedChange?.(!pressed);
      }}
      type={type}
      {...props}
    />
  );
}

export { Toggle, toggleVariants };
