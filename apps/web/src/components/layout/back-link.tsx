import { Link } from 'react-router';

import { cn } from '@/lib/utils';

type BackLinkProps = {
  className?: string;
};

export function BackLink({ className }: BackLinkProps) {
  return (
    <Link
      className={cn(
        'inline-flex cursor-pointer items-center text-sm font-medium text-muted transition-colors hover:text-foreground',
        className,
      )}
      to="/profile"
    >
      ← Back to Profile
    </Link>
  );
}
