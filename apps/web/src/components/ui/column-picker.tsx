import { useEffect, useId, useMemo } from 'react';
import { Columns3 } from 'lucide-react';

import { cn } from '@/lib/utils';

import { Button } from './button';
import { Checkbox } from './checkbox';
import { Popover, PopoverContent, PopoverHeader, PopoverTitle, PopoverTrigger } from './popover';

type PickerColumn = {
  key: string;
  label: string;
};

type ColumnPickerProps = {
  columns: PickerColumn[];
  visibleColumns: string[];
  onChange: (columns: string[]) => void;
  storageKey?: string;
  className?: string;
};

function arraysEqual(left: string[], right: string[]) {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((value, index) => value === right[index]);
}

export function ColumnPicker({
  columns,
  visibleColumns,
  onChange,
  storageKey,
  className,
}: ColumnPickerProps) {
  const fallbackId = useId();
  const normalizedStorageKey = useMemo(() => storageKey?.trim() ?? '', [storageKey]);
  const validKeys = useMemo(() => new Set(columns.map((column) => column.key)), [columns]);

  useEffect(() => {
    if (!normalizedStorageKey) {
      return;
    }

    try {
      const rawValue = window.localStorage.getItem(normalizedStorageKey);
      if (!rawValue) {
        return;
      }

      const parsedValue = JSON.parse(rawValue);
      if (!Array.isArray(parsedValue)) {
        return;
      }

      const nextVisibleColumns = parsedValue
        .filter((key): key is string => typeof key === 'string' && validKeys.has(key))
        .filter((key, index, array) => array.indexOf(key) === index);

      if (arraysEqual(nextVisibleColumns, visibleColumns)) {
        return;
      }

      onChange(nextVisibleColumns);
    } catch {
      return;
    }
  }, [normalizedStorageKey, onChange, validKeys, visibleColumns]);

  useEffect(() => {
    if (!normalizedStorageKey) {
      return;
    }

    try {
      window.localStorage.setItem(normalizedStorageKey, JSON.stringify(visibleColumns));
    } catch {
      return;
    }
  }, [normalizedStorageKey, visibleColumns]);

  function toggleColumn(columnKey: string, checked: boolean) {
    const visibleSet = new Set(visibleColumns);

    if (checked) {
      visibleSet.add(columnKey);
    } else {
      visibleSet.delete(columnKey);
    }

    const nextVisibleColumns = columns
      .map((column) => column.key)
      .filter((columnKeyOption) => visibleSet.has(columnKeyOption));

    onChange(nextVisibleColumns);
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button className={cn('h-9', className)} size="sm" type="button" variant="outline">
          <Columns3 aria-hidden="true" className="size-4" />
          Columns
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-56 space-y-3 p-3">
        <PopoverHeader>
          <PopoverTitle>Visible columns</PopoverTitle>
        </PopoverHeader>
        <div className="space-y-2">
          {columns.map((column, index) => {
            const columnId = `${fallbackId}-${index}-${column.key}`;
            const checked = visibleColumns.includes(column.key);

            return (
              <label className="flex cursor-pointer items-center gap-2 text-sm" htmlFor={columnId} key={column.key}>
                <Checkbox
                  checked={checked}
                  id={columnId}
                  onCheckedChange={(nextChecked) => toggleColumn(column.key, nextChecked === true)}
                />
                <span>{column.label}</span>
              </label>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
