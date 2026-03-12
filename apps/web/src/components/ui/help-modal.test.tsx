import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { HelpModal } from '@/components/ui/help-modal';

describe('HelpModal', () => {
  it('renders the provided title and content when open', () => {
    render(
      <HelpModal onOpenChange={vi.fn()} open title="How this works">
        <p>Follow these steps to get started.</p>
      </HelpModal>,
    );

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'How this works' })).toBeInTheDocument();
    expect(screen.getByText('Follow these steps to get started.')).toBeInTheDocument();
  });

  it('does not render dialog content when closed', () => {
    render(
      <HelpModal onOpenChange={vi.fn()} open={false} title="Hidden help">
        <p>Hidden content</p>
      </HelpModal>,
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByText('Hidden content')).not.toBeInTheDocument();
  });

  it('applies compact and scrollable content classes for mobile readability', () => {
    render(
      <HelpModal onOpenChange={vi.fn()} open title="Long help">
        <p>Line one.</p>
      </HelpModal>,
    );

    const content = document.body.querySelector('[data-slot="dialog-content"]');
    const body = document.body.querySelector('.overflow-y-auto');

    expect(content).toHaveClass('sm:max-w-md');
    expect(body).toHaveClass(
      'max-h-[min(70vh,32rem)]',
      'overflow-y-auto',
      'text-sm',
      'text-muted-foreground',
    );
  });
});
