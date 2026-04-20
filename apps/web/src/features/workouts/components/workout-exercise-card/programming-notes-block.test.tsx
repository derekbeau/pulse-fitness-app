import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ProgrammingNotesBlock } from './programming-notes-block';

describe('ProgrammingNotesBlock', () => {
  it('does not render when notes are empty', () => {
    const { container } = render(<ProgrammingNotesBlock notes="   " />);

    expect(container).toBeEmptyDOMElement();
  });

  it('renders trimmed notes with the standard programming note treatment', () => {
    render(
      <ProgrammingNotesBlock
        notes="  Keep elbows tucked and pause on chest.  "
        testId="exercise-programming-notes-id-1"
      />,
    );

    expect(screen.getByTestId('exercise-programming-notes-id-1')).toBeInTheDocument();
    expect(screen.getByText('Programming notes')).toBeInTheDocument();
    expect(screen.getByText('Keep elbows tucked and pause on chest.')).toBeInTheDocument();
  });
});
