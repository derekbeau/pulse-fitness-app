import { fireEvent, render, screen } from '@testing-library/react';
import { BadgeCheck } from 'lucide-react';
import { describe, expect, it, vi } from 'vitest';

import { PageHeader } from './page-header';

describe('PageHeader', () => {
  it('renders the title', () => {
    render(<PageHeader title="Dashboard" />);

    expect(screen.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument();
  });

  it('renders a back button when showBack is true', () => {
    const historyBackSpy = vi.spyOn(window.history, 'back').mockImplementation(() => {});
    window.history.pushState({}, '', '/settings');

    render(<PageHeader showBack title="Settings" />);

    const backButton = screen.getByRole('button', { name: 'Back' });
    expect(backButton).toBeInTheDocument();

    fireEvent.click(backButton);
    expect(historyBackSpy).toHaveBeenCalledTimes(1);
  });

  it('renders actions in the actions container', () => {
    const { container } = render(
      <PageHeader actions={<button type="button">Save</button>} title="Profile" />,
    );

    const actionsContainer = container.querySelector('[data-slot="page-header-actions"]');
    expect(actionsContainer).not.toBeNull();
    expect(actionsContainer).toContainElement(screen.getByRole('button', { name: 'Save' }));
    expect(actionsContainer).toHaveClass('shrink-0');
  });

  it('renders icon before title', () => {
    const { container } = render(
      <PageHeader
        icon={<BadgeCheck aria-label="Status icon" className="size-4" />}
        title="Activity"
      />,
    );

    const icon = screen.getByLabelText('Status icon');
    const title = screen.getByRole('heading', { level: 1, name: 'Activity' });
    expect(icon.compareDocumentPosition(title) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    const identityContainer = container.querySelector('[data-slot="page-header-identity"]');
    expect(identityContainer).toContainElement(icon);
    expect(identityContainer).toContainElement(title);
  });

  it('renders children below the main header row', () => {
    const { container } = render(
      <PageHeader title="Nutrition">
        <div>Tabs content</div>
      </PageHeader>,
    );

    const mainRow = container.querySelector('[data-slot="page-header-main"]');
    const tabsContent = screen.getByText('Tabs content');
    if (!mainRow) {
      throw new Error('Expected page-header-main container to be rendered');
    }

    expect(
      mainRow.compareDocumentPosition(tabsContent) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});
