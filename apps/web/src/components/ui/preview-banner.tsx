import { useEffect, useState } from 'react';
import { Info } from 'lucide-react';

import { cn } from '@/lib/utils';

export const PREVIEW_BANNER_DEFAULT_MESSAGE =
  "This feature is in preview — data shown is sample data and won't be saved.";

const DEFAULT_STORAGE_KEY = 'pulse-preview-banner-dismissed';

type PreviewBannerProps = {
  className?: string;
  message?: string;
  storageKey?: string;
};

function getDismissedValue(storageKey: string) {
  if (typeof window === 'undefined') {
    return false;
  }

  try {
    return window.sessionStorage.getItem(storageKey) === 'true';
  } catch {
    return false;
  }
}

export function PreviewBanner({
  className,
  message = PREVIEW_BANNER_DEFAULT_MESSAGE,
  storageKey = DEFAULT_STORAGE_KEY,
}: PreviewBannerProps) {
  const [dismissed, setDismissed] = useState(() => getDismissedValue(storageKey));

  useEffect(() => {
    setDismissed(getDismissedValue(storageKey));
  }, [storageKey]);

  function handleDismiss() {
    setDismissed(true);

    try {
      window.sessionStorage.setItem(storageKey, 'true');
    } catch {
      // Ignore storage failures and keep local state dismissal.
    }
  }

  if (dismissed) {
    return null;
  }

  return (
    <div
      className={cn(
        'rounded-xl border border-amber-300/80 bg-amber-100/75 px-3 py-2 text-amber-950 shadow-sm dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200',
        className,
      )}
      data-slot="preview-banner"
      role="note"
    >
      <div className="flex flex-wrap items-start gap-x-2 gap-y-1 text-sm sm:flex-nowrap sm:items-center">
        <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0 sm:mt-0" />
        <p className="min-w-0 flex-1 leading-5">{message}</p>
        <button
          className="cursor-pointer text-xs font-semibold whitespace-nowrap underline-offset-2 transition hover:underline focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/60"
          onClick={handleDismiss}
          type="button"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
