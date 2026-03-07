import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it } from 'vitest';

import { JournalEntryPage } from './journal-entry';

function renderWithRoute(entryId: string) {
  return render(
    <MemoryRouter initialEntries={[`/journal/${entryId}`]}>
      <Routes>
        <Route element={<JournalEntryPage />} path="/journal/:entryId" />
      </Routes>
    </MemoryRouter>,
  );
}

describe('JournalEntryPage', () => {
  it('renders not-found state for an unknown entryId', () => {
    renderWithRoute('missing-entry');

    expect(screen.getByRole('heading', { name: 'Journal entry not found' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to Journal' })).toHaveAttribute(
      'href',
      '/journal',
    );
  });

  it('renders full entry content and linked entities for a valid entry', () => {
    renderWithRoute('journal-upper-a-session-notes');

    expect(
      screen.getByRole('heading', { level: 1, name: 'Upper A Session Notes' }),
    ).toBeInTheDocument();
    expect(screen.getByText('post workout')).toBeInTheDocument();
    expect(screen.getByText('Mar 5, 2026')).toBeInTheDocument();
    expect(screen.getByText('Created by agent')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Coach notes' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: 'Wins' })).toBeInTheDocument();
    expect(screen.getByText(/Session focus:/)).toBeInTheDocument();
    expect(screen.getByText('Linked To')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to Journal' })).toHaveAttribute(
      'href',
      '/journal',
    );
    expect(screen.getByRole('link', { name: 'Upper Push' })).toHaveAttribute(
      'href',
      '/workouts/template/upper-push',
    );
  });
});
