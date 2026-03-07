import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';

import { ProfileEquipmentPage } from '@/pages/profile-equipment';
import { ProfileInjuriesPage } from '@/pages/profile-injuries';
import { ProfileResourcesPage } from '@/pages/profile-resources';

const subpages = [
  {
    component: ProfileEquipmentPage,
    heading: 'Equipment',
  },
  {
    component: ProfileInjuriesPage,
    heading: 'Injuries',
  },
  {
    component: ProfileResourcesPage,
    heading: 'Resources',
  },
] as const;

describe('Profile sub-pages', () => {
  it.each(subpages)(
    'renders $heading with a back-link to the profile hub',
    ({ component: Page, heading }) => {
      render(
        <MemoryRouter>
          <Page />
        </MemoryRouter>,
      );

      expect(screen.getByRole('heading', { name: heading })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /Back to Profile/i })).toHaveAttribute(
        'href',
        '/profile',
      );
    },
  );
});
