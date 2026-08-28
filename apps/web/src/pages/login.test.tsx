import { QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { LoginPage } from '@/pages/login';
import { createAppQueryClient } from '@/lib/query-client';

const navigateMock = vi.fn();

vi.mock('react-router', async () => {
  const actual = await vi.importActual<typeof import('react-router')>('react-router');

  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

vi.mock('@/features/auth', () => ({
  LoginForm: ({ onSuccess }: { onSuccess: () => Promise<void> | void }) => (
    <button type="button" onClick={() => void onSuccess()}>
      Mock login success
    </button>
  ),
}));

describe('LoginPage', () => {
  beforeEach(() => {
    navigateMock.mockReset();
  });

  it('navigates without prefetching a browser-local dashboard date', () => {
    const queryClient = createAppQueryClient();
    queryClient.clear();

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <LoginPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Mock login success' }));

    expect(navigateMock).toHaveBeenCalledWith('/');
  });
});
