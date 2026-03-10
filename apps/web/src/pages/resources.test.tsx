import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it } from 'vitest';

import { PREVIEW_BANNER_DEFAULT_MESSAGE } from '@/components/ui/preview-banner';
import { ResourcesPage } from '@/pages/resources';

describe('ResourcesPage', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it('renders resource content with the preview banner', () => {
    render(
      <MemoryRouter>
        <ResourcesPage />
      </MemoryRouter>,
    );

    expect(screen.getByText(PREVIEW_BANNER_DEFAULT_MESSAGE)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Resources' })).toBeInTheDocument();
  });
});
