import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ActivityPage } from '@/pages/activity';

const sampleActivities = [
  {
    description: 'Mobility session',
    duration: '20 min',
    note: 'Morning mobility routine - hip openers and shoulder work',
    type: 'Stretching',
  },
  {
    description: 'Outdoor walk',
    duration: '45 min',
    note: 'Afternoon walk around the park, 3.2 km',
    type: 'Walking',
  },
  {
    description: 'Vinyasa flow',
    duration: '30 min',
    note: 'Vinyasa flow session, focused on balance poses',
    type: 'Yoga',
  },
] as const;

describe('ActivityPage', () => {
  it('renders the coming soon state with sample activity cards', () => {
    render(<ActivityPage />);

    expect(screen.getByRole('heading', { name: 'Activity' })).toBeInTheDocument();
    expect(screen.getByText('Coming Soon')).toBeInTheDocument();
    expect(
      screen.getByText('Log walks, stretching, yoga, and other movement activities.'),
    ).toBeInTheDocument();

    sampleActivities.forEach((activity) => {
      const cardHeading = screen.getByRole('heading', { name: activity.description });
      const card = cardHeading.closest('[data-slot="card"]');

      expect(card).not.toBeNull();
      expect(within(card as HTMLElement).getByText(activity.type)).toBeInTheDocument();
      expect(within(card as HTMLElement).getByText(activity.duration)).toBeInTheDocument();
      expect(within(card as HTMLElement).getByText(activity.note)).toBeInTheDocument();
      expect(within(card as HTMLElement).getByText('Preview')).toBeInTheDocument();
      expect(card).toHaveClass('border-dashed');
      expect(card).toHaveClass('opacity-85');
    });
  });

  it('uses distinct badge colors with explicit dark text on accent surfaces', () => {
    render(<ActivityPage />);

    const stretchingBadge = screen.getByText('Stretching');
    const walkingBadge = screen.getByText('Walking');
    const yogaBadge = screen.getByText('Yoga');

    expect(stretchingBadge).toHaveClass('bg-sky-200');
    expect(walkingBadge).toHaveClass('bg-emerald-200');
    expect(yogaBadge).toHaveClass('bg-violet-200');

    expect(stretchingBadge).toHaveClass('text-sky-800');
    expect(walkingBadge).toHaveClass('text-emerald-800');
    expect(yogaBadge).toHaveClass('text-violet-800');
  });
});
