import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ProfilePage } from '@/pages/profile';
import { createQueryClientWrapper } from '@/test/query-client';

type TestUser = {
  createdAt: number;
  id: string;
  name: string | null;
  username: string;
};

let user: TestUser;

function renderProfilePage() {
  const { wrapper } = createQueryClientWrapper();

  return render(
    <MemoryRouter>
      <ProfilePage />
    </MemoryRouter>,
    { wrapper },
  );
}

describe('ProfilePage', () => {
  beforeEach(() => {
    user = {
      createdAt: 1_713_139_200_000,
      id: 'user-1',
      name: 'Jordan Lee',
      username: 'jordan',
    };

    vi.stubGlobal(
      'fetch',
      vi.fn((input: string | URL | Request, init?: RequestInit) => {
        const rawUrl =
          typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
        const url = new URL(rawUrl, 'http://localhost');

        if (url.pathname === '/api/v1/users/me' && (!init?.method || init.method === 'GET')) {
          return Promise.resolve(
            new Response(JSON.stringify({ data: user }), {
              headers: { 'Content-Type': 'application/json' },
              status: 200,
            }),
          );
        }

        return Promise.resolve(
          new Response(JSON.stringify({ data: null }), {
            headers: { 'Content-Type': 'application/json' },
            status: 200,
          }),
        );
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders the user summary card and quick access destinations', () => {
    renderProfilePage();

    expect(screen.getByRole('heading', { name: 'Profile' })).toBeInTheDocument();
    expect(screen.getByText('Member since')).toBeInTheDocument();
  });

  it('shows authenticated user identity and honest destination summaries', async () => {
    renderProfilePage();

    expect(await screen.findByText('Jordan Lee')).toBeInTheDocument();
    expect(await screen.findByText('JL')).toBeInTheDocument();
    expect(screen.getByText('April 2024')).toBeInTheDocument();

    expect(screen.getByRole('link', { name: /Equipment/i })).toHaveAttribute(
      'href',
      '/profile/equipment',
    );
    expect(screen.getByRole('link', { name: /Health Tracking/i })).toHaveAttribute(
      'href',
      '/profile/injuries',
    );
    expect(screen.getByRole('link', { name: /Resources/i })).toHaveAttribute(
      'href',
      '/profile/resources',
    );
    expect(screen.getByRole('link', { name: /Settings/i })).toHaveAttribute('href', '/settings');

    expect(screen.getAllByText('Coming soon')).toHaveLength(3);
    expect(screen.getByText('Theme, targets, dashboard')).toBeInTheDocument();
    expect(screen.queryByText('Household')).not.toBeInTheDocument();
  });

  it('falls back to username for display name and initials when name is missing', async () => {
    user = {
      createdAt: 1_713_139_200_000,
      id: 'user-1',
      name: null,
      username: 'sam',
    };

    renderProfilePage();

    expect(await screen.findByText('sam')).toBeInTheDocument();
    expect(await screen.findByText('SA')).toBeInTheDocument();
  });

  it('uses the responsive quick access grid classes required by the prototype', () => {
    renderProfilePage();

    expect(screen.getByTestId('profile-quick-access-grid')).toHaveClass('grid-cols-2');
    expect(screen.getByTestId('profile-quick-access-grid')).toHaveClass('lg:grid-cols-4');
  });
});
