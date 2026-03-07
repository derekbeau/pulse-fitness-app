import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';

import { BackLink } from './back-link';

describe('BackLink', () => {
  it('uses the profile hub defaults', () => {
    render(
      <MemoryRouter>
        <BackLink />
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: /Back to Profile/i })).toHaveAttribute(
      'href',
      '/profile',
    );
  });

  it('accepts custom destination and label props', () => {
    render(
      <MemoryRouter>
        <BackLink label="Back to Settings" to="/settings" />
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: /Back to Settings/i })).toHaveAttribute(
      'href',
      '/settings',
    );
  });
});
