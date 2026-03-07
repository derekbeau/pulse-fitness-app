import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { mockActivities } from '@/features/activity';
import { ActivityPage } from '@/pages/activity';

const sortedActivities = [...mockActivities].sort((left, right) =>
  right.date.localeCompare(left.date),
);

describe('ActivityPage', () => {
  it('renders the activity list sorted newest first with formatted metadata', () => {
    render(<ActivityPage />);

    expect(screen.getByRole('heading', { name: 'Activity' })).toBeInTheDocument();
    expect(
      screen.getByText(
        /Review recent movement sessions outside structured workouts, with quick filtering by activity type and linked journal context\./,
      ),
    ).toBeInTheDocument();

    const activityHeadings = screen.getAllByRole('heading', { level: 2 });

    expect(activityHeadings.map((heading) => heading.textContent)).toEqual(
      sortedActivities.map((activity) => activity.name),
    );

    const pelotonCard = screen
      .getByRole('heading', { name: 'Peloton Ride' })
      .closest('[data-slot="card"]');
    const eveningWalkCard = screen
      .getByRole('heading', { name: 'Evening Walk' })
      .closest('[data-slot="card"]');

    expect(pelotonCard).not.toBeNull();
    expect(eveningWalkCard).not.toBeNull();
    expect(within(pelotonCard as HTMLElement).getByText('30 min')).toBeInTheDocument();
    expect(within(pelotonCard as HTMLElement).getByText('Mar 4, 2026')).toBeInTheDocument();
    expect(
      within(pelotonCard as HTMLElement).getByText(
        'Low-impact ride with a steady Zone 2 effort before breakfast.',
      ),
    ).toBeInTheDocument();
    expect(within(pelotonCard as HTMLElement).getByText('Linked journal')).toBeInTheDocument();
    expect(within(pelotonCard as HTMLElement).getByText('Week 12 Summary')).toBeInTheDocument();
    expect(
      within(eveningWalkCard as HTMLElement).queryByText('Linked journal'),
    ).not.toBeInTheDocument();
  });

  it('filters the activity cards by type', () => {
    render(<ActivityPage />);

    const runningFilter = screen.getByRole('button', { name: 'Running' });
    const allFilter = screen.getByRole('button', { name: 'All' });

    fireEvent.click(runningFilter);

    expect(runningFilter).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('heading', { name: 'Zone 2 Run' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Peloton Ride' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Morning Walk' })).not.toBeInTheDocument();

    fireEvent.click(allFilter);

    expect(allFilter).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('heading', { name: 'Peloton Ride' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Morning Walk' })).toBeInTheDocument();
  });
});
