import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ErrorBoundary } from './error-boundary';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ErrorBoundary', () => {
  it('renders fallback UI when a child throws', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const Thrower = () => {
      throw new Error('boom');
    };

    render(
      <ErrorBoundary>
        <Thrower />
      </ErrorBoundary>,
    );

    expect(screen.getByRole('heading', { name: 'Something went wrong' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });

  it('retries rendering children when retry is clicked', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    let shouldThrow = true;

    const ThrowUntilRetry = () => {
      if (shouldThrow) {
        throw new Error('boom');
      }

      return <p>Recovered route content</p>;
    };

    render(
      <ErrorBoundary>
        <ThrowUntilRetry />
      </ErrorBoundary>,
    );

    shouldThrow = false;
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    expect(screen.getByText('Recovered route content')).toBeInTheDocument();
  });
});
