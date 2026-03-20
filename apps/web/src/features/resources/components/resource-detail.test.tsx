import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';

import { mockResources } from '..';
import type { Resource } from '../types';
import { ResourceDetail } from './resource-detail';

describe('ResourceDetail', () => {
  it('renders the full resource detail layout for a populated resource', () => {
    const resource = mockResources.find((item) => item.id === 'mcgill-big-3');
    if (!resource) throw new Error('mcgill-big-3 missing from mockResources');

    render(
      <MemoryRouter>
        <ResourceDetail resource={resource} />
      </MemoryRouter>,
    );

    expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'McGill Big 3' })).toBeInTheDocument();
    expect(screen.getByText('Program')).toBeInTheDocument();
    expect(screen.getByText('Dr. Stuart McGill')).toBeInTheDocument();
    expect(screen.getByText('spine health')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Key Principles & Methods' })).toBeInTheDocument();
    expect(screen.getByText('Modified curl-up')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Exercises from this Resource' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Bird Dog' })).toHaveAttribute(
      'href',
      '/workouts?view=exercises&exercise=bird-dog',
    );
    expect(screen.getByRole('heading', { name: 'Related Health Protocols' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View condition' })).toHaveAttribute(
      'href',
      '/profile/injuries/lower-back-disc-herniation',
    );
    expect(screen.getByText('Upload Resource Document')).toBeInTheDocument();
    expect(screen.getByText('Coming Soon')).toBeInTheDocument();
    expect(screen.getByText('PDF, EPUB, TXT')).toBeInTheDocument();
  });

  it('renders empty-state copy for missing linked items', () => {
    const resource: Resource = {
      ...mockResources[0],
      linkedExercises: [],
      linkedProtocols: [],
    };

    render(
      <MemoryRouter>
        <ResourceDetail resource={resource} />
      </MemoryRouter>,
    );

    expect(screen.getByText('No linked exercises')).toBeInTheDocument();
    expect(screen.getByText('No linked protocols')).toBeInTheDocument();
  });

  it('renders a not-found state when the resource lookup fails', () => {
    render(
      <MemoryRouter>
        <ResourceDetail />
      </MemoryRouter>,
    );

    expect(
      screen.getByRole('heading', { level: 1, name: 'Resource not found' }),
    ).toBeInTheDocument();
    expect(
      screen.getAllByText(
        'The requested resource is not available in the current prototype library.',
      ).length,
    ).toBeGreaterThan(0);
  });
});
