import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router';
import { BottomNav } from '@/components/layout/bottom-nav';
import { useAuthStore } from '@/store/auth-store';

const mockNavigate = vi.fn();

vi.mock('react-router', async () => {
  const actual = await vi.importActual<typeof import('react-router')>('react-router');

  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

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
    token: 'token-1',
    isAuthenticated: true,
    hasHydrated: true,
    isLoading: false,
    error: null,
    ...overrides,
  };
}

function renderBottomNav(initialPath = '/', store = createAuthStore()) {
  mockedUseAuthStore.mockReturnValue(store);

  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <BottomNav />
      <Routes>
        <Route element={<h1>Dashboard Route</h1>} path="/" />
        <Route element={<h1>Workouts Route</h1>} path="/workouts" />
        <Route element={<h1>Nutrition Route</h1>} path="/nutrition" />
        <Route element={<h1>Habits Route</h1>} path="/habits" />
        <Route element={<h1>Activity Route</h1>} path="/activity" />
        <Route element={<h1>Foods Route</h1>} path="/foods" />
        <Route element={<h1>Journal Route</h1>} path="/journal" />
        <Route element={<h1>Profile Route</h1>} path="/profile" />
      </Routes>
    </MemoryRouter>,
  );
}

describe('BottomNav', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('opens the More menu with activity, foods, journal, and profile links', () => {
    renderBottomNav('/');

    const nav = screen.getByRole('navigation', { name: 'Mobile navigation' });
    expect(nav).toHaveClass('grid-cols-5', 'items-stretch', 'pb-[calc(env(safe-area-inset-bottom)+0.5rem)]');

    const moreButton = screen.getByRole('button', { name: 'More' });
    expect(moreButton).toHaveClass('cursor-pointer');
    expect(moreButton).toHaveClass('min-h-[44px]');

    fireEvent.click(moreButton);

    expect(screen.getByRole('menu')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveClass('cursor-pointer');
    expect(screen.getByRole('menuitem', { name: 'Activity' })).toHaveAttribute('href', '/activity');
    expect(screen.getByRole('menuitem', { name: 'Activity' })).toHaveClass('cursor-pointer');
    expect(screen.getByRole('menuitem', { name: 'Foods' })).toHaveAttribute('href', '/foods');
    expect(screen.getByRole('menuitem', { name: 'Foods' })).toHaveClass('cursor-pointer');
    expect(screen.getByRole('menuitem', { name: 'Journal' })).toHaveAttribute('href', '/journal');
    expect(screen.getByRole('menuitem', { name: 'Journal' })).toHaveClass('cursor-pointer');
    expect(screen.getByRole('menuitem', { name: 'Profile' })).toHaveAttribute('href', '/profile');
    expect(screen.getByRole('menuitem', { name: 'Profile' })).toHaveClass('cursor-pointer');
    expect(screen.getByRole('menuitem', { name: 'Profile' })).toHaveClass('min-h-[44px]');
    expect(screen.getByRole('menuitem', { name: 'Log out' })).toBeInTheDocument();
  });

  it('highlights More on more-menu routes and navigates from the dropdown', () => {
    renderBottomNav('/foods');

    const moreButton = screen.getByRole('button', { name: 'More' });

    expect(moreButton).toHaveClass('bg-primary');

    fireEvent.click(moreButton);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Profile' }));

    expect(screen.getByRole('heading', { name: 'Profile Route' })).toBeInTheDocument();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('logs out and navigates to /login from the More menu', () => {
    const store = createAuthStore();

    renderBottomNav('/', store);

    fireEvent.click(screen.getByRole('button', { name: 'More' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Log out' }));

    expect(store.logout).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith('/login', { replace: true });
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
});
