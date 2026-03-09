import { zodResolver } from '@hookform/resolvers/zod';
import { registerInputSchema, type RegisterInput } from '@pulse/shared';
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

type RegisterFormProps = {
  loginHref: string;
  onSuccess: () => void;
};

export function RegisterForm({ loginHref, onSuccess }: RegisterFormProps) {
  const { register: registerUser, isLoading, error, clearError } = useAuthStore();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterInput>({
    resolver: zodResolver(registerInputSchema),
    defaultValues: {
      username: '',
      password: '',
      name: '',
    },
  });

  useEffect(() => {
    clearError();
  }, [clearError]);

  async function onSubmit(values: RegisterInput) {
    try {
      await registerUser(values);
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
        <CardTitle className="text-2xl">Set your credentials</CardTitle>
        <CardDescription>
          Set up your Pulse account to start tracking your health data.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-5" onSubmit={handleSubmit(onSubmit)}>
          <div className="space-y-2">
            <Label htmlFor="register-username">Username</Label>
            <Input
              id="register-username"
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
            <Label htmlFor="register-password">Password</Label>
            <Input
              id="register-password"
              aria-invalid={errors.password ? true : undefined}
              autoComplete="new-password"
              disabled={isLoading}
              placeholder="At least 8 characters"
              type="password"
              {...register('password', { onChange: handleInputChange })}
            />
            {errors.password ? (
              <p className="text-sm text-destructive">{errors.password.message}</p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="register-name">Name (optional)</Label>
            <Input
              id="register-name"
              aria-invalid={errors.name ? true : undefined}
              autoComplete="name"
              disabled={isLoading}
              placeholder="Derek"
              {...register('name', {
                onChange: handleInputChange,
                setValueAs: (value: string) => (value.trim() ? value : undefined),
              })}
            />
            {errors.name ? <p className="text-sm text-destructive">{errors.name.message}</p> : null}
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
                Creating account...
              </>
            ) : (
              'Create account'
            )}
          </Button>

          <p className="text-center text-sm text-muted-foreground">
            Already have an account?{' '}
            <Link
              aria-label="Go to sign in"
              className={cn('font-medium text-primary hover:underline')}
              data-qa="auth-go-signin"
              data-testid="register-signin-link"
              id="register-signin-link"
              to={loginHref}
            >
              Sign in
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
