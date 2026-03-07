import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ActivityList } from '@/features/activity';

describe('ActivityList', () => {
  it('formats longer durations using hours and minutes', () => {
    render(<ActivityList />);

    expect(screen.getByText('1h 30min')).toBeInTheDocument();
    expect(screen.getByText('45 min')).toBeInTheDocument();
  });

  it('shows an empty state when a filter has no matching activities', () => {
    render(
      <ActivityList
        activities={[
          {
            id: 'activity-one',
            date: '2026-03-05',
            durationMinutes: 20,
            linkedJournalEntries: [],
            name: 'Easy Walk',
            notes: 'Flat neighborhood loop.',
            type: 'walking',
          },
        ]}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Yoga' }));

    expect(screen.getByText('No activities match this filter.')).toBeInTheDocument();
    expect(
      screen.getByText('Try a different activity type to view the rest of the mock log.'),
    ).toBeInTheDocument();
  });
});
