import type { ReactNode } from 'react';
import { ArrowUpDown } from 'lucide-react';

import { cn } from '@/lib/utils';

import { Skeleton } from './skeleton';

export type Column<T> = {
  key: string;
  header: string;
  accessor: (row: T) => ReactNode;
  sortable?: boolean;
  className?: string;
};

type DataTableProps<T> = {
  columns: Column<T>[];
  data: T[];
  isLoading?: boolean;
  emptyMessage?: string;
  onSort?: (columnKey: string) => void;
  onRowClick?: (row: T) => void;
};

const DEFAULT_EMPTY_MESSAGE = 'No results found.';
const SKELETON_ROW_COUNT = 5;

function getRowKey<T>(row: T, index: number) {
  if (typeof row === 'object' && row !== null && 'id' in row) {
    const maybeId = (row as { id?: unknown }).id;
    if (typeof maybeId === 'string' || typeof maybeId === 'number') {
      return maybeId;
    }
  }

  return index;
}

export function DataTable<T>({
  columns,
  data,
  isLoading = false,
  emptyMessage = DEFAULT_EMPTY_MESSAGE,
  onSort,
  onRowClick,
}: DataTableProps<T>) {
  return (
    <div className="w-full overflow-x-auto rounded-xl border border-border/70">
      <table className="min-w-full border-collapse text-sm">
        <thead className="sticky top-0 z-10 bg-card">
          <tr className="border-b border-border/70">
            {columns.map((column) => (
              <th
                className={cn(
                  'px-4 py-3 text-left text-xs font-semibold tracking-wide text-muted-foreground uppercase',
                  column.className,
                )}
                key={column.key}
                scope="col"
              >
                {column.sortable && onSort ? (
                  <button
                    className="inline-flex items-center gap-1.5 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={() => onSort(column.key)}
                    type="button"
                  >
                    {column.header}
                    <ArrowUpDown aria-hidden="true" className="size-3.5" />
                  </button>
                ) : (
                  <span className="inline-flex items-center gap-1.5">{column.header}</span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {isLoading
            ? Array.from({ length: SKELETON_ROW_COUNT }).map((_, rowIndex) => (
                <tr className="border-b border-border/50 last:border-0" key={`skeleton-${rowIndex}`}>
                  {columns.map((column) => (
                    <td className={cn('px-4 py-3 align-middle', column.className)} key={column.key}>
                      <Skeleton className="h-4 w-full max-w-[11rem]" />
                    </td>
                  ))}
                </tr>
              ))
            : null}

          {!isLoading && data.length === 0 ? (
            <tr>
              <td className="px-4 py-10 text-center text-sm text-muted-foreground" colSpan={columns.length}>
                {emptyMessage}
              </td>
            </tr>
          ) : null}

          {!isLoading
            ? data.map((row, rowIndex) => {
                const clickable = typeof onRowClick === 'function';
                return (
                  <tr
                    className={cn(
                      'border-b border-border/50 last:border-0',
                      clickable ? 'cursor-pointer hover:bg-accent/40 focus-within:bg-accent/40' : undefined,
                    )}
                    key={getRowKey(row, rowIndex)}
                    onClick={clickable ? () => onRowClick(row) : undefined}
                    onKeyDown={
                      clickable
                        ? (event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault();
                              onRowClick(row);
                            }
                          }
                        : undefined
                    }
                    tabIndex={clickable ? 0 : undefined}
                  >
                    {columns.map((column) => (
                      <td className={cn('px-4 py-3 align-middle', column.className)} key={column.key}>
                        {column.accessor(row)}
                      </td>
                    ))}
                  </tr>
                );
              })
            : null}
        </tbody>
      </table>
    </div>
  );
}
