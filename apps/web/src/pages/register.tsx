import { useNavigate } from 'react-router';

import { RegisterForm } from '@/features/auth';

export function RegisterPage() {
  const navigate = useNavigate();

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10 text-foreground sm:px-6">
      <div className="flex w-full max-w-sm flex-col items-center gap-6">
        <div className="space-y-2 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-primary">Pulse</p>
          <h1 className="text-3xl font-semibold tracking-tight">Create account</h1>
          <p className="text-sm text-muted-foreground">
            Set up your login to start tracking workouts, recovery, and habits.
          </p>
        </div>
        <RegisterForm loginHref="/login" onSuccess={() => navigate('/')} />
      </div>
    </main>
  );
}
