import { fireEvent, render, screen } from '@testing-library/react';
import { LayoutDashboard } from 'lucide-react';
import { describe, expect, it, vi } from 'vitest';

import { EmptyState } from '@/components/ui/empty-state';

describe('EmptyState', () => {
  it('renders icon, title, and description', () => {
    render(
      <EmptyState
        description="Start by adding your first entry."
        icon={LayoutDashboard}
        title="No data yet"
      />,
    );

    expect(screen.getByRole('heading', { name: 'No data yet' })).toBeInTheDocument();
    expect(screen.getByText('Start by adding your first entry.')).toBeInTheDocument();
    expect(document.querySelector('[data-slot="empty-state"]')).toHaveClass(
      'min-h-60',
      'px-5',
      'py-9',
    );
  });

  it('renders an action button and calls the click handler', () => {
    const onClick = vi.fn();

    render(
      <EmptyState
        action={{
          label: 'Create',
          onClick,
        }}
        description="Create your first item."
        icon={LayoutDashboard}
        title="Nothing here"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
