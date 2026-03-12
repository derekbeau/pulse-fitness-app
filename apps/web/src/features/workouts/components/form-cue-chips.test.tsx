import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { FormCueChips } from './form-cue-chips';

describe('FormCueChips', () => {
  it('renders exercise, template, and session cue groups', () => {
    render(
      <FormCueChips
        exerciseCues={['Brace before each rep']}
        sessionCues={['Lower weight if shoulder pinches']}
        templateCues={['Week 2: pause on chest']}
      />,
    );

    expect(screen.getByText('Exercise cues')).toBeInTheDocument();
    expect(screen.getByText('Template cues')).toBeInTheDocument();
    expect(screen.getByText('Session cues')).toBeInTheDocument();
    expect(screen.getByText('Brace before each rep')).toBeInTheDocument();
    expect(screen.getByText('Week 2: pause on chest')).toBeInTheDocument();
    expect(screen.getByText('Lower weight if shoulder pinches')).toBeInTheDocument();
  });

  it('invokes session cue callback when plus action is used', () => {
    const onAddSessionCue = vi.fn();

    render(<FormCueChips exerciseCues={[]} onAddSessionCue={onAddSessionCue} />);

    fireEvent.click(screen.getByRole('button', { name: 'Add session cue' }));
    fireEvent.change(screen.getByLabelText('Session cue input'), {
      target: { value: 'Keep ribs stacked' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    expect(onAddSessionCue).toHaveBeenCalledWith('Keep ribs stacked');
  });
});
