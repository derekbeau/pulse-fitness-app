import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';

import { WorkoutTemplateDetail } from './template-detail';

describe('WorkoutTemplateDetail', () => {
  it('renders the selected template with collapsible sections and exercise metadata', () => {
    render(
      <MemoryRouter>
        <WorkoutTemplateDetail templateId="upper-push" />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { level: 1, name: 'Upper Push' })).toBeInTheDocument();
    expect(
      screen.getByText('Chest, shoulders, and triceps emphasis with controlled tempo work.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Upper Body')).toBeInTheDocument();

    const warmupSection = screen.getByRole('heading', { level: 2, name: 'Warmup' }).closest('details');
    const mainSection = screen.getByRole('heading', { level: 2, name: 'Main' }).closest('details');
    const cooldownSection = screen
      .getByRole('heading', { level: 2, name: 'Cooldown' })
      .closest('details');

    expect(warmupSection).not.toHaveAttribute('open');
    expect(mainSection).toHaveAttribute('open');
    expect(cooldownSection).not.toHaveAttribute('open');

    const inclinePressCard = screen.getByText('Incline Dumbbell Press').closest('[data-slot="card"]');

    expect(inclinePressCard).not.toBeNull();
    expect(within(inclinePressCard as HTMLElement).getByText('3 x 8-10')).toBeInTheDocument();
    expect(
      within(inclinePressCard as HTMLElement).getByText('Tempo: 3-1-1-0'),
    ).toBeInTheDocument();
    expect(within(inclinePressCard as HTMLElement).getByText('Rest: 90s')).toBeInTheDocument();
    expect(
      within(inclinePressCard as HTMLElement).getByText('Equipment: Dumbbells'),
    ).toBeInTheDocument();

    const formCuesDetails = within(inclinePressCard as HTMLElement)
      .getByText('Form cues')
      .closest('details');

    expect(formCuesDetails).not.toHaveAttribute('open');

    fireEvent.click(within(inclinePressCard as HTMLElement).getByText('Form cues'));

    expect(formCuesDetails).toHaveAttribute('open');
    expect(screen.getByText('Drive feet into the floor')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Start Workout' }),
    ).toHaveAttribute('href', '/workouts/active');
  });

  it('renders a fallback state when the template does not exist', () => {
    render(
      <MemoryRouter>
        <WorkoutTemplateDetail templateId="missing-template" />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: 'Template not found' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to Workouts' })).toHaveAttribute(
      'href',
      '/workouts',
    );
  });
});
