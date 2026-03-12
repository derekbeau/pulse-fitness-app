import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { usePullToRefresh } from '@/hooks/use-pull-to-refresh';

import { PullToRefresh } from './pull-to-refresh';

vi.mock('@/hooks/use-pull-to-refresh', () => ({
  DEFAULT_THRESHOLD: 80,
  usePullToRefresh: vi.fn(),
}));

const mockedUsePullToRefresh = vi.mocked(usePullToRefresh);

describe('PullToRefresh', () => {
  it('does not render when app is not in standalone mode', () => {
    mockedUsePullToRefresh.mockReturnValue({
      isStandalone: false,
      pullDistance: 0,
      pulling: false,
      refreshing: false,
    });

    const { container } = render(<PullToRefresh onRefresh={vi.fn()} />);

    expect(container).toBeEmptyDOMElement();
  });

  it('shows release message when threshold is reached', () => {
    mockedUsePullToRefresh.mockReturnValue({
      isStandalone: true,
      pullDistance: 100,
      pulling: true,
      refreshing: false,
    });

    render(<PullToRefresh onRefresh={vi.fn()} threshold={80} />);

    expect(screen.getByText('Release to refresh')).toBeInTheDocument();
  });

  it('shows refreshing state', () => {
    mockedUsePullToRefresh.mockReturnValue({
      isStandalone: true,
      pullDistance: 0,
      pulling: false,
      refreshing: true,
    });

    render(<PullToRefresh onRefresh={vi.fn()} />);

    expect(screen.getByText('Refreshing...')).toBeInTheDocument();
  });
});
