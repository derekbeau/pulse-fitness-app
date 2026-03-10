import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';

import { LoginForm } from '@/features/auth';
import { prefetchDashboardSnapshot } from '@/hooks/use-dashboard-snapshot';
import { getToday, toDateKey } from '@/lib/date';

export function LoginPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  async function handleLoginSuccess() {
    const todayDateKey = toDateKey(getToday());
    await prefetchDashboardSnapshot(queryClient, todayDateKey);
    navigate('/');
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10 text-foreground sm:px-6">
      <div className="flex w-full max-w-sm flex-col items-center gap-6">
        <div className="space-y-2 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-primary">Pulse</p>
          <h1 className="text-3xl font-semibold tracking-tight">Welcome back</h1>
          <p className="text-sm text-muted-foreground">Sign in to pick up where you left off.</p>
        </div>
        <LoginForm onSuccess={handleLoginSuccess} registerHref="/register" />
      </div>
    </main>
  );
}
