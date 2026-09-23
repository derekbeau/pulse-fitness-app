import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { JournalEntryPage } from './journal-entry';

vi.mock('@/features/journal/api/journal', () => ({
  useJournalEntry: () => ({
    isPending: false,
    isError: true,
    error: new Error('Observation not found'),
    refetch: vi.fn(),
  }),
}));

describe('JournalEntryPage', () => {
  it('shows the server error on an unavailable record', () => {
    render(
      <MemoryRouter initialEntries={['/journal/missing']}>
        <Routes>
          <Route path="/journal/:entryId" element={<JournalEntryPage />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Observation not found');
  });
});
