import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { isUnauthorizedApiError, toUserFriendlyApiErrorMessage } from '@/lib/api-error';
import { useAuthStore } from '@/store/auth-store';

let appQueryClient: QueryClient | null = null;
let isHandlingUnauthorized = false;

type GlobalErrorOptions = {
  skipToast?: boolean;
};

function redirectToLogin(): void {
  if (typeof window === 'undefined') {
    return;
  }

  if (window.location.pathname === '/login') {
    return;
  }

  window.history.replaceState({}, '', '/login');
  window.dispatchEvent(new PopStateEvent('popstate'));
}

function handleGlobalError(error: unknown, options: GlobalErrorOptions = {}): void {
  if (!isUnauthorizedApiError(error)) {
    if (!options.skipToast) {
      toast.error(toUserFriendlyApiErrorMessage(error));
    }
    return;
  }

  if (isHandlingUnauthorized) {
    return;
  }

  isHandlingUnauthorized = true;
  useAuthStore.getState().logout();
  redirectToLogin();
  window.setTimeout(() => {
    isHandlingUnauthorized = false;
  }, 100);
}

export function resetAppQueryClient(): void {
  appQueryClient = null;
  isHandlingUnauthorized = false;
}

export function createAppQueryClient(): QueryClient {
  if (appQueryClient) {
    return appQueryClient;
  }

  appQueryClient = new QueryClient({
    mutationCache: new MutationCache({
      onError: (error, _variables, _context, mutation) => {
        handleGlobalError(error, {
          skipToast: mutation.meta?.suppressGlobalErrorToast === true,
        });
      },
    }),
    queryCache: new QueryCache({
      onError: (error) => {
        handleGlobalError(error);
      },
    }),
    defaultOptions: {
      queries: {
        retry: 1,
        staleTime: 30_000,
        refetchOnWindowFocus: false,
      },
      mutations: {
        retry: false,
      },
    },
  });

  return appQueryClient;
}
