import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { AgentNotesBlock } from './agent-notes-block';

describe('AgentNotesBlock', () => {
  it('does not render when notes are empty', () => {
    const { container } = render(<AgentNotesBlock notes="   " />);

    expect(container).toBeEmptyDOMElement();
  });

  it('renders trimmed notes with generated timestamp', () => {
    render(
      <AgentNotesBlock
        notes="  Last session looked sharp. Increase weight by 5 lb today.  "
        notesMeta={{
          author: 'Coach Pulse',
          generatedAt: '2026-03-16T09:30:00.000Z',
          scheduledDateAtGeneration: '2026-03-16',
          stale: false,
        }}
        testId="exercise-agent-notes-id-1"
      />,
    );

    expect(screen.getByTestId('exercise-agent-notes-id-1')).toBeInTheDocument();
    expect(screen.getByText('For today')).toBeInTheDocument();
    expect(screen.getByText('Last session looked sharp. Increase weight by 5 lb today.')).toBeInTheDocument();
    expect(screen.getByText('generated Mar 16')).toBeInTheDocument();
  });

  it('renders stale label when metadata marks the note stale', () => {
    render(
      <AgentNotesBlock
        notes="Keep this session submaximal due to poor sleep."
        notesMeta={{
          author: 'Coach Pulse',
          generatedAt: '2026-03-12T09:30:00.000Z',
          scheduledDateAtGeneration: '2026-03-12',
          stale: true,
        }}
      />,
    );

    expect(screen.getByText(/possibly stale — rescheduled/i)).toBeInTheDocument();
  });
});
