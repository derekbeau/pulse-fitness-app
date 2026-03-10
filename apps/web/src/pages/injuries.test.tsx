import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it } from 'vitest';

import { PREVIEW_BANNER_DEFAULT_MESSAGE } from '@/components/ui/preview-banner';
import { InjuriesPage } from '@/pages/injuries';

describe('InjuriesPage', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it('renders health tracking content with the preview banner', () => {
    render(
      <MemoryRouter>
        <InjuriesPage />
      </MemoryRouter>,
    );

    expect(screen.getByText(PREVIEW_BANNER_DEFAULT_MESSAGE)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Health Tracking' })).toBeInTheDocument();
  });
});
