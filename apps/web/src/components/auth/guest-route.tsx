import { type PropsWithChildren, useEffect } from 'react';
import { LoaderCircle } from 'lucide-react';
import { Navigate, Outlet } from 'react-router';
import { useAuthStore } from '@/store/auth-store';

function AuthRouteLoader() {
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

export function GuestRoute({ children }: PropsWithChildren) {
  const { hasHydrated, hydrate, isAuthenticated } = useAuthStore();

  useEffect(() => {
    if (!hasHydrated) {
      hydrate();
    }
  }, [hasHydrated, hydrate]);

  if (!hasHydrated) {
    return <AuthRouteLoader />;
  }

  if (isAuthenticated) {
    return <Navigate replace to="/" />;
  }

  return children ?? <Outlet />;
}
