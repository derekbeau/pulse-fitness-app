import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { getActivityTypeLabel, mockActivities } from '@/features/activity';
import { ActivityPage } from '@/pages/activity';

const previewActivities = mockActivities.slice(0, 3);

describe('ActivityPage', () => {
  it('renders the coming soon state with sample activity cards', () => {
    render(<ActivityPage />);

    expect(screen.getByRole('heading', { name: 'Activity' })).toBeInTheDocument();
    expect(screen.getByText('Coming Soon')).toBeInTheDocument();
    expect(
      screen.getByText('Log walks, stretching, yoga, and other movement activities.'),
    ).toBeInTheDocument();

    previewActivities.forEach((activity) => {
      const cardHeading = screen.getByRole('heading', { name: activity.name });
      const card = cardHeading.closest('[data-slot="card"]');

      expect(card).not.toBeNull();
      expect(
        within(card as HTMLElement).getByText(getActivityTypeLabel(activity.type)),
      ).toBeInTheDocument();
      expect(
        within(card as HTMLElement).getByText(`${activity.durationMinutes} min`),
      ).toBeInTheDocument();
      expect(within(card as HTMLElement).getByText(activity.notes)).toBeInTheDocument();
      expect(within(card as HTMLElement).getByText('Preview')).toBeInTheDocument();
      expect(card).toHaveClass('border-dashed');
      expect(card).toHaveClass('opacity-85');
    });
  });

  it('uses distinct badge colors with explicit dark text on accent surfaces', () => {
    render(<ActivityPage />);

    const cyclingBadge = screen.getByText('Cycling');
    const walkingBadge = screen.getByText('Walking');
    const stretchingBadge = screen.getByText('Stretching');

    expect(cyclingBadge).toHaveClass('bg-amber-200');
    expect(walkingBadge).toHaveClass('bg-emerald-200');
    expect(stretchingBadge).toHaveClass('bg-sky-200');

    expect(cyclingBadge).toHaveClass('text-amber-950');
    expect(walkingBadge).toHaveClass('text-emerald-950');
    expect(stretchingBadge).toHaveClass('text-sky-950');
  });
});
