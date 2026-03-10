import type { LucideIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';

type EmptyStateProps = {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: {
    label: string;
    onClick: () => void;
  };
};

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <section
      className="flex min-h-72 flex-col items-center justify-center rounded-2xl border border-dashed border-border/70 bg-card/70 px-6 py-12 text-center shadow-sm"
      data-slot="empty-state"
    >
      <Icon aria-hidden="true" className="size-12 text-muted" />
      <h2 className="mt-5 text-xl font-semibold text-foreground">{title}</h2>
      <p className="mt-2 max-w-lg text-sm text-muted">{description}</p>
      {action ? (
        <Button className="mt-6" onClick={action.onClick} type="button">
          {action.label}
        </Button>
      ) : null}
    </section>
  );
}
