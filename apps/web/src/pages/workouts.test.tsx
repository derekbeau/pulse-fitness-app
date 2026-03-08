import { fireEvent, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { renderWithQueryClient } from '@/test/render-with-query-client';
import { jsonResponse } from '@/test/test-utils';
import { WorkoutsPage } from './workouts';

describe('WorkoutsPage', () => {
  beforeEach(() => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url = new URL(String(input), 'https://pulse.test');

      if (url.pathname === '/api/v1/exercises') {
        return Promise.resolve(
          jsonResponse({
            data: [],
            meta: {
              page: Number(url.searchParams.get('page') ?? '1'),
              limit: Number(url.searchParams.get('limit') ?? '8'),
              total: 0,
            },
          }),
        );
      }

      throw new Error(`Unhandled request: ${url.pathname}`);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('switches between the workouts views', () => {
    renderWithQueryClient(
      <MemoryRouter initialEntries={['/workouts']}>
        <Routes>
          <Route element={<WorkoutsPage />} path="/workouts" />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: 'Workouts' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Calendar' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByText('Workout Calendar')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'List' }));

    expect(screen.getByRole('button', { name: 'List' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getAllByRole('heading', { level: 2 }).length).toBeGreaterThan(0);
    expect(screen.queryByText('Workout Calendar')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Templates' }));

    expect(screen.getByRole('heading', { level: 2, name: 'Templates' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Exercises' }));

    expect(screen.getByRole('heading', { level: 2, name: 'Exercise Library' })).toBeInTheDocument();
  });

  it('starts a selected template from the templates view', () => {
    renderWithQueryClient(
      <MemoryRouter initialEntries={['/workouts']}>
        <Routes>
          <Route element={<WorkoutsPage />} path="/workouts" />
          <Route element={<TemplateRouteProbe />} path="/workouts/active" />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Templates' }));
    fireEvent.click(screen.getByRole('button', { name: 'Lower Quad-Dominant' }));

    expect(screen.getByRole('heading', { name: 'Start Lower Quad-Dominant?' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Start workout' }));

    expect(
      screen.getByRole('heading', { name: 'Template lower-quad-dominant' }),
    ).toBeInTheDocument();
  });
});

function TemplateRouteProbe() {
  const location = useLocation();
  const templateId = new URLSearchParams(location.search).get('template');

  return <h1>{`Template ${templateId}`}</h1>;
}
