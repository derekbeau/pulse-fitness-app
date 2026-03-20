import type { ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';

import { cn } from '@/lib/utils';

type PageHeaderProps = {
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
  description?: string;
  icon?: ReactNode;
  showBack?: boolean;
  title: ReactNode;
};

export function PageHeader({
  actions,
  children,
  className,
  description,
  icon,
  showBack = false,
  title,
}: PageHeaderProps) {
  return (
    <header className={cn('space-y-3', className)}>
      {showBack ? (
        <button
          className="inline-flex min-h-[44px] min-w-[44px] cursor-pointer items-center gap-1.5 rounded-md px-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
          data-slot="page-header-back-button"
          onClick={() => window.history.back()}
          type="button"
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          Back
        </button>
      ) : null}

      <div className="flex items-start justify-between gap-4" data-slot="page-header-main">
        <div className="flex min-w-0 items-center gap-3" data-slot="page-header-identity">
          {icon ? (
            <div className="shrink-0" data-slot="page-header-icon">
              {icon}
            </div>
          ) : null}
          <div className="space-y-1" data-slot="page-header-title-block">
            <h1 className="text-2xl font-semibold md:text-3xl">{title}</h1>
            {description ? (
              <p className="max-w-2xl text-sm text-muted-foreground">{description}</p>
            ) : null}
          </div>
        </div>

        {actions ? (
          <div className="flex shrink-0 items-center gap-2" data-slot="page-header-actions">
            {actions}
          </div>
        ) : null}
      </div>

      {children}
    </header>
  );
}
