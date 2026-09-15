import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { BODY_PROTOCOL_VERSION } from '@pulse/shared';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createQueryClientWrapper } from '@/test/query-client';
import {
  bodyDueFixture,
  populatedBodyAnalyticsFixture,
  populatedBodyCheckInFixture,
  populatedBodyPreferenceFixture,
} from '@/features/body-progress/body-progress-fixtures';
import { BodyCheckInDetailPage } from './body-check-in-detail';
import { BodyProgressPage } from './body-progress';

const json = (data: unknown, status = 200) => new Response(JSON.stringify({ data }), { status });

const historyFixture = {
  checkInId: populatedBodyCheckInFixture.id,
  currentVersion: populatedBodyCheckInFixture.version,
  versions: [
    {
      id: 'version-2',
      checkInId: populatedBodyCheckInFixture.id,
      version: 2,
      date: populatedBodyCheckInFixture.date,
      localTime: populatedBodyCheckInFixture.localTime,
      status: populatedBodyCheckInFixture.status,
      mealContext: populatedBodyCheckInFixture.mealContext,
      workoutContext: populatedBodyCheckInFixture.workoutContext,
      pumpPresent: populatedBodyCheckInFixture.pumpPresent,
      unusualBloating: populatedBodyCheckInFixture.unusualBloating,
      notes: populatedBodyCheckInFixture.notes,
      protocolVersion: populatedBodyCheckInFixture.protocolVersion,
      source: populatedBodyCheckInFixture.source,
      sourceId: populatedBodyCheckInFixture.sourceId,
      countAsScheduledOccurrence: true,
      completedAt: populatedBodyCheckInFixture.completedAt,
      actorSource: 'user',
      actorSourceId: null,
      changeKind: 'correction',
      changeReason: 'Corrected chest transcription.',
      recordedAt: populatedBodyCheckInFixture.updatedAt,
      measurements: populatedBodyCheckInFixture.measurements,
    },
  ],
};

function renderAt(path: string, fetchMock: typeof fetch, detail = false) {
  vi.stubGlobal('fetch', fetchMock);
  const { wrapper } = createQueryClientWrapper();
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/body" element={<BodyProgressPage />} />
        <Route path="/body/check-ins/:id" element={<BodyCheckInDetailPage />} />
        <Route path="/deleted" element={<p>Deleted destination</p>} />
      </Routes>
    </MemoryRouter>,
    { wrapper },
  );
  return detail;
}

