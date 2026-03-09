import { fireEvent, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useParams } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { API_TOKEN_STORAGE_KEY } from '@/lib/api-client';
import { renderWithQueryClient } from '@/test/render-with-query-client';
import { jsonResponse } from '@/test/test-utils';
import { WorkoutsPage } from './workouts';

describe('WorkoutsPage', () => {
  beforeEach(() => {
    window.localStorage.setItem(API_TOKEN_STORAGE_KEY, 'test-token');

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

      if (url.pathname === '/api/v1/exercises/filters') {
        return Promise.resolve(
          jsonResponse({
            data: {
              equipment: [],
              muscleGroups: [],
            },
          }),
        );
      }

      throw new Error(`Unhandled request: ${url.pathname}`);
    });
  });

  afterEach(() => {
    window.localStorage.removeItem(API_TOKEN_STORAGE_KEY);
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

  it('opens template detail when selecting a template card from the templates view', () => {
    renderWithQueryClient(
      <MemoryRouter initialEntries={['/workouts']}>
        <Routes>
          <Route element={<WorkoutsPage />} path="/workouts" />
          <Route element={<TemplateRouteProbe />} path="/workouts/template/:templateId" />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Templates' }));
    fireEvent.click(screen.getByRole('link', { name: 'Lower Quad-Dominant' }));

    expect(
      screen.getByRole('heading', { name: 'Template lower-quad-dominant' }),
    ).toBeInTheDocument();
  });

  it('filters templates by name with the search input', () => {
    renderWithQueryClient(
      <MemoryRouter initialEntries={['/workouts']}>
        <Routes>
          <Route element={<WorkoutsPage />} path="/workouts" />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Templates' }));

    expect(screen.getByRole('searchbox', { name: /search templates by name/i })).toHaveAttribute(
      'id',
      'template-search',
    );
    expect(screen.getByRole('link', { name: 'Upper Push' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Lower Quad-Dominant' })).toBeInTheDocument();

    fireEvent.change(screen.getByRole('searchbox', { name: /search templates by name/i }), {
      target: { value: 'upper' },
    });

    expect(screen.getByRole('link', { name: 'Upper Push' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Lower Quad-Dominant' })).not.toBeInTheDocument();
  });
});

function TemplateRouteProbe() {
  const { templateId } = useParams();

  return <h1>{`Template ${templateId}`}</h1>;
}
