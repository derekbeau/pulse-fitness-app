import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { FormCueChips } from './form-cue-chips';

describe('FormCueChips', () => {
  it('renders exercise, template, and session cues as a flat list', () => {
    render(
      <FormCueChips
        exerciseCues={['Brace before each rep']}
        sessionCues={['Lower weight if shoulder pinches']}
        templateCues={['Week 2: pause on chest']}
      />,
    );

    expect(screen.getByText('Form cues')).toBeInTheDocument();
    expect(screen.getByText('Brace before each rep')).toBeInTheDocument();
    expect(screen.getByText('Week 2: pause on chest')).toBeInTheDocument();
    expect(screen.getByText('Lower weight if shoulder pinches')).toBeInTheDocument();
  });

  it('shows coaching and programming notes in a collapsed section', () => {
    render(
      <FormCueChips
        exerciseCoachingNotes="Keep shoulder blades retracted."
        exerciseCues={['Brace before each rep']}
        templateProgrammingNotes="Top set at RPE 8, then two back-off sets."
      />,
    );

    expect(screen.getByRole('button', { name: 'Show notes' })).toBeInTheDocument();
    expect(screen.queryByText('Keep shoulder blades retracted.')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Show notes' }));

    expect(screen.getByText('Exercise coaching notes')).toBeInTheDocument();
    expect(screen.getByText('Keep shoulder blades retracted.')).toBeInTheDocument();
    expect(screen.getByText('Template programming notes')).toBeInTheDocument();
    expect(screen.getByText('Top set at RPE 8, then two back-off sets.')).toBeInTheDocument();
  });
});
