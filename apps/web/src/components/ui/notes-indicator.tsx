import { useEffect, useMemo, useState } from 'react';
import { StickyNote } from 'lucide-react';

import { MarkdownNote } from '@/features/workouts/components/markdown-note';
import { cn } from '@/lib/utils';

import { Button } from './button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from './dialog';
import { Popover, PopoverContent, PopoverTrigger } from './popover';

type NotesIndicatorProps = {
  notes: string;
  className?: string;
};

const MOBILE_BREAKPOINT_QUERY = '(max-width: 767px)';

function useIsMobileViewport() {
  const mediaQueryList = useMemo(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return null;
    }

    return window.matchMedia(MOBILE_BREAKPOINT_QUERY);
  }, []);
  const [isMobileViewport, setIsMobileViewport] = useState(() => mediaQueryList?.matches ?? false);

  useEffect(() => {
    if (!mediaQueryList) {
      return;
    }

    const handleChange = (event: MediaQueryListEvent) => {
      setIsMobileViewport(event.matches);
    };

    mediaQueryList.addEventListener('change', handleChange);

    return () => {
      mediaQueryList.removeEventListener('change', handleChange);
    };
  }, [mediaQueryList]);

  return isMobileViewport;
}

export function NotesIndicator({ notes, className }: NotesIndicatorProps) {
  const isMobileViewport = useIsMobileViewport();
  const trigger = (
    <Button
      aria-label="View notes"
      className={cn(
        'h-7 w-7 p-0 text-muted-foreground hover:text-foreground',
        className,
      )}
      size="icon"
      type="button"
      variant="ghost"
    >
      <StickyNote className="size-3.5" />
    </Button>
  );

  if (isMobileViewport) {
    return (
      <Dialog>
        <DialogTrigger asChild>{trigger}</DialogTrigger>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Session notes</DialogTitle>
            <DialogDescription>Notes captured for this workout session.</DialogDescription>
          </DialogHeader>
          <MarkdownNote className="max-h-[60vh] overflow-y-auto text-sm text-foreground" content={notes} />
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Popover>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-3" sideOffset={6}>
        <MarkdownNote className="max-h-72 overflow-y-auto text-sm text-foreground" content={notes} />
      </PopoverContent>
    </Popover>
  );
}
