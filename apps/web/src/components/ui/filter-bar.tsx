import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

type FilterBarProps = {
  searchControl?: ReactNode;
  sortControl?: ReactNode;
  perPageControl?: ReactNode;
  viewToggle?: ReactNode;
  children?: ReactNode;
  className?: string;
};

export function FilterBar({
  searchControl,
  sortControl,
  perPageControl,
  viewToggle,
  children,
  className,
}: FilterBarProps) {
  return (
    <div
      className={cn(
        'flex flex-col gap-3 rounded-xl border border-border/60 bg-card p-3 sm:flex-row sm:flex-wrap sm:items-end',
        className,
      )}
    >
      {searchControl ? <div className="w-full sm:min-w-[16rem] sm:flex-1">{searchControl}</div> : null}
      {sortControl ? <div className="w-full sm:min-w-[12rem] sm:flex-1">{sortControl}</div> : null}
      {children}
      {perPageControl || viewToggle ? (
        <div className="flex w-full flex-col gap-3 sm:ml-auto sm:w-auto sm:flex-row sm:items-center">
          {perPageControl}
          {viewToggle}
        </div>
      ) : null}
    </div>
  );
}
