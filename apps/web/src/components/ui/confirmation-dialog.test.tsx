import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
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
    const alertDialog = screen.getByRole('alertdialog');

    expect(alertDialog.parentElement).toHaveClass('fixed', 'inset-0', 'flex', 'items-center', 'justify-center');
    expect(alertDialog).toHaveClass('gap-3', 'p-5', 'max-h-[calc(100dvh-2rem)]', 'overflow-y-auto');
    expect(alertDialog).not.toHaveClass('translate-x-[-50%]', 'translate-y-[-50%]');
    expect(document.querySelector('[data-slot="alert-dialog-footer"]')).toHaveClass('pt-1');
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

    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('closes when cancel button is clicked', () => {
    const onOpenChange = vi.fn();

    render(
      <ConfirmationDialog
        description="This action cannot be undone."
        onConfirm={vi.fn()}
        onOpenChange={onOpenChange}
        open
        title="Delete template?"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

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

    expect(screen.getByRole('button', { name: 'Confirm' })).toHaveAttribute(
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

    expect(screen.getByRole('button', { name: 'Confirm' })).toBeDisabled();
  });
});

function HookHarness({
  onConfirm,
  onCancel,
}: {
  onConfirm: () => void | Promise<void>;
  onCancel?: () => void;
}) {
  const { confirm, dialog } = useConfirmation();

  return (
    <>
      <button
        onClick={() => {
          confirm({
            confirmLabel: 'Delete meal',
            description: 'This action cannot be undone.',
            onCancel,
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

  it('calls onCancel when dialog is dismissed', async () => {
    const onCancel = vi.fn();

    render(<HookHarness onCancel={onCancel} onConfirm={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Open confirm' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onCancel).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(screen.queryByText('Delete meal?')).not.toBeInTheDocument();
    });
  });

  it('shows loading state and stays open during async confirm', async () => {
    let resolveConfirm: (() => void) | undefined;
    const onConfirm = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveConfirm = resolve;
        }),
    );

    render(<HookHarness onConfirm={onConfirm} />);

    fireEvent.click(screen.getByRole('button', { name: 'Open confirm' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete meal' }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Delete meal' })).toBeDisabled();
    expect(screen.getByText('Delete meal?')).toBeInTheDocument();

    act(() => {
      resolveConfirm?.();
    });

    await waitFor(() => {
      expect(screen.queryByText('Delete meal?')).not.toBeInTheDocument();
    });
  });
});
