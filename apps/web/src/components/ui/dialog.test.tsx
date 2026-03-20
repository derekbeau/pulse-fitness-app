import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

describe('Dialog', () => {
  it('uses flex wrapper centering with scroll-safe content defaults', () => {
    render(
      <Dialog open>
        <DialogContent>
          <DialogHeader data-testid="dialog-header">
            <DialogTitle>Compact dialog</DialogTitle>
            <DialogDescription>Density pass defaults.</DialogDescription>
          </DialogHeader>
          <div>Body</div>
          <DialogFooter data-testid="dialog-footer">Actions</DialogFooter>
        </DialogContent>
      </Dialog>,
    );

    const dialog = screen.getByRole('dialog');

    expect(dialog.parentElement).toHaveClass('fixed', 'inset-0', 'flex', 'items-center', 'justify-center');
    expect(dialog).toHaveClass('gap-3', 'p-5', 'max-h-[calc(100dvh-2rem)]', 'overflow-y-auto');
    expect(dialog).not.toHaveClass('translate-x-[-50%]', 'translate-y-[-50%]');
    expect(screen.getByTestId('dialog-header')).toHaveClass('gap-1.5');
    expect(screen.getByTestId('dialog-footer')).toHaveClass('pt-1');
    expect(screen.getByRole('button', { name: 'Close' })).toHaveClass(
      'min-h-[44px]',
      'min-w-[44px]',
    );
  });
});
