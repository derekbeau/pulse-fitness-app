import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useParams } from 'react-router';
import { describe, expect, it } from 'vitest';

import { mockResources } from '..';
import { ResourceGrid } from './resource-grid';

describe('ResourceGrid', () => {
  it('filters resources by type and search query, then navigates to the detail route', () => {
    render(
      <MemoryRouter initialEntries={['/profile/resources']}>
        <Routes>
          <Route element={<ResourceGrid resources={mockResources} />} path="/profile/resources" />
          <Route element={<ResourceRouteProbe />} path="/profile/resources/:resourceId" />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: 'Resources' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /^Open / })).toHaveLength(mockResources.length);

    fireEvent.click(screen.getByRole('button', { name: 'Books' }));
    expect(screen.getByRole('link', { name: 'Open Starting Strength' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Open McGill Big 3' })).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Search'), {
      target: { value: 'barbell' },
    });
    expect(screen.getByRole('link', { name: 'Open Starting Strength' })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Search'), {
      target: { value: 'mobility' },
    });
    expect(screen.getByText('No resources found')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'All' }));
    expect(screen.getByRole('link', { name: 'Open Strength Side' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('link', { name: 'Open Strength Side' }));
    expect(screen.getByRole('heading', { name: 'Resource strength-side' })).toBeInTheDocument();
  });
});

function ResourceRouteProbe() {
  const { resourceId } = useParams();

  return <h1>{`Resource ${resourceId}`}</h1>;
}
