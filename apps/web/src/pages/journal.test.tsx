import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { JournalPage } from '@/pages/journal';

const sampleEntries = [
  {
    contentPreview:
      'Noticed a significant boost in morning energy after switching to earlier bedtime and keeping caffeine before noon.',
    date: 'February 16, 2026',
    title: 'Feeling More Energetic',
    type: 'observation',
  },
  {
    contentPreview:
      'Ran my first 5K today in 28:32. Started training 8 weeks ago and finally felt confident pushing the last kilometer.',
    date: 'February 28, 2026',
    title: 'First 5K Completed!',
    type: 'milestone',
  },
  {
    contentPreview:
      'Consistent with all habits this week. Weight trending down slightly, workouts felt steady, and recovery improved by Friday.',
    date: 'March 2, 2026',
    title: 'Week 12 Summary',
    type: 'weekly_summary',
  },
] as const;

describe('JournalPage', () => {
  it('renders the coming soon state with sample entries', () => {
    render(<JournalPage />);

    expect(screen.getByRole('heading', { name: 'Journal' })).toBeInTheDocument();
    expect(screen.getByText('Coming Soon')).toBeInTheDocument();
    expect(
      screen.getByText('Track your health observations, milestones, and weekly reflections.'),
    ).toBeInTheDocument();

    sampleEntries.forEach((entry) => {
      const cardHeading = screen.getByRole('heading', { name: entry.title });
      const card = cardHeading.closest('[data-slot="card"]');

      expect(card).not.toBeNull();
      expect(within(card as HTMLElement).getByText(entry.type)).toBeInTheDocument();
      expect(within(card as HTMLElement).getByText(entry.date)).toBeInTheDocument();
      expect(within(card as HTMLElement).getByText(entry.contentPreview)).toBeInTheDocument();
      expect(card).toHaveClass('border-dashed');
      expect(card).toHaveClass('opacity-90');
    });
  });

  it('uses distinct badge colors with explicit dark text on accent surfaces', () => {
    render(<JournalPage />);

    const observationBadge = screen.getByText('observation');
    const milestoneBadge = screen.getByText('milestone');
    const weeklySummaryBadge = screen.getByText('weekly_summary');

    expect(observationBadge).toHaveClass('bg-[var(--color-accent-cream)]');
    expect(milestoneBadge).toHaveClass('bg-[var(--color-accent-mint)]');
    expect(weeklySummaryBadge).toHaveClass('bg-[var(--color-accent-pink)]');

    [observationBadge, milestoneBadge, weeklySummaryBadge].forEach((badge) =>
      expect(badge).toHaveClass('text-slate-950'),
    );
  });
});
