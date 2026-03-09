import { zodResolver } from '@hookform/resolvers/zod';
import { loginInputSchema, type LoginInput } from '@pulse/shared';
import { LoaderCircle } from 'lucide-react';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/auth-store';

type LoginFormProps = {
  onSuccess: () => void;
  registerHref: string;
};

export function LoginForm({ onSuccess, registerHref }: LoginFormProps) {
  const { login, isLoading, error, clearError } = useAuthStore();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginInputSchema),
    defaultValues: {
      username: '',
      password: '',
    },
  });

  useEffect(() => {
    clearError();
  }, [clearError]);

  async function onSubmit(values: LoginInput) {
    try {
      await login(values);
      onSuccess();
    } catch {
      // Auth store state already exposes the API error for the form UI.
    }
  }

  function handleInputChange() {
    if (error) {
      clearError();
    }
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader className="space-y-1">
        <CardTitle className="text-2xl">Welcome back</CardTitle>
        <CardDescription>
          Sign in to continue tracking workouts, habits, and recovery.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-5" onSubmit={handleSubmit(onSubmit)}>
          <div className="space-y-2">
            <Label htmlFor="login-username">Username</Label>
            <Input
              id="login-username"
              aria-invalid={errors.username ? true : undefined}
              autoComplete="username"
              disabled={isLoading}
              placeholder="derek"
              {...register('username', { onChange: handleInputChange })}
            />
            {errors.username ? (
              <p className="text-sm text-destructive">{errors.username.message}</p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="login-password">Password</Label>
            <Input
              id="login-password"
              aria-invalid={errors.password ? true : undefined}
              autoComplete="current-password"
              disabled={isLoading}
              placeholder="Enter your password"
              type="password"
              {...register('password', { onChange: handleInputChange })}
            />
            {errors.password ? (
              <p className="text-sm text-destructive">{errors.password.message}</p>
            ) : null}
          </div>

          {error ? (
            <p
              className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              role="alert"
            >
              {error}
            </p>
          ) : null}

          <Button className="w-full" disabled={isLoading} type="submit">
            {isLoading ? (
              <>
                <LoaderCircle className="size-4 animate-spin" />
                Signing in...
              </>
            ) : (
              'Sign in'
            )}
          </Button>

          <p className="text-center text-sm text-muted-foreground">
            Don&apos;t have an account?{' '}
            <Link
              aria-label="Go to register"
              className={cn('font-medium text-primary hover:underline')}
              data-testid="login-register-link"
              id="login-register-link"
              to={registerHref}
            >
              Register
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
