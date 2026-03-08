import { type PropsWithChildren, useEffect } from 'react';
import { Navigate, Outlet } from 'react-router';
import { AuthRouteLoader } from '@/components/auth/auth-route-loader';
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

  return children ?? <Outlet />;
}
