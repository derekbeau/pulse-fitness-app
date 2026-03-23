import { cn } from '@/lib/utils';

import { Button } from './button';
import { PerPageSelector } from './per-page-selector';

type PaginationBarProps = {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  perPage?: number;
  onPerPageChange?: (value: number) => void;
  perPageAriaLabel?: string;
  total?: number;
  isLoading?: boolean;
  className?: string;
};

const FIRST_PAGE = 1;

export function PaginationBar({
  page,
  totalPages,
  onPageChange,
  perPage,
  onPerPageChange,
  perPageAriaLabel = 'Items per page',
  total,
  isLoading = false,
  className,
}: PaginationBarProps) {
  const normalizedTotalPages = Math.max(FIRST_PAGE, totalPages);
  const normalizedPage = Math.min(Math.max(FIRST_PAGE, page), normalizedTotalPages);
  const disablePrevious = normalizedPage <= FIRST_PAGE || isLoading;
  const disableNext = normalizedPage >= normalizedTotalPages || isLoading;

  return (
    <div className={cn('flex flex-wrap items-center justify-between gap-3', className)}>
      <div className="flex flex-wrap items-center gap-2">
        {typeof total === 'number' ? (
          <p className="text-sm text-muted-foreground">{`${total} total`}</p>
        ) : null}
        {typeof perPage === 'number' && typeof onPerPageChange === 'function' ? (
          <PerPageSelector ariaLabel={perPageAriaLabel} onChange={onPerPageChange} value={perPage} />
        ) : null}
      </div>

      <div className="flex items-center gap-2">
        <Button
          disabled={disablePrevious}
          onClick={() => onPageChange(Math.max(FIRST_PAGE, normalizedPage - 1))}
          size="sm"
          type="button"
          variant="outline"
        >
          Previous
        </Button>
        <p className="text-sm text-muted-foreground">{`Page ${normalizedPage} of ${normalizedTotalPages}`}</p>
        <Button
          disabled={disableNext}
          onClick={() => onPageChange(Math.min(normalizedTotalPages, normalizedPage + 1))}
          size="sm"
          type="button"
          variant="outline"
        >
          Next
        </Button>
      </div>
    </div>
  );
}
