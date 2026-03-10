import { fireEvent, screen } from '@testing-library/react';
import type { Food } from '@pulse/shared';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { API_TOKEN_STORAGE_KEY } from '@/lib/api-client';
import { FoodsPage } from '@/pages/foods';
import { renderWithQueryClient } from '@/test/render-with-query-client';
import { jsonResponse } from '@/test/test-utils';

function createFood(id: string, name: string): Food {
  return {
    id,
    userId: 'user-1',
    name,
    brand: null,
    servingSize: '1 cup',
    servingGrams: 240,
    calories: 120,
    protein: 8,
    carbs: 12,
    fat: 4,
    fiber: null,
    sugar: null,
    verified: true,
    source: 'USDA',
    notes: null,
    lastUsedAt: Date.parse('2026-03-06T12:00:00.000Z'),
    createdAt: 1,
    updatedAt: 1,
  };
}

describe('FoodsPage', () => {
  beforeEach(() => {
    window.localStorage.setItem(API_TOKEN_STORAGE_KEY, 'test-token');
  });

  afterEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it('shows the page empty state and navigates to nutrition from the action', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const rawUrl =
        typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      const url = new URL(rawUrl, 'https://pulse.test');

      if (url.pathname === '/api/v1/foods') {
        return Promise.resolve(
          jsonResponse({
            data: [],
            meta: {
              page: 1,
              limit: 12,
              total: 0,
            },
          }),
        );
      }

      throw new Error(`Unhandled request: ${url.pathname}`);
    });

    renderWithQueryClient(
      <MemoryRouter initialEntries={['/foods']}>
        <Routes>
          <Route element={<FoodsPage />} path="/foods" />
          <Route element={<h1>Nutrition</h1>} path="/nutrition" />
        </Routes>
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole('heading', { name: 'Your food database is empty' }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Add Food' }));

    expect(await screen.findByRole('heading', { name: 'Nutrition' })).toBeInTheDocument();
  });

  it('renders the foods list when food data exists', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const rawUrl =
        typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      const url = new URL(rawUrl, 'https://pulse.test');

      if (url.pathname === '/api/v1/foods') {
        return Promise.resolve(
          jsonResponse({
            data: [createFood('food-1', 'Chicken Breast')],
            meta: {
              page: 1,
              limit: 12,
              total: 1,
            },
          }),
        );
      }

      throw new Error(`Unhandled request: ${url.pathname}`);
    });

    renderWithQueryClient(
      <MemoryRouter initialEntries={['/foods']}>
        <Routes>
          <Route element={<FoodsPage />} path="/foods" />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText('Search your foods database')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Your food database is empty' })).not.toBeInTheDocument();
  });
});
