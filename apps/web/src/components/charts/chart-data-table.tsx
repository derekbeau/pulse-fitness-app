import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

export type ChartDataColumn<TRow> = {
  className?: string;
  header: ReactNode;
  key: string;
  render: (row: TRow) => ReactNode;
};

type ChartDataTableProps<TRow> = {
  caption: string;
  className?: string;
  columns: readonly ChartDataColumn<TRow>[];
  getRowKey: (row: TRow) => string;
  onSelectRow?: (row: TRow) => void;
  rows: readonly TRow[];
  selectionLabel?: (row: TRow) => string;
  summary?: string;
};

export function ChartDataTable<TRow>({
  caption,
  className,
  columns,
  getRowKey,
  onSelectRow,
  rows,
  selectionLabel,
  summary = 'View exact chart values',
}: ChartDataTableProps<TRow>) {
  return (
    <details
      className={cn('rounded-xl border border-border/70', className)}
      data-slot="chart-data-table"
    >
      <summary className="flex min-h-11 cursor-pointer items-center px-4 font-medium">
        {summary}
      </summary>
      <div className="max-h-[32rem] overflow-auto border-t border-border/70">
        <table className="w-full min-w-[40rem] text-left text-sm">
          <caption className="sr-only">{caption}</caption>
          <thead className="sticky top-0 bg-card text-xs text-muted-foreground">
            <tr>
              {columns.map((column) => (
                <th className={cn('p-3', column.className)} key={column.key} scope="col">
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr className="border-t border-border/70" key={getRowKey(row)}>
                {columns.map((column, columnIndex) => (
                  <td className={cn('p-3 align-top', column.className)} key={column.key}>
                    {columnIndex === 0 && onSelectRow ? (
                      <button
                        className="min-h-11 cursor-pointer text-left underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        onClick={() => onSelectRow(row)}
                        type="button"
                      >
                        <span className="sr-only">{selectionLabel?.(row) ?? 'Inspect row'}: </span>
                        {column.render(row)}
                      </button>
                    ) : (
                      column.render(row)
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
