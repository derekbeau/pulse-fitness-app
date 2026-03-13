import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ConfirmationDialog, useConfirmation } from '@/components/ui/confirmation-dialog';

describe('ConfirmationDialog', () => {
  it('renders title and description', () => {
    render(
      <ConfirmationDialog
        description="This action cannot be undone."
        onConfirm={vi.fn()}
        onOpenChange={vi.fn()}
        open
        title="Delete template?"
      />,
    );

    expect(screen.getByText('Delete template?')).toBeInTheDocument();
    expect(screen.getByText('This action cannot be undone.')).toBeInTheDocument();
  });

  it('calls onConfirm when confirm button is clicked', () => {
    const onConfirm = vi.fn();

    render(
      <ConfirmationDialog
        description="This action cannot be undone."
        onConfirm={onConfirm}
        onOpenChange={vi.fn()}
        open
        title="Delete template?"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('calls onCancel and closes when cancel button is clicked', () => {
    const onCancel = vi.fn();
    const onOpenChange = vi.fn();

    render(
      <ConfirmationDialog
        description="This action cannot be undone."
        onCancel={onCancel}
        onConfirm={vi.fn()}
        onOpenChange={onOpenChange}
        open
        title="Delete template?"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('uses destructive styling for destructive variant', () => {
    render(
      <ConfirmationDialog
        description="This action cannot be undone."
        onConfirm={vi.fn()}
        onOpenChange={vi.fn()}
        open
        title="Delete template?"
        variant="destructive"
      />,
    );

    expect(screen.getByRole('button', { name: 'Delete' })).toHaveAttribute(
      'data-variant',
      'destructive',
    );
  });

  it('disables confirm button while loading', () => {
    render(
      <ConfirmationDialog
        description="This action cannot be undone."
        loading
        onConfirm={vi.fn()}
        onOpenChange={vi.fn()}
        open
        title="Delete template?"
      />,
    );

    expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled();
  });
});

function HookHarness({ onConfirm }: { onConfirm: () => void }) {
  const { confirm, dialog } = useConfirmation();

  return (
    <>
      <button
        onClick={() => {
          confirm({
            confirmLabel: 'Delete meal',
            description: 'This action cannot be undone.',
            onConfirm,
            title: 'Delete meal?',
          });
        }}
        type="button"
      >
        Open confirm
      </button>
      {dialog}
    </>
  );
}

describe('useConfirmation', () => {
  it('opens and runs the confirm callback', async () => {
    const onConfirm = vi.fn();

    render(<HookHarness onConfirm={onConfirm} />);

    fireEvent.click(screen.getByRole('button', { name: 'Open confirm' }));
    expect(screen.getByText('Delete meal?')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Delete meal' }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(screen.queryByText('Delete meal?')).not.toBeInTheDocument();
    });
  });
});
