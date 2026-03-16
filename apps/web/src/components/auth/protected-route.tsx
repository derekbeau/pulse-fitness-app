import { type PropsWithChildren, useEffect } from 'react';
import { Navigate, Outlet } from 'react-router';
import { AuthRouteLoader } from '@/components/auth/auth-route-loader';
import { useUser } from '@/hooks/use-user';
import { useAuthStore } from '@/store/auth-store';

export function ProtectedRoute({ children }: PropsWithChildren) {
  const { hasHydrated, hydrate, isAuthenticated } = useAuthStore();

  useEffect(() => {
    if (!hasHydrated) {
      hydrate();
    }
  }, [hasHydrated, hydrate]);

  if (!hasHydrated) {
    return <AuthRouteLoader />;
  }

  if (!isAuthenticated) {
    return <Navigate replace to="/login" />;
  }

  return <SessionGuard fallback={<AuthRouteLoader />}>{children ?? <Outlet />}</SessionGuard>;
}

function SessionGuard({
  children,
  fallback,
}: {
  children: React.ReactNode;
  fallback: React.ReactNode;
}) {
  const { logout } = useAuthStore();
  const { isError, isPending } = useUser();

  useEffect(() => {
    if (isError) {
      logout();
    }
  }, [isError, logout]);

  if (isError) {
    return <Navigate replace to="/login" />;
  }

  if (isPending) {
    return fallback;
  }

  return children;
}
