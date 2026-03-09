import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { RegisterForm } from '@/features/auth';
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

function renderRegisterForm(store = createAuthStore()) {
  const onSuccess = vi.fn();
  mockedUseAuthStore.mockReturnValue(store);

  render(
    <MemoryRouter>
      <RegisterForm loginHref="/login" onSuccess={onSuccess} />
    </MemoryRouter>,
  );

  return { onSuccess, store };
}

describe('RegisterForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders username, password, and name fields', () => {
    renderRegisterForm();

    expect(screen.getByLabelText('Username')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
    expect(screen.getByLabelText('Name (optional)')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create account' })).toBeInTheDocument();
  });

  it('renders a stable sign-in navigation link', () => {
    renderRegisterForm();

    const signInLink = screen.getByTestId('register-signin-link');
    expect(signInLink).toHaveAttribute('id', 'register-signin-link');
    expect(signInLink).toHaveAttribute('href', '/login');
    expect(signInLink).toHaveAttribute('data-qa', 'auth-go-signin');
  });

  it('shows validation errors for short username and password', async () => {
    renderRegisterForm();

    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'ab' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'short' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));

    expect(await screen.findByText(/at least 3 character/i)).toBeInTheDocument();
    expect(await screen.findByText(/at least 8 character/i)).toBeInTheDocument();
  });

  it('calls auth store register with form values on submit', async () => {
    const { onSuccess, store } = renderRegisterForm();

    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'derek' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'supersecret' } });
    fireEvent.change(screen.getByLabelText('Name (optional)'), { target: { value: 'Derek' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));

    await waitFor(() => {
      expect(store.register).toHaveBeenCalledWith({
        username: 'derek',
        password: 'supersecret',
        name: 'Derek',
      });
    });
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  it('shows the API error when registration fails', () => {
    renderRegisterForm(
      createAuthStore({
        error: 'Username is already taken',
      }),
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Username is already taken');
  });

  it('clears the API error when the user edits an input', () => {
    const store = createAuthStore({
      error: 'Username is already taken',
    });

    renderRegisterForm(store);

    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'new-user' } });

    expect(store.clearError).toHaveBeenCalled();
  });

  it('disables the submit button while loading', () => {
    renderRegisterForm(
      createAuthStore({
        isLoading: true,
      }),
    );

    expect(screen.getByRole('button', { name: /creating account/i })).toBeDisabled();
  });

  it('does not call onSuccess when registration rejects', async () => {
    const { onSuccess, store } = renderRegisterForm(
      createAuthStore({
        register: vi.fn().mockRejectedValue(new Error('Username is already taken')),
      }),
    );

    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'derek' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'supersecret' } });
    fireEvent.change(screen.getByLabelText('Name (optional)'), { target: { value: 'Derek' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));

    await waitFor(() => {
      expect(store.register).toHaveBeenCalledWith({
        username: 'derek',
        password: 'supersecret',
        name: 'Derek',
      });
    });
    expect(onSuccess).not.toHaveBeenCalled();
  });
});