describe('Body Progress pages', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('renders populated, agent-created, corrected, and partial legacy history honestly', async () => {
    renderAt(
      '/body',
      vi.fn(async (input) => {
        const path = new URL(
          typeof input === 'string' ? input : input instanceof URL ? input : input.url,
          'http://test',
        ).pathname;
        if (path.endsWith('/preferences')) return json(populatedBodyPreferenceFixture);
        if (path.endsWith('/due')) return json(bodyDueFixture('satisfied'));
        if (path.endsWith('/analytics')) return json(populatedBodyAnalyticsFixture);
        if (path.endsWith('/body-measurements'))
          return new Response(JSON.stringify({ error: { code: 'FAILED', message: 'failed' } }), {
            status: 500,
          });
        return new Response(
          JSON.stringify({
            data: [populatedBodyCheckInFixture],
            meta: { page: 1, limit: 200, total: 1 },
          }),
          { status: 200 },
        );
      }) as typeof fetch,
    );

    expect(await screen.findByText('Latest completed check-in')).toBeInTheDocument();
    expect(screen.getAllByText(/Added by agent|Created by AgentToken/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/corrected/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText('High variance').length).toBeGreaterThan(0);
    expect(await screen.findByText('Maintenance signal')).toBeInTheDocument();
    expect(screen.getByText('181.4 lbs')).toBeInTheDocument();
    expect(screen.getByText(/Workout exposure is not treated as strength/)).toBeInTheDocument();
    expect(
      await screen.findByText(/Historical scalar measurements could not be loaded/),
    ).toBeInTheDocument();
  });

  it('keeps chart, exact table, markers, raw readings, and range requests source-bound', async () => {
    const requestedUrls: string[] = [];
    renderAt(
      '/body',
      vi.fn(async (input) => {
        const url = new URL(
          typeof input === 'string' ? input : input instanceof URL ? input : input.url,
          'http://test',
        );
        requestedUrls.push(url.toString());
        if (url.pathname.endsWith('/preferences')) return json(populatedBodyPreferenceFixture);
        if (url.pathname.endsWith('/due')) return json(bodyDueFixture('satisfied'));
        if (url.pathname.endsWith('/analytics')) {
          return json({
            ...populatedBodyAnalyticsFixture,
            range: {
              ...populatedBodyAnalyticsFixture.range,
              preset: url.searchParams.get('range'),
            },
          });
        }
        if (url.pathname.endsWith('/body-measurements')) return json([]);
        return new Response(
          JSON.stringify({
            data: [populatedBodyCheckInFixture],
            meta: { page: 1, limit: 200, total: 1 },
          }),
          { status: 200 },
        );
      }) as typeof fetch,
    );

    expect(
      await screen.findByRole('img', { name: 'Body Progress circumference chart' }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByText('View exact chart values and raw readings'));
    const table = screen.getByRole('table', {
      name: 'Exact Body Progress chart values and provenance',
    });
    expect(table).toHaveTextContent('84.8 cm · 85.2 cm');
    expect(table).toHaveTextContent(BODY_PROTOCOL_VERSION);
    fireEvent.click(screen.getByRole('button', { name: /Inspect Waist on Aug 15, 2026/ }));
    expect(screen.getByLabelText('Selected Body Progress evidence')).toHaveTextContent(
      'raw 84.8 cm, 85.2 cm',
    );
    fireEvent.click(screen.getByRole('button', { name: /Sep 15, 2026 · Corrected body check-in/ }));
    expect(screen.getByLabelText('Selected Body Progress evidence')).toHaveTextContent(
      'Corrected body check-in',
    );
    fireEvent.click(screen.getByRole('button', { name: '6M' }));
    await waitFor(() => expect(requestedUrls.some((url) => url.includes('range=6m'))).toBe(true));
  });

  it('renders exact readings, protocol provenance, and immutable history', async () => {
    renderAt(
      '/body/check-ins/check-in-complete',
      vi.fn(async (input) => {
        const path = new URL(
          typeof input === 'string' ? input : input instanceof URL ? input : input.url,
          'http://test',
        ).pathname;
        if (path.endsWith('/preferences')) return json(populatedBodyPreferenceFixture);
        if (path.endsWith('/due')) return json(bodyDueFixture('satisfied'));
        if (path.endsWith('/history')) return json(historyFixture);
        return json(populatedBodyCheckInFixture);
      }) as typeof fetch,
      true,
    );

    expect(await screen.findByRole('table', { name: /Raw and canonical/ })).toHaveTextContent(
      '84.2 cm',
    );
    expect(screen.getByText(/exact server version 2/i)).toBeInTheDocument();
    expect(screen.getAllByText(/body-circumference-v1/).length).toBeGreaterThan(0);
    expect(await screen.findByText(/Version 2 · correction/)).toBeInTheDocument();
    expect(screen.getAllByText(/Created by AgentToken/).length).toBeGreaterThan(0);
  });

  it('deletes only after confirmation and invalidates back to Body Progress', async () => {
    let deleted = false;
    renderAt(
      '/body/check-ins/check-in-complete',
      vi.fn(async (input, init) => {
        const path = new URL(
          typeof input === 'string' ? input : input instanceof URL ? input : input.url,
          'http://test',
        ).pathname;
        if (init?.method === 'DELETE') {
          deleted = true;
          return json({ deleted: true, id: populatedBodyCheckInFixture.id });
        }
        if (path.endsWith('/preferences')) return json(populatedBodyPreferenceFixture);
        if (path.endsWith('/due')) return json(bodyDueFixture('satisfied'));
        if (path.endsWith('/history')) return json(historyFixture);
        return json(populatedBodyCheckInFixture);
      }) as typeof fetch,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));
    expect(screen.getByRole('alertdialog')).toHaveTextContent('cannot be restored');
    expect(deleted).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Delete check-in' }));
    await waitFor(() => expect(deleted).toBe(true));
  });

  it('shows retryable primary loading errors without inventing check-in data', async () => {
    renderAt(
      '/body',
      vi.fn(async (input) => {
        const path = new URL(
          typeof input === 'string' ? input : input instanceof URL ? input : input.url,
          'http://test',
        ).pathname;
        if (path.endsWith('/preferences')) return json(populatedBodyPreferenceFixture);
        if (path.endsWith('/due')) return json(bodyDueFixture('upcoming'));
        return new Response(JSON.stringify({ error: { code: 'FAILED', message: 'failed' } }), {
          status: 500,
        });
      }) as typeof fetch,
    );
    expect(await screen.findByText('History could not be loaded.')).toBeInTheDocument();
    expect(
      await screen.findByText('Body Progress analytics could not be loaded'),
    ).toBeInTheDocument();
    expect(screen.queryByText('84.5 cm')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry history' })).toBeInTheDocument();
  });

  it.each([
    ['insufficient', 'insufficient_data', 'Direction is not ready'],
    ['stale', 'stale', 'Measurements are stale'],
  ] as const)(
    'renders the server-owned %s analytics state without client inference',
    async (readiness, signal, expected) => {
      renderAt(
        '/body',
        vi.fn(async (input) => {
          const path = new URL(
            typeof input === 'string' ? input : input instanceof URL ? input : input.url,
            'http://test',
          ).pathname;
          if (path.endsWith('/preferences')) return json(populatedBodyPreferenceFixture);
          if (path.endsWith('/due')) return json(bodyDueFixture('satisfied'));
          if (path.endsWith('/analytics')) {
            return json({
              ...populatedBodyAnalyticsFixture,
              readiness: { ...populatedBodyAnalyticsFixture.readiness, state: readiness },
              segments: populatedBodyAnalyticsFixture.segments.map((segment) => ({
                ...segment,
                analysis: {
                  ...segment.analysis,
                  state: readiness === 'stale' ? 'stale' : 'insufficient',
                  direction: 'unavailable',
                },
              })),
              signal: { ...populatedBodyAnalyticsFixture.signal, state: signal },
            });
          }
          if (path.endsWith('/body-measurements')) return json([]);
          return new Response(
            JSON.stringify({
              data: [populatedBodyCheckInFixture],
              meta: { page: 1, limit: 200, total: 1 },
            }),
            { status: 200 },
          );
        }) as typeof fetch,
      );
      expect(await screen.findByText(expected)).toBeInTheDocument();
      expect(
        screen.queryByRole('img', { name: 'Body Progress circumference chart' }),
      ).not.toBeInTheDocument();
    },
  );

  it('does not infer setup when the preferences authority fails', async () => {
    renderAt(
      '/body',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ error: { code: 'FAILED', message: 'failed' } }), {
            status: 500,
          }),
      ) as typeof fetch,
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Body Progress preferences could not be loaded',
    );
    expect(screen.queryByText('Set up Body Progress')).not.toBeInTheDocument();
  });
});
