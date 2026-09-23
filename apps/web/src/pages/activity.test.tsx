import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { ActivityPage } from './activity';

vi.mock('@/features/activity/api/activity', () => ({
  useActivities: () => ({
    data: { data: [], meta: { total: 0, page: 1, limit: 100 } },
    isPending: false,
    isError: false,
  }),
  useActivity: () => ({ isPending: true }),
}));

describe('ActivityPage', () => {
  it('shows a real empty state without a capture form or preview data', () => {
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <MemoryRouter>
          <ActivityPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(screen.getByText('No activities recorded.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add Activity' })).not.toBeInTheDocument();
    expect(screen.queryByText(/sample data is shown/i)).not.toBeInTheDocument();
  });
});
