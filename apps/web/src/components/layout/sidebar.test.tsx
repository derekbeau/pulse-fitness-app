import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Sidebar } from '@/components/layout/sidebar';
import { useUser } from '@/hooks/use-user';
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
vi.mock('@/hooks/use-user', () => ({
  useUser: vi.fn(),
}));

type MockAuthStore = {
  login: ReturnType<typeof vi.fn>;
  register: ReturnType<typeof vi.fn>;
  logout: ReturnType<typeof vi.fn>;
  hydrate: ReturnType<typeof vi.fn>;
  clearError: ReturnType<typeof vi.fn>;
  user: {
    id: string;
    username: string;
    name: string | null;
  } | null;
  token: string | null;
  isAuthenticated: boolean;
  hasHydrated: boolean;
  isLoading: boolean;
  error: string | null;
};

const mockedUseAuthStore = vi.mocked(useAuthStore);
const mockedUseUser = vi.mocked(useUser);

const navLinks = [
  { label: 'Dashboard', path: '/' },
  { label: 'Workouts', path: '/workouts' },
  { label: 'Nutrition', path: '/nutrition' },
  { label: 'Habits', path: '/habits' },
  { label: 'Activity', path: '/activity' },
  { label: 'Journal', path: '/journal' },
  { label: 'Profile', path: '/profile' },
] as const;

function createAuthStore(overrides: Partial<MockAuthStore> = {}): MockAuthStore {
  return {
    login: vi.fn().mockResolvedValue(undefined),
    register: vi.fn().mockResolvedValue(undefined),
    logout: vi.fn(),
    hydrate: vi.fn(),
    clearError: vi.fn(),
    user: {
      id: 'user-1',
      username: 'derek',
      name: 'Derek',
    },
    token: 'token-1',
    isAuthenticated: true,
    hasHydrated: true,
    isLoading: false,
    error: null,
    ...overrides,
  };
}

function renderSidebar(store = createAuthStore()) {
  mockedUseAuthStore.mockReturnValue(store);

  return render(
    <MemoryRouter initialEntries={['/nutrition']}>
      <Sidebar />
    </MemoryRouter>,
  );
}

describe('Sidebar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    mockedUseUser.mockReturnValue({
      data: {
        id: 'user-1',
        username: 'derek',
        name: 'Derek',
        createdAt: 1_709_548_800_000,
        updatedAt: 1_709_548_800_000,
      },
    } as unknown as ReturnType<typeof useUser>);
  });

  it('renders all nav links and highlights the active route', () => {
    renderSidebar();

    navLinks.forEach(({ label, path }) => {
      const link = screen.getByRole('link', { name: label });
      expect(link).toHaveAttribute('href', path);
      expect(link).toHaveClass('cursor-pointer');
    });

    const activeLink = screen.getByRole('link', { name: 'Nutrition' });

    expect(activeLink).toHaveAttribute('aria-current', 'page');
    expect(activeLink).toHaveClass('bg-primary');
    expect(screen.getByText('Derek')).toBeInTheDocument();
    expect(screen.getByText('@derek')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Derek/i })).toHaveAttribute('href', '/profile');
  });

  it('logs out and navigates to /login', () => {
    const store = createAuthStore();

    renderSidebar(store);

    fireEvent.click(screen.getByRole('button', { name: 'Log out' }));
    expect(store.logout).not.toHaveBeenCalled();

    const dialog = screen.getByRole('alertdialog');
    expect(within(dialog).getByText('Sign out?')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Sign out' }));

    expect(store.logout).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith('/login', { replace: true });
  });

  it('does not render mobile sidebar controls', () => {
    renderSidebar();

    expect(screen.queryByRole('button', { name: 'Open navigation menu' })).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Mobile navigation' })).not.toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Desktop navigation' })).toBeInTheDocument();
  });

  it('renders the collapsed avatar without adding it to the tab order', () => {
    window.localStorage.setItem('pulse-sidebar-collapsed', 'true');

    renderSidebar();

    expect(screen.getByLabelText('Derek')).not.toHaveAttribute('tabindex');
    expect(screen.getByLabelText('Derek')).toHaveAttribute('href', '/profile');
  });

  it('navigates to the profile page when the account block is clicked', () => {
    const store = createAuthStore();
    mockedUseAuthStore.mockReturnValue(store);
    mockedUseUser.mockReturnValue({
      data: {
        id: 'user-1',
        username: 'derek',
        name: 'Derek',
        createdAt: 1_709_548_800_000,
        updatedAt: 1_709_548_800_000,
      },
    } as unknown as ReturnType<typeof useUser>);

    render(
      <MemoryRouter initialEntries={['/nutrition']}>
        <Routes>
          <Route element={<Sidebar />} path="*" />
          <Route element={<h1>Profile Route</h1>} path="/profile" />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('link', { name: /Derek/i }));

    expect(screen.getByRole('heading', { name: 'Profile Route' })).toBeInTheDocument();
  });

  it('falls back to username from useUser when profile name is missing', () => {
    mockedUseUser.mockReturnValue({
      data: {
        id: 'user-1',
        username: 'derek',
        name: null,
        createdAt: 1_709_548_800_000,
        updatedAt: 1_709_548_800_000,
      },
    } as unknown as ReturnType<typeof useUser>);

    renderSidebar();

    expect(screen.getByText('derek')).toBeInTheDocument();
  });
});
