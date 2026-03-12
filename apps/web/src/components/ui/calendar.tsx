import { ChevronLeft, ChevronRight } from 'lucide-react';
import * as React from 'react';
import { DayPicker } from 'react-day-picker';

import { cn } from '@/lib/utils';

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  ...props
}: React.ComponentProps<typeof DayPicker>) {
  return (
    <DayPicker
      className={cn('p-3', className)}
      classNames={{
        button_next:
          'inline-flex h-7 w-7 items-center justify-center rounded-md border border-border bg-background p-0 text-foreground hover:bg-accent hover:text-accent-foreground',
        button_previous:
          'inline-flex h-7 w-7 items-center justify-center rounded-md border border-border bg-background p-0 text-foreground hover:bg-accent hover:text-accent-foreground',
        caption_label: 'text-sm font-medium',
        day: 'h-9 w-9 p-0 text-center text-sm [&:has([aria-selected])]:bg-accent/50',
        day_button:
          'h-9 w-9 rounded-md p-0 text-sm font-normal hover:bg-accent hover:text-accent-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none',
        disabled: 'text-muted opacity-50',
        hidden: 'invisible',
        month: 'space-y-4',
        month_caption: 'flex items-center justify-center gap-1.5',
        months: 'flex flex-col sm:flex-row gap-4',
        nav: 'flex items-center gap-1',
        outside: 'text-muted opacity-50 aria-selected:bg-accent/40',
        selected:
          'bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground',
        today: 'bg-secondary text-secondary-foreground',
        weekday: 'w-9 text-xs font-medium text-muted',
        weekdays: 'flex',
        week: 'mt-2 flex w-full',
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation, className: iconClassName, ...iconProps }) =>
          orientation === 'left' ? (
            <ChevronLeft className={cn('h-4 w-4', iconClassName)} {...iconProps} />
          ) : (
            <ChevronRight className={cn('h-4 w-4', iconClassName)} {...iconProps} />
          ),
      }}
      showOutsideDays={showOutsideDays}
      {...props}
    />
  );
}

export { Calendar };
