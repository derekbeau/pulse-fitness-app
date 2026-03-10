import { Link } from 'react-router';

import { cn } from '@/lib/utils';

type BackLinkProps = {
  className?: string;
  label?: string;
  to?: string;
};

export function BackLink({ className, label = 'Back to Profile', to = '/profile' }: BackLinkProps) {
  return (
    <Link
      className={cn(
        'inline-flex min-h-[44px] min-w-[44px] cursor-pointer items-center text-sm font-medium text-muted transition-colors hover:text-foreground',
        className,
      )}
      to={to}
    >
      ← {label}
    </Link>
  );
}
