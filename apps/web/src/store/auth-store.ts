import {
  type LoginInput,
  type RegisterInput,
  loginInputSchema,
  registerInputSchema,
} from '@pulse/shared';
import { createJSONStorage, persist } from 'zustand/middleware';
import { create } from 'zustand/react';
import { ApiError, apiRequest } from '@/lib/api-client';
import {
  AUTH_STORAGE_KEY,
  clearStoredAuthState,
  getStoredToken,
  setStoredToken,
} from '@/lib/auth-storage';
import { createAppQueryClient } from '@/lib/query-client';

export { AUTH_STORAGE_KEY };

export type AuthUser = {
  id: string;
  username: string;
  name: string | null;
};

type AuthResponse = {
  token: string;
  user: AuthUser;
};

type AuthState = {
  user: AuthUser | null;
  token: string | null;
  isAuthenticated: boolean;
  hasHydrated: boolean;
  isLoading: boolean;
  error: string | null;
};

type AuthActions = {
  login: (input: LoginInput) => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
  logout: () => void;
  hydrate: () => void;
  clearError: () => void;
};

type AuthStore = AuthState & AuthActions;

const initialAuthState: AuthState = {
  user: null,
  token: null,
  isAuthenticated: false,
  hasHydrated: false,
  isLoading: false,
  error: null,
};

function getPersistStorage(): Storage {
  if (typeof window === 'undefined') {
    const storage = new Map<string, string>();

    return {
      get length() {
        return storage.size;
      },
      clear() {
        storage.clear();
      },
      getItem(key: string) {
        return storage.get(key) ?? null;
      },
      key(index: number) {
        return [...storage.keys()][index] ?? null;
      },
      removeItem(key: string) {
        storage.delete(key);
      },
      setItem(key: string, value: string) {
        storage.set(key, value);
      },
    };
  }

  return window.localStorage;
}

function applySession(
  set: (partial: Partial<AuthState>) => void,
  session: AuthResponse | null,
): void {
  setStoredToken(session?.token ?? null);
  set({
    user: session?.user ?? null,
    token: session?.token ?? null,
    isAuthenticated: Boolean(session?.token),
    hasHydrated: true,
    isLoading: false,
    error: null,
  });
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    return error.message;
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set, get) => ({
      ...initialAuthState,
      async login(input) {
        set({ isLoading: true, error: null });

        try {
          const payload = loginInputSchema.parse(input);
          const response = await apiRequest<AuthResponse>('/api/v1/auth/login', {
            method: 'POST',
            body: payload,
          });

          applySession(set, response);
        } catch (error) {
          set({
            isLoading: false,
            error: getErrorMessage(error, 'Failed to log in'),
          });
          throw error;
        }
      },
      async register(input) {
        set({ isLoading: true, error: null });

        try {
          const payload = registerInputSchema.parse(input);
          const response = await apiRequest<AuthResponse>('/api/v1/auth/register', {
            method: 'POST',
            body: payload,
          });

          applySession(set, response);
        } catch (error) {
          set({
            isLoading: false,
            error: getErrorMessage(error, 'Failed to register'),
          });
          throw error;
        }
      },
      logout() {
        // Auth state lives outside React, so logout clears the shared singleton query cache here.
        createAppQueryClient().clear();
        set({ ...initialAuthState, hasHydrated: true });
        clearStoredAuthState();
      },
      hydrate() {
        const token = getStoredToken();

        set({
          token,
          user: token ? get().user : null,
          isAuthenticated: Boolean(token),
          hasHydrated: true,
          isLoading: false,
        });
      },
      clearError() {
        set({ error: null });
      },
    }),
    {
      name: AUTH_STORAGE_KEY,
      storage: createJSONStorage(getPersistStorage),
      partialize: (state) => ({
        token: state.token,
        user: state.user,
      }),
      onRehydrateStorage: () => (state) => {
        state?.hydrate();
      },
    },
  ),
);
