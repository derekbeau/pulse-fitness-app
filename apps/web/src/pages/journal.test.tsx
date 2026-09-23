import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { JournalPage } from './journal';

vi.mock('@/hooks/use-date-authority', () => ({
  useDateAuthority: () => ({ localDate: '2026-09-24' }),
}));
vi.mock('@/features/journal/api/journal', () => ({
  useJournal: () => ({ data: { items: [] }, isPending: false, error: null }),
  useWeeklyReflection: () => ({
    data: { facts: [], gaps: ['No actual workout on Wednesday'] },
    isPending: false,
    error: null,
  }),
  useDailyContext: () => ({
    data: { localDate: '2026-09-24', pendingQuestions: [], currentAnswers: [], observations: [] },
    isPending: false,
    error: null,
  }),
}));

describe('JournalPage', () => {
  it('shows saved-record empty state and explicit weekly gaps', () => {
    render(
      <MemoryRouter>
        <JournalPage />
      </MemoryRouter>,
    );
    expect(screen.getByText('No Journal observations recorded.')).toBeInTheDocument();
    expect(screen.getByText('No actual workout on Wednesday')).toBeInTheDocument();
    expect(screen.queryByText(/sample data is shown/i)).not.toBeInTheDocument();
  });
});
