import { QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { LoginPage } from '@/pages/login';
import { prefetchDashboardSnapshot } from '@/hooks/use-dashboard-snapshot';
import { getToday, toDateKey } from '@/lib/date';
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

vi.mock('@/hooks/use-dashboard-snapshot', () => ({
  prefetchDashboardSnapshot: vi.fn(),
}));

describe('LoginPage', () => {
  beforeEach(() => {
    navigateMock.mockReset();
    vi.mocked(prefetchDashboardSnapshot).mockReset();
  });

  it('prefetches today dashboard snapshot before navigating on successful login', async () => {
    vi.mocked(prefetchDashboardSnapshot).mockResolvedValue(undefined);
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

    await waitFor(() => {
      expect(prefetchDashboardSnapshot).toHaveBeenCalledWith(queryClient, toDateKey(getToday()));
    });
    expect(navigateMock).toHaveBeenCalledWith('/');
  });
});
