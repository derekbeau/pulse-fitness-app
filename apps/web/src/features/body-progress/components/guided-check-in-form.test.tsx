import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { BodyCheckIn, BodyEnabledSite } from '@pulse/shared';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createQueryClientWrapper } from '@/test/query-client';
import { populatedBodyCheckInFixture } from '../body-progress-fixtures';
import { GuidedCheckInForm } from './guided-check-in-form';

const waist = [{ site: 'waist_iliac_crest_nhanes', laterality: 'none' }] as const;

function renderForm(
  fetchMock: typeof fetch = vi.fn(),
  options: {
    entry?: BodyCheckIn;
    enabledSites?: BodyEnabledSite[];
  } = {},
) {
  vi.stubGlobal('fetch', fetchMock);
  const { wrapper } = createQueryClientWrapper();
  return render(
    <MemoryRouter initialEntries={['/body?check-in=1']}>
      <Routes>
        <Route
          path="body"
          element={
            <GuidedCheckInForm
              dueState="due_today"
              enabledSites={options.enabledSites ?? [...waist]}
              entry={options.entry}
              lengthUnit="cm"
              serverLocalDate="2026-09-15"
            />
          }
        />
        <Route path="body/check-ins/:id" element={<p>Saved detail</p>} />
      </Routes>
    </MemoryRouter>,
    { wrapper },
  );
}

