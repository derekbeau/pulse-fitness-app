import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Sidebar } from '@/components/layout/sidebar';
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

const navLinks = [
  { label: 'Dashboard', path: '/' },
  { label: 'Workouts', path: '/workouts' },
  { label: 'Nutrition', path: '/nutrition' },
  { label: 'Habits', path: '/habits' },
  { label: 'Activity', path: '/activity' },
  { label: 'Foods', path: '/foods' },
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
  });

  it('logs out and navigates to /login', () => {
    const store = createAuthStore();

    renderSidebar(store);

    fireEvent.click(screen.getByRole('button', { name: 'Log out' }));

    expect(store.logout).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith('/login', { replace: true });
  });

  it('opens and closes the mobile overlay menu from the hamburger trigger', () => {
    renderSidebar();

    const menuButton = screen.getByRole('button', { name: 'Open navigation menu' });
    expect(menuButton).toHaveClass('min-h-[44px]', 'min-w-[44px]');

    fireEvent.click(menuButton);

    const mobileNav = screen.getByLabelText('Mobile navigation');
    expect(mobileNav).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close sidebar panel' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Close sidebar panel' }));
    expect(screen.queryByLabelText('Mobile navigation')).not.toBeInTheDocument();
  });

  it('renders the collapsed avatar without adding it to the tab order', () => {
    window.localStorage.setItem('pulse-sidebar-collapsed', 'true');

    renderSidebar();

    expect(screen.getByLabelText('Derek')).not.toHaveAttribute('tabindex');
  });
});
