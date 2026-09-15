import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createQueryClientWrapper } from '@/test/query-client';
import { bodyDueFixture, populatedBodyPreferenceFixture } from '../body-progress-fixtures';
import { BodyPreferencesForm } from './body-preferences-form';

describe('BodyPreferencesForm', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('shows server defaults, exact sites, authority, units, and persists setup', async () => {
    let saved: Record<string, unknown> | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const path = new URL(
          typeof input === 'string' ? input : input instanceof URL ? input : input.url,
          'http://test',
        ).pathname;
        if (path.endsWith('/preferences') && init?.method === 'PATCH') {
          saved = JSON.parse(String(init.body));
          return new Response(JSON.stringify({ data: populatedBodyPreferenceFixture }), {
            status: 200,
          });
        }
        if (path.endsWith('/preferences'))
          return new Response(JSON.stringify({ data: null }), { status: 200 });
        return new Response(JSON.stringify({ data: bodyDueFixture('not_configured') }), {
          status: 200,
        });
      }),
    );
    const { wrapper } = createQueryClientWrapper();
    render(
      <MemoryRouter>
        <BodyPreferencesForm />
      </MemoryRouter>,
      { wrapper },
    );

    expect(await screen.findByText('Set up Body Progress')).toBeInTheDocument();
    expect(screen.getByText(/product default, not a medical standard/i)).toBeInTheDocument();
    expect(screen.getByLabelText('NHANES iliac-crest waist')).toBeChecked();
    expect(screen.getByRole('radiogroup', { name: 'Length unit' })).toBeInTheDocument();
    expect(screen.getByText(/Server local date: 2026-09-15/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Finish setup' }));
    await waitFor(() =>
      expect(saved).toMatchObject({
        measurementCadenceDays: 14,
        lengthUnit: 'cm',
        cadenceChange: 'restart',
        restartAnchorDate: '2026-09-15',
      }),
    );
  });

  it('validates custom cadence and at least one enabled site', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        const path = new URL(
          typeof input === 'string' ? input : input instanceof URL ? input : input.url,
          'http://test',
        ).pathname;
        return new Response(
          JSON.stringify({
            data: path.endsWith('/preferences') ? null : bodyDueFixture('not_configured'),
          }),
          { status: 200 },
        );
      }),
    );
    const { wrapper } = createQueryClientWrapper();
    render(
      <MemoryRouter>
        <BodyPreferencesForm />
      </MemoryRouter>,
      { wrapper },
    );
    await screen.findByText('Set up Body Progress');
    fireEvent.click(screen.getByLabelText('Custom'));
    fireEvent.change(screen.getByLabelText('Custom cadence (7–90 days)'), {
      target: { value: '91' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Finish setup' }));
    expect(await screen.findByText('Use 7–90 days')).toBeInTheDocument();
  });

  it('does not mistake a failed preference request for first-time setup', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ error: { code: 'FAILED', message: 'failed' } }), {
            status: 500,
          }),
      ),
    );
    const { wrapper } = createQueryClientWrapper();
    render(
      <MemoryRouter>
        <BodyPreferencesForm />
      </MemoryRouter>,
      { wrapper },
    );
    expect(await screen.findByRole('alert')).toHaveTextContent('Body Progress setup unavailable');
    expect(screen.queryByText('Set up Body Progress')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry setup' })).toBeInTheDocument();
  });
});
