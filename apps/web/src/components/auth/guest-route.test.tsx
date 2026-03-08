import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GuestRoute } from '@/components/auth/guest-route';
import { useAuthStore } from '@/store/auth-store';

vi.mock('@/store/auth-store', () => ({
  useAuthStore: vi.fn(),
}));

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

function renderGuestRoute(store = createAuthStore()) {
  mockedUseAuthStore.mockReturnValue(store);

  return render(
    <MemoryRouter initialEntries={['/login']}>
      <Routes>
        <Route
          path="/login"
          element={
            <GuestRoute>
              <h1>Login page</h1>
            </GuestRoute>
          }
        />
        <Route path="/" element={<h1>Dashboard page</h1>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('GuestRoute', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders children when not authenticated', () => {
    renderGuestRoute();

    expect(screen.getByRole('heading', { name: 'Login page' })).toBeInTheDocument();
  });

  it('redirects to / when authenticated', () => {
    renderGuestRoute(
      createAuthStore({
        isAuthenticated: true,
      }),
    );

    expect(screen.getByRole('heading', { name: 'Dashboard page' })).toBeInTheDocument();
  });

  it('shows a loading state while hydrating', async () => {
    const store = createAuthStore({
      hasHydrated: false,
    });

    renderGuestRoute(store);

    expect(screen.getByRole('status')).toHaveTextContent('Loading your session');
    await waitFor(() => {
      expect(store.hydrate).toHaveBeenCalledTimes(1);
    });
  });
});
