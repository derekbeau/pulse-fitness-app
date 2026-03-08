import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { LoginForm } from '@/features/auth';
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
  token: null;
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

function renderLoginForm(store = createAuthStore()) {
  const onSuccess = vi.fn();
  mockedUseAuthStore.mockReturnValue(store);

  render(
    <MemoryRouter>
      <LoginForm onSuccess={onSuccess} registerHref="/register" />
    </MemoryRouter>,
  );

  return { onSuccess, store };
}

describe('LoginForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders username and password fields', () => {
    renderLoginForm();

    expect(screen.getByLabelText('Username')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
  });

  it('shows validation errors when submitting an empty form', async () => {
    renderLoginForm();

    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByText(/at least 3 character/i)).toBeInTheDocument();
    expect(await screen.findByText(/at least 1 character/i)).toBeInTheDocument();
  });

  it('calls auth store login with form values on submit', async () => {
    const { onSuccess, store } = renderLoginForm();

    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'derek' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'supersecret' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => {
      expect(store.login).toHaveBeenCalledWith({
        username: 'derek',
        password: 'supersecret',
      });
    });
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  it('displays the API error message when login fails', () => {
    renderLoginForm(
      createAuthStore({
        error: 'Invalid username or password',
      }),
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Invalid username or password');
  });

  it('clears the API error when the user edits an input', () => {
    const store = createAuthStore({
      error: 'Invalid username or password',
    });

    renderLoginForm(store);

    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'new-user' } });

    expect(store.clearError).toHaveBeenCalled();
  });

  it('disables the submit button while loading', () => {
    renderLoginForm(
      createAuthStore({
        isLoading: true,
      }),
    );

    expect(screen.getByRole('button', { name: /signing in/i })).toBeDisabled();
  });
});
