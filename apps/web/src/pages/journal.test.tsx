import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';

import { mockJournalEntries } from '@/features/journal';
import { JournalPage } from '@/pages/journal';

describe('JournalPage', () => {
  it('renders the chronological feed with badges, previews, and entity chips', () => {
    const { container } = render(
      <MemoryRouter>
        <JournalPage />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: 'Journal' })).toBeInTheDocument();
    expect(
      screen.getByText(
        'Review coaching notes, milestones, observations, and injury updates in one chronological feed.',
      ),
    ).toBeInTheDocument();

    const cardTitles = screen
      .getAllByRole('heading', { level: 2 })
      .map((heading) => heading.textContent);
    expect(cardTitles).toEqual(mockJournalEntries.map((entry) => entry.title));

    const cards = container.querySelectorAll('[data-slot="journal-entry-card"]');
    expect(cards).toHaveLength(mockJournalEntries.length);

    const firstCard = cards[0] as HTMLElement;
    expect(within(firstCard).getByText('injury update')).toBeInTheDocument();
    expect(within(firstCard).getByText('Mar 6, 2026')).toBeInTheDocument();
    expect(
      within(firstCard).getByText(/Sports med check in: cleared to reintroduce overhead work/i),
    ).toHaveTextContent(/\.\.\.$/);
    expect(within(firstCard).getByRole('link', { name: 'Mobility warm-up' })).toHaveAttribute(
      'href',
      '/habits',
    );
    expect(
      within(firstCard).getByText('Right shoulder SLAP rehab').closest('[data-slot="badge"]'),
    ).toBeInTheDocument();
  });

  it('uses the required color mapping for each journal type badge', () => {
    render(
      <MemoryRouter>
        <JournalPage />
      </MemoryRouter>,
    );

    expect(screen.getAllByText('post workout')[0]).toHaveClass('bg-[var(--color-accent-mint)]');
    expect(screen.getAllByText('milestone')[0]).toHaveClass('bg-amber-200');
    expect(screen.getAllByText('observation')[0]).toHaveClass('bg-sky-200');
    expect(screen.getByText('weekly summary')).toHaveClass('bg-violet-200');
    expect(screen.getAllByText('injury update')[0]).toHaveClass('bg-red-200');
  });
});
