import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createQueryClientWrapper } from '@/test/query-client';
import { bodyDueFixture } from '../body-progress-fixtures';
import { BodyDueCard } from './body-due-card';

function renderDue(state: Parameters<typeof bodyDueFixture>[0]) {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ data: bodyDueFixture(state) }), { status: 200 }),
      ),
  );
  const { wrapper } = createQueryClientWrapper();
  render(
    <MemoryRouter>
      <BodyDueCard />
    </MemoryRouter>,
    { wrapper },
  );
}

describe('BodyDueCard', () => {
  afterEach(() => vi.unstubAllGlobals());

  it.each([
    ['not_configured', 'Set up Body Progress'],
    ['upcoming', 'Next check-in is upcoming'],
    ['due_today', 'Body check-in is due today'],
    ['overdue', 'Body check-in is ready'],
    ['snoozed', 'Body check-in is snoozed'],
    ['skipped_current_occurrence', 'Current check-in skipped'],
    ['satisfied', 'Scheduled check-in complete'],
    ['error', 'Due state unavailable'],
  ] as const)('renders server state %s with text, not color alone', async (state, title) => {
    renderDue(state);
    expect(await screen.findByText(title)).toBeInTheDocument();
    expect(screen.getByText('America/Detroit')).toBeInTheDocument();
  });

  it('renders a retryable error without guessing a date', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: { code: 'TIME_ZONE_REQUIRED', message: 'Time zone required' },
          }),
          { status: 409 },
        ),
      ),
    );
    const { wrapper } = createQueryClientWrapper();
    render(
      <MemoryRouter>
        <BodyDueCard />
      </MemoryRouter>,
      { wrapper },
    );
    expect(await screen.findByRole('alert')).toHaveTextContent('No date was guessed');
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });
});
