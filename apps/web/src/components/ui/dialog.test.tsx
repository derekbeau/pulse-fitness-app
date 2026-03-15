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
  it('uses compact default spacing while keeping the close button touch target', () => {
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

    expect(screen.getByRole('dialog')).toHaveClass('gap-3', 'p-5');
    expect(screen.getByTestId('dialog-header')).toHaveClass('gap-1.5');
    expect(screen.getByTestId('dialog-footer')).toHaveClass('pt-1');
    expect(screen.getByRole('button', { name: 'Close' })).toHaveClass(
      'min-h-[44px]',
      'min-w-[44px]',
    );
  });
});
