import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProtectedRoute } from '@/components/auth/protected-route';
import { useAuthStore } from '@/store/auth-store';
import { useUser } from '@/hooks/use-user';

vi.mock('@/store/auth-store', () => ({
  useAuthStore: vi.fn(),
}));

vi.mock('@/hooks/use-user', () => ({
  useUser: vi.fn(),
}));

const mockedUseUser = vi.mocked(useUser);

type MockAuthStore = {
  login: ReturnType<typeof vi.fn>;
  register: ReturnType<typeof vi.fn>;
  logout: ReturnType<typeof vi.fn>;
  hydrate: ReturnType<typeof vi.fn>;
  clearError: ReturnType<typeof vi.fn>;
  user: null;
  token: string | null;
  isAuthenticated: boolean;
  hasHydrated: boolean;
  isLoading: boolean;
  error: string | null;
};

const mockedUseAuthStore = vi.mocked(useAuthStore);

function createAuthStore(overrides: Partial<MockAuthStore> = {}): MockAuthStore {
  return {
    login: vi.fn().mockResolvedValue(undefined),
    register: vi.fn().mockResolvedValue(undefined),
    logout: vi.fn(),
    hydrate: vi.fn(),
    clearError: vi.fn(),
    user: null,
    token: null,
    isAuthenticated: false,
    hasHydrated: true,
    isLoading: false,
    error: null,
    ...overrides,
  };
}

function renderProtectedRoute(store = createAuthStore()) {
  mockedUseAuthStore.mockReturnValue(store);

  return render(
    <MemoryRouter initialEntries={['/dashboard']}>
      <Routes>
        <Route path="/login" element={<h1>Login page</h1>} />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <h1>Dashboard page</h1>
            </ProtectedRoute>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe('ProtectedRoute', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedUseUser.mockReturnValue({
      data: { id: 'user-1', username: 'test', name: 'Test' },
      isError: false,
      isPending: false,
    } as ReturnType<typeof useUser>);
  });

  it('renders children when authenticated', () => {
    renderProtectedRoute(
      createAuthStore({
        isAuthenticated: true,
      }),
    );

    expect(screen.getByRole('heading', { name: 'Dashboard page' })).toBeInTheDocument();
  });

  it('redirects to /login when not authenticated', () => {
    renderProtectedRoute();

    expect(screen.getByRole('heading', { name: 'Login page' })).toBeInTheDocument();
  });

  it('shows a loading state while hydrating', async () => {
    const store = createAuthStore({
      hasHydrated: false,
    });

    renderProtectedRoute(store);

    expect(screen.getByRole('status')).toHaveTextContent('Loading your session');
    await waitFor(() => {
      expect(store.hydrate).toHaveBeenCalledTimes(1);
    });
  });
});
