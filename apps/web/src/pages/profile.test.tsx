import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';

import { ProfilePage } from '@/pages/profile';

function renderProfilePage() {
  return render(
    <MemoryRouter>
      <ProfilePage />
    </MemoryRouter>,
  );
}

describe('ProfilePage', () => {
  it('renders the user summary card and quick access destinations', () => {
    renderProfilePage();

    expect(screen.getByRole('heading', { name: 'Profile' })).toBeInTheDocument();
    expect(screen.getByText('Jordan Lee')).toBeInTheDocument();
    expect(screen.getByText('JL')).toBeInTheDocument();
    expect(screen.getByText('Member since')).toBeInTheDocument();
    expect(screen.getByText('March 2024')).toBeInTheDocument();

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

    expect(screen.getByText('2 locations, 32 total items')).toBeInTheDocument();
    expect(screen.getByText('1 active condition')).toBeInTheDocument();
    expect(screen.getByText('8 resources')).toBeInTheDocument();
    expect(screen.getByText('Theme, targets, dashboard')).toBeInTheDocument();
  });

  it('uses the responsive quick access grid classes required by the prototype', () => {
    renderProfilePage();

    expect(screen.getByTestId('profile-quick-access-grid')).toHaveClass('grid-cols-2');
    expect(screen.getByTestId('profile-quick-access-grid')).toHaveClass('lg:grid-cols-4');
  });
});
