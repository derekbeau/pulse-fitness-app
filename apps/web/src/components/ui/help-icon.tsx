import type { ReactNode } from 'react';
import { useState } from 'react';
import { CircleHelp } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { HelpModal } from '@/components/ui/help-modal';

type HelpIconProps = {
  title: string;
  children: ReactNode;
};

function HelpIcon({ title, children }: HelpIconProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        aria-label="Help"
        className="h-11 w-11 p-0 text-muted-foreground hover:text-foreground"
        onClick={() => setOpen(true)}
        type="button"
        variant="ghost"
      >
        <CircleHelp className="size-5" />
      </Button>
      <HelpModal onOpenChange={setOpen} open={open} title={title}>
        {children}
      </HelpModal>
    </>
  );
}

export { HelpIcon };
