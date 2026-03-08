import { LoaderCircle } from 'lucide-react';

export function AuthRouteLoader() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 text-foreground">
      <div
        aria-live="polite"
        className="flex items-center gap-3 rounded-xl border border-border/60 bg-card px-4 py-3 shadow-sm"
        role="status"
      >
        <LoaderCircle aria-hidden="true" className="size-4 animate-spin text-primary" />
        <span className="text-sm font-medium">Loading your session...</span>
      </div>
    </div>
  );
}