describe('GuidedCheckInForm', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('opens without randomUUID and reuses one fallback key across rerender and retry', async () => {
    const nativeCrypto = globalThis.crypto;
    vi.stubGlobal('crypto', {
      getRandomValues: nativeCrypto.getRandomValues.bind(nativeCrypto),
    });
    const bodies: Array<Record<string, unknown>> = [];
    const fetchMock = vi.fn(async (_input, init) => {
      bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      if (bodies.length === 1) {
        return new Response(
          JSON.stringify({ error: { code: 'TEMPORARY_FAILURE', message: 'retry this operation' } }),
          { status: 503 },
        );
      }
      return new Response(
        JSON.stringify({
          data: { ...populatedBodyCheckInFixture, source: 'user', sourceId: null },
        }),
        { status: 201 },
      );
    }) as typeof fetch;
    renderForm(fetchMock);

    expect(screen.getByTestId('guided-check-in-form')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Reading 1 (cm)'), { target: { value: '84.0' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('retry this operation');
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    await screen.findByText('Saved detail');

    expect(bodies).toHaveLength(2);
    expect(bodies[0]?.idempotencyKey).toMatch(/^body-ui-[0-9a-f-]{36}$/u);
    expect(bodies[1]?.idempotencyKey).toBe(bodies[0]?.idempotencyKey);
  });

  it('renders a controlled unavailable state when browser crypto is absent', () => {
    vi.stubGlobal('crypto', undefined);
    renderForm();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Secure identifier generation is unavailable',
    );
    expect(screen.getByRole('button', { name: 'Save draft' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Complete check-in' })).toBeDisabled();
  });

  it('ships exact protocol media and focuses reading three above server tolerance', async () => {
    renderForm();
    expect(
      screen.getByRole('img', { name: /NHANES iliac-crest waist landmark diagram/ }),
    ).toBeInTheDocument();
    expect(screen.getAllByText(/immediately above the right iliac crest/).length).toBeGreaterThan(
      0,
    );
    fireEvent.change(screen.getByLabelText('Reading 1 (cm)'), { target: { value: '84.0' } });
    fireEvent.change(screen.getByLabelText('Reading 2 (cm)'), { target: { value: '85.2' } });
    const third = await screen.findByLabelText('Reading 3 (cm)');
    await waitFor(() => expect(third).toHaveFocus());
    expect(screen.getByText(/third reading will improve/i)).toBeInTheDocument();
  });

  it('saves discordant two-reading work as a server draft with raw values', async () => {
    let body: Record<string, unknown> | undefined;
    renderForm(
      vi.fn(async (_input, init) => {
        body = JSON.parse(String(init?.body));
        return new Response(
          JSON.stringify({
            data: {
              ...populatedBodyCheckInFixture,
              id: 'draft-1',
              status: 'draft',
              version: 1,
              completedAt: null,
              correctedAt: null,
              correctedBySource: null,
              correctedBySourceId: null,
              correctionReason: null,
              source: 'user',
              sourceId: null,
            },
          }),
          { status: 201 },
        );
      }) as typeof fetch,
    );
    fireEvent.change(screen.getByLabelText('Reading 1 (cm)'), { target: { value: '84.0' } });
    fireEvent.change(screen.getByLabelText('Reading 2 (cm)'), { target: { value: '85.2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    await screen.findByText('Saved detail');
    expect(body).toMatchObject({
      status: 'draft',
      date: '2026-09-15',
      countAsScheduledOccurrence: true,
      measurements: [{ readings: [84, 85.2], unit: 'cm' }],
    });
  });

  it('allows a visibly lower-confidence single-reading completion and optional waist omission', async () => {
    let body: Record<string, unknown> | undefined;
    renderForm(
      vi.fn(async (_input, init) => {
        body = JSON.parse(String(init?.body));
        return new Response(
          JSON.stringify({
            data: { ...populatedBodyCheckInFixture, source: 'user', sourceId: null },
          }),
          { status: 201 },
        );
      }) as typeof fetch,
    );
    fireEvent.change(screen.getByLabelText('Reading 1 (cm)'), { target: { value: '84.0' } });
    expect(screen.getByText(/Single reading · lower confidence/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Complete check-in' }));
    await screen.findByText('Saved detail');
    expect(body).toMatchObject({ status: 'completed', measurements: [{ readings: [84] }] });
  });

  it('preserves input and offers the existing record on duplicate-date 409', async () => {
    renderForm(
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: {
              code: 'BODY_CHECK_IN_DATE_CONFLICT',
              message: 'duplicate',
              existingId: 'existing-1',
            },
          }),
          { status: 409 },
        ),
      ) as typeof fetch,
    );
    fireEvent.change(screen.getByLabelText('Reading 1 (cm)'), { target: { value: '84.0' } });
    fireEvent.click(screen.getByRole('button', { name: 'Complete check-in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Your input is still here');
    expect(screen.getByLabelText('Reading 1 (cm)')).toHaveValue(84);
    expect(screen.getByRole('link', { name: 'Open the existing check-in' })).toHaveAttribute(
      'href',
      '/body/check-ins/existing-1',
    );
  });

  it('retains all three raw values and warns without shaming on high variance', async () => {
    renderForm();
    fireEvent.change(screen.getByLabelText('Reading 1 (cm)'), { target: { value: '84.0' } });
    fireEvent.change(screen.getByLabelText('Reading 2 (cm)'), { target: { value: '85.2' } });
    fireEvent.change(await screen.findByLabelText('Reading 3 (cm)'), {
      target: { value: '88.0' },
    });
    expect(
      screen.getByText(/High variance · keep the values and consider remeasuring/),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Reading 1 (cm)')).toHaveValue(84);
    expect(screen.getByLabelText('Reading 2 (cm)')).toHaveValue(85.2);
    expect(screen.getByLabelText('Reading 3 (cm)')).toHaveValue(88);
  });

  it('resumes a server draft with its exact version in the PATCH', async () => {
    let body: Record<string, unknown> | undefined;
    const draft = {
      ...populatedBodyCheckInFixture,
      status: 'draft' as const,
      completedAt: null,
      correctionReason: null,
      correctedAt: null,
      correctedBySource: null,
      correctedBySourceId: null,
    };
    renderForm(
      vi.fn(async (_input, init) => {
        body = JSON.parse(String(init?.body));
        return new Response(JSON.stringify({ data: draft }), { status: 200 });
      }) as typeof fetch,
      { entry: draft },
    );
    expect(screen.getByText('Resume draft')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    await screen.findByText('Saved detail');
    expect(body).toMatchObject({ expectedVersion: 2, status: 'draft' });
    expect(body).not.toHaveProperty('measurements');
  });

  it('keeps disabled historical sites visible and omits measurements from a context-only correction', async () => {
    let body: Record<string, unknown> | undefined;
    const entry = {
      ...populatedBodyCheckInFixture,
      measurements: populatedBodyCheckInFixture.measurements.map((measurement, index) =>
        index === 0
          ? {
              ...measurement,
              protocolName: 'Frozen predecessor waist protocol',
              protocolInstructions: 'Frozen predecessor instructions.',
            }
          : measurement,
      ),
    };
    renderForm(
      vi.fn(async (_input, init) => {
        body = JSON.parse(String(init?.body));
        return new Response(JSON.stringify({ data: entry }), { status: 200 });
      }) as typeof fetch,
      {
        entry,
        enabledSites: [{ site: 'neck_below_larynx_relaxed', laterality: 'none' }],
      },
    );

    expect(screen.getByText('Frozen predecessor waist protocol')).toBeInTheDocument();
    expect(screen.getByText('Frozen predecessor instructions.')).toBeInTheDocument();
    expect(screen.getAllByText('Remove this saved measurement')).toHaveLength(2);
    expect(screen.getByText('Relaxed neck below the larynx')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Notes'), { target: { value: 'Context only update' } });
    fireEvent.change(screen.getByLabelText('Correction reason'), {
      target: { value: 'Corrected context only' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save correction' }));
    await screen.findByText('Saved detail');

    expect(body).toMatchObject({
      expectedVersion: 2,
      notes: 'Context only update',
      correctionReason: 'Corrected context only',
    });
    expect(body).not.toHaveProperty('measurements');
  });

  it('resumes a draft from saved measurement identities after preferences drift', async () => {
    let body: Record<string, unknown> | undefined;
    const draft = {
      ...populatedBodyCheckInFixture,
      status: 'draft' as const,
      completedAt: null,
      correctedAt: null,
      correctedBySource: null,
      correctedBySourceId: null,
      correctionReason: null,
    };
    renderForm(
      vi.fn(async (_input, init) => {
        body = JSON.parse(String(init?.body));
        return new Response(JSON.stringify({ data: draft }), { status: 200 });
      }) as typeof fetch,
      {
        entry: draft,
        enabledSites: [{ site: 'neck_below_larynx_relaxed', laterality: 'none' }],
      },
    );

    expect(screen.getByText('NHANES iliac-crest waist')).toBeInTheDocument();
    expect(screen.getByText('Relaxed nipple-line chest')).toBeInTheDocument();
    expect(screen.getByText('Relaxed neck below the larynx')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    await screen.findByText('Saved detail');
    expect(body).not.toHaveProperty('measurements');
  });

  it('preserves the disabled side when correcting the other side after Both to Right drift', async () => {
    let body: Record<string, unknown> | undefined;
    const armMeasurements = populatedBodyCheckInFixture.measurements.map((measurement, index) => ({
      ...measurement,
      id: `arm-${index}`,
      site: 'upper_arm_midpoint_flexed' as const,
      laterality: (index === 0 ? 'left' : 'right') as 'left' | 'right',
      reading1Mm: index === 0 ? 351 : 358,
      reading2Mm: null,
      reading3Mm: null,
      canonicalMm: index === 0 ? 351 : 358,
      quality: 'single_reading' as const,
      selectedReadingPair: null,
      protocolId: 'upper_arm_midpoint_flexed' as const,
    }));
    const entry = { ...populatedBodyCheckInFixture, measurements: armMeasurements };
    renderForm(
      vi.fn(async (_input, init) => {
        body = JSON.parse(String(init?.body));
        return new Response(JSON.stringify({ data: entry }), { status: 200 });
      }) as typeof fetch,
      {
        entry,
        enabledSites: [{ site: 'upper_arm_midpoint_flexed', laterality: 'right' }],
      },
    );

    const left = screen
      .getByTestId('guided-check-in-form')
      .querySelector('[data-measurement-key="upper_arm_midpoint_flexed:left"]');
    const right = screen
      .getByTestId('guided-check-in-form')
      .querySelector('[data-measurement-key="upper_arm_midpoint_flexed:right"]');
    expect(left).not.toBeNull();
    expect(right).not.toBeNull();
    fireEvent.change(within(right as HTMLElement).getByLabelText('Reading 1 (cm)'), {
      target: { value: '36.1' },
    });
    fireEvent.change(screen.getByLabelText('Correction reason'), {
      target: { value: 'Corrected right arm reading' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save correction' }));
    await screen.findByText('Saved detail');

    expect(body?.measurements).toEqual([
      expect.objectContaining({ laterality: 'left', readings: [35.1] }),
      expect.objectContaining({ laterality: 'right', readings: [36.1] }),
    ]);
  });

  it('removes an existing measurement only through its visible removal control', async () => {
    let body: Record<string, unknown> | undefined;
    renderForm(
      vi.fn(async (_input, init) => {
        body = JSON.parse(String(init?.body));
        return new Response(JSON.stringify({ data: populatedBodyCheckInFixture }), { status: 200 });
      }) as typeof fetch,
      { entry: populatedBodyCheckInFixture, enabledSites: [] },
    );
    const removalControls = screen.getAllByLabelText('Remove this saved measurement');
    expect(removalControls).toHaveLength(2);
    fireEvent.click(removalControls[1]);
    fireEvent.change(screen.getByLabelText('Correction reason'), {
      target: { value: 'Explicitly removed chest reading' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save correction' }));
    await screen.findByText('Saved detail');
    expect(body?.measurements).toEqual([
      expect.objectContaining({ site: 'waist_iliac_crest_nhanes', readings: [84.2, 84.8] }),
    ]);
  });

  it('requires a correction reason and reports a stale server CAS without losing values', async () => {
    renderForm(
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              error: {
                code: 'BODY_CHECK_IN_VERSION_CONFLICT',
                message: 'stale',
                expectedVersion: 2,
                currentVersion: 3,
              },
            }),
            { status: 409 },
          ),
      ) as typeof fetch,
      { entry: populatedBodyCheckInFixture },
    );
    fireEvent.change(screen.getAllByLabelText('Reading 1 (cm)')[0], { target: { value: '84.3' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save correction' }));
    expect(await screen.findByText(/Explain why/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Correction reason'), {
      target: { value: 'Corrected tape transcription' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save correction' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('server version 3');
    expect(screen.getAllByLabelText('Reading 1 (cm)')[0]).toHaveValue(84.3);
  });

  it('allows every site including waist to be omitted and confirms unsafe cancellation', async () => {
    renderForm();
    fireEvent.click(screen.getByLabelText('Omit this optional site today'));
    expect(screen.getByText('Waist is not included')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Notes'), { target: { value: 'Interrupted' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel safely' }));
    expect(await screen.findByRole('alertdialog')).toHaveTextContent('Leave this check-in?');
  });
});
