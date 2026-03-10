import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';

import { TemplateBrowser } from './template-browser';

describe('TemplateBrowser', () => {
  it('renders updated copy and empty state for users without templates', () => {
    render(
      <MemoryRouter>
        <TemplateBrowser buildTemplateHref={(templateId) => `/workouts/template/${templateId}`} />
      </MemoryRouter>,
    );

    expect(
      screen.getByText(
        'Launch one of your saved templates and jump straight into an active workout.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('No templates yet — create your first one.')).toBeInTheDocument();
    expect(screen.getByLabelText('Search templates by name')).toHaveClass('pl-9');
  });

  it('filters templates by search query', () => {
    render(
      <MemoryRouter>
        <TemplateBrowser
          buildTemplateHref={(templateId) => `/workouts/template/${templateId}`}
          templates={[
            {
              id: 'template-1',
              name: 'Upper Push',
              description: 'Chest and shoulders',
              tags: ['push'],
              sections: [{ exercises: [] }],
            },
            {
              id: 'template-2',
              name: 'Lower Body',
              description: 'Leg training',
              tags: ['legs'],
              sections: [{ exercises: [] }],
            },
          ]}
        />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText('Search templates by name'), {
      target: { value: 'lower' },
    });

    expect(screen.getByRole('link', { name: 'Lower Body' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Upper Push' })).not.toBeInTheDocument();
  });
});
