import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { FormCuesBlock } from './form-cues-block';

describe('FormCuesBlock', () => {
  it('renders an empty state when no cues, notes, or instructions exist', () => {
    render(<FormCuesBlock />);

    expect(screen.getByText('No form cues provided.')).toBeInTheDocument();
  });

  it('supports collapsed and expanded states', () => {
    render(
      <FormCuesBlock
        coachingNotes="Keep shoulder blades pinned."
        exerciseCues={['Brace before each rep']}
        instructions="Lower with control."
        templateCues={['Pause one second at the bottom']}
      />,
    );

    expect(screen.getByRole('button', { name: 'Show form cues' })).toBeInTheDocument();
    expect(screen.queryByText('Brace before each rep')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Show form cues' }));

    expect(screen.getByText('Brace before each rep')).toBeInTheDocument();
    expect(screen.getByText('Pause one second at the bottom')).toBeInTheDocument();
    expect(screen.getByText('Instructions')).toBeInTheDocument();
    expect(screen.getByText('Lower with control.')).toBeInTheDocument();
  });
});
