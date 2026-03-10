import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { PREVIEW_BANNER_DEFAULT_MESSAGE } from '@/components/ui/preview-banner';
import { mockActivities, sortActivitiesByDateDesc } from '@/features/activity';
import { toDateKey } from '@/lib/date-utils';
import { ActivityPage } from '@/pages/activity';

const sortedActivities = sortActivitiesByDateDesc(mockActivities);

describe('ActivityPage', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it('renders the activity list sorted newest first with formatted metadata', () => {
    render(<ActivityPage />);

    expect(screen.getByRole('heading', { name: 'Activity' })).toBeInTheDocument();
    expect(screen.getByText(PREVIEW_BANNER_DEFAULT_MESSAGE)).toBeInTheDocument();
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

  it('opens the add activity form with smart defaults and previews', () => {
    render(<ActivityPage />);

    fireEvent.click(screen.getByRole('button', { name: 'Add Activity' }));

    const dialog = screen.getByRole('dialog');
    const nameInput = within(dialog).getByLabelText('Name');
    const durationInput = within(dialog).getByLabelText('Duration');
    const dateInput = within(dialog).getByLabelText('Date');

    expect(within(dialog).getByRole('heading', { name: 'Log a new activity' })).toBeInTheDocument();
    expect(nameInput).toHaveValue('Morning Walk');
    expect(dateInput).toHaveValue(toDateKey(new Date()));
    expect(
      within(dialog).getByText('Enter minutes to preview the formatted duration.'),
    ).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Running' }));

    expect(nameInput).toHaveValue('Zone 2 Run');

    fireEvent.change(durationInput, { target: { value: '90' } });

    expect(within(dialog).getByText('Preview: 1h 30min')).toBeInTheDocument();
  });

  it('prepends a submitted activity to the list and shows a success message', () => {
    render(<ActivityPage />);

    fireEvent.click(screen.getByRole('button', { name: 'Add Activity' }));

    const dialog = screen.getByRole('dialog');

    fireEvent.click(within(dialog).getByRole('button', { name: 'Yoga' }));
    fireEvent.change(within(dialog).getByLabelText('Name'), {
      target: { value: 'Sunrise Mobility Flow' },
    });
    fireEvent.change(within(dialog).getByLabelText('Duration'), {
      target: { value: '75' },
    });
    fireEvent.change(within(dialog).getByLabelText('Notes'), {
      target: { value: 'Focused on hips, hamstrings, and mid-back rotation.' },
    });

    fireEvent.click(within(dialog).getByRole('button', { name: 'Log Activity' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(
      screen.getByText('Logged "Sunrise Mobility Flow" to the local activity list.'),
    ).toBeInTheDocument();

    const activityHeadings = screen.getAllByRole('heading', { level: 2 });

    expect(activityHeadings).toHaveLength(mockActivities.length + 1);
    expect(activityHeadings[0]).toHaveTextContent('Sunrise Mobility Flow');

    const newActivityCard = activityHeadings[0].closest('[data-slot="card"]');

    expect(newActivityCard).not.toBeNull();
    expect(within(newActivityCard as HTMLElement).getByText('1h 15min')).toBeInTheDocument();
    expect(
      within(newActivityCard as HTMLElement).getByText(
        'Focused on hips, hamstrings, and mid-back rotation.',
      ),
    ).toBeInTheDocument();
  });

  it('keeps the list in date order when a past activity is submitted', () => {
    render(<ActivityPage />);

    fireEvent.click(screen.getByRole('button', { name: 'Add Activity' }));

    const dialog = screen.getByRole('dialog');

    fireEvent.change(within(dialog).getByLabelText('Name'), {
      target: { value: 'Backfilled Recovery Walk' },
    });
    fireEvent.change(within(dialog).getByLabelText('Duration'), {
      target: { value: '35' },
    });
    fireEvent.change(within(dialog).getByLabelText('Date'), {
      target: { value: '2026-02-26' },
    });

    fireEvent.click(within(dialog).getByRole('button', { name: 'Log Activity' }));

    const activityHeadings = screen.getAllByRole('heading', { level: 2 });

    expect(activityHeadings.map((heading) => heading.textContent)).toEqual([
      'Peloton Ride',
      'Evening Walk',
      'Hip Opener Flow',
      'Trail Hike - Blue Ridge',
      'Zone 2 Run',
      'Yoga with Adriene',
      'Backfilled Recovery Walk',
      'Morning Walk',
      'Morning Stretch Routine',
      'Recovery Swim',
      'Neighborhood Spin',
      'Sauna + Mobility Circuit',
    ]);
  });

  it('closes the form without adding an activity when cancelled', () => {
    render(<ActivityPage />);

    fireEvent.click(screen.getByRole('button', { name: 'Add Activity' }));

    const dialog = screen.getByRole('dialog');

    fireEvent.change(within(dialog).getByLabelText('Name'), {
      target: { value: 'Should Not Save' },
    });

    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Should Not Save' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(mockActivities.length);
  });
});
