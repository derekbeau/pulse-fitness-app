import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createQueryClientWrapper } from '@/test/query-client';
import { populatedBodyCheckInFixture } from '../body-progress-fixtures';
import { GuidedCheckInForm } from './guided-check-in-form';

const waist = [{ site: 'waist_iliac_crest_nhanes', laterality: 'none' }] as const;

function renderForm(
  fetchMock: typeof fetch = vi.fn(),
  options: {
    entry?: typeof populatedBodyCheckInFixture;
    enabledSites?: Array<{ site: 'waist_iliac_crest_nhanes'; laterality: 'none' }>;
  } = {},
) {
  vi.stubGlobal('fetch', fetchMock);
  const { wrapper } = createQueryClientWrapper();
  render(
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
    fireEvent.change(screen.getByLabelText('Reading 1 (cm)'), { target: { value: '84.3' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save correction' }));
    expect(await screen.findByText(/Explain why/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Correction reason'), {
      target: { value: 'Corrected tape transcription' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save correction' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('server version 3');
    expect(screen.getByLabelText('Reading 1 (cm)')).toHaveValue(84.3);
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
