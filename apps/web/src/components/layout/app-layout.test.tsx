import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { AppLayout } from '@/components/layout/app-layout';

const mockInvalidateQueries = vi.fn().mockResolvedValue(undefined);
const mockPullToRefresh = vi.fn();

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    invalidateQueries: mockInvalidateQueries,
  }),
}));

vi.mock('@/components/layout/sidebar', () => ({
  Sidebar: () => <div data-testid="sidebar" />,
}));

vi.mock('@/components/layout/bottom-nav', () => ({
  BottomNav: () => <div data-testid="bottom-nav" />,
}));

vi.mock('@/components/workouts/active-session-resume-gate', () => ({
  ActiveSessionResumeGate: () => <div data-testid="session-gate" />,
}));

vi.mock('@/components/ui/pull-to-refresh', () => ({
  PullToRefresh: ({ onRefresh }: { onRefresh: () => Promise<unknown> | unknown }) => {
    mockPullToRefresh(onRefresh);
    return <div data-testid="pull-to-refresh" />;
  },
}));

describe('AppLayout', () => {
  it('wires pull-to-refresh to query invalidation', async () => {
    render(
      <AppLayout>
        <div>content</div>
      </AppLayout>,
    );

    expect(mockPullToRefresh).toHaveBeenCalledTimes(1);

    const onRefresh = mockPullToRefresh.mock.calls[0][0] as () => Promise<unknown>;
    await onRefresh();

    expect(mockInvalidateQueries).toHaveBeenCalledTimes(1);
  });

  it('uses responsive top padding for main content', () => {
    render(
      <AppLayout>
        <div>content</div>
      </AppLayout>,
    );

    const main = screen.getByRole('main');

    expect(main).toHaveClass('pt-4');
    expect(main).toHaveClass('md:pt-8');
    expect(main).not.toHaveClass('pt-20');
  });
});
