import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createQueryClientWrapper } from '@/test/query-client';
import { ProgressPhotosPage } from '@/pages/progress-photos';
import { PrivatePhoto } from './private-photo';
import {
  grantedPhotoPreferenceFixture,
  photoSetFixtureA,
  photoSetFixtureB,
  undecidedPhotoPreferenceFixture,
} from './fixtures';

const envelope = (data: unknown, status = 200) =>
  new Response(JSON.stringify({ data }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
const listEnvelope = (data: unknown[]) =>
  new Response(JSON.stringify({ data, meta: { page: 1, limit: 20, total: data.length } }), {
    headers: { 'Content-Type': 'application/json' },
  });

function renderPage(path: string, fetchMock: typeof fetch) {
  vi.stubGlobal('fetch', fetchMock);
  const { wrapper } = createQueryClientWrapper();
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<ProgressPhotosPage />} path="/body/photos" />
      </Routes>
    </MemoryRouter>,
    { wrapper },
  );
}

describe('private progress photos', () => {
  beforeEach(() => {
    const NativeURL = globalThis.URL;
    class TestURL extends NativeURL {}
    Object.defineProperties(TestURL, {
      createObjectURL: { value: vi.fn(() => 'blob:synthetic-private-photo') },
      revokeObjectURL: { value: vi.fn() },
    });
    vi.stubGlobal('URL', TestURL);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('shows exact privacy facts and sends an explicit versioned consent decision', async () => {
    let patchBody = '';
    renderPage(
      '/body/photos',
      vi.fn(async (input, init) => {
        const url = new URL(
          typeof input === 'string' ? input : input instanceof URL ? input : input.url,
          'http://test',
        );
        if (init?.method === 'PATCH') {
          patchBody = String(init.body);
          return envelope(grantedPhotoPreferenceFixture);
        }
        if (url.pathname.endsWith('/preferences')) return envelope(undecidedPhotoPreferenceFixture);
        return listEnvelope([]);
      }) as typeof fetch,
    );
    expect(await screen.findByText('Encrypted in live storage')).toBeInTheDocument();
    expect(screen.getByText(/not client-side end-to-end encryption/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Grant consent' }));
    await waitFor(() => expect(patchBody).toContain('body-progress-photo-consent-v1'));
    expect(patchBody).toContain('"consentDecision":"grant"');
  });

  it('compares only a shared exact pose and retrieves authenticated bytes on demand', async () => {
    const contentRequests: RequestInit[] = [];
    renderPage(
      '/body/photos',
      vi.fn(async (input, init) => {
        const url = new URL(
          typeof input === 'string' ? input : input instanceof URL ? input : input.url,
          'http://test',
        );
        if (url.pathname.endsWith('/preferences')) return envelope(grantedPhotoPreferenceFixture);
        if (url.pathname.endsWith('/body-check-ins')) return listEnvelope([]);
        if (url.pathname.includes('/content')) {
          contentRequests.push(init ?? {});
          return new Response(new Blob(['synthetic'], { type: 'image/jpeg' }));
        }
        return listEnvelope([photoSetFixtureB, photoSetFixtureA]);
      }) as typeof fetch,
    );
    fireEvent.click(await screen.findByLabelText('Select 2026-09-15 for comparison'));
    fireEvent.click(screen.getByLabelText('Select 2026-08-15 for comparison'));
    expect(screen.getByRole('option', { name: 'Front' })).toBeInTheDocument();
    expect(screen.getByText(/does not infer body fat or muscle change/i)).toBeInTheDocument();
    expect(contentRequests).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'Load authenticated comparison' }));
    expect(await screen.findAllByRole('img', { name: /Front comparison photo/ })).toHaveLength(2);
    expect(contentRequests).toHaveLength(2);
    expect(new Headers(contentRequests[0].headers).get('Authorization')).toBe('Bearer test-token');
  });

  it('revokes every private object URL on unmount', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () => new Response(new Blob(['synthetic'], { type: 'image/jpeg' })),
      ) as typeof fetch,
    );
    const result = render(
      <PrivatePhoto
        alt="Synthetic private image"
        eager
        id={photoSetFixtureA.photos[0].id}
        variant="full"
      />,
    );
    expect(await screen.findByRole('img', { name: 'Synthetic private image' })).toBeInTheDocument();
    result.unmount();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:synthetic-private-photo');
  });

  it('rejects HEIC honestly without attempting upload or conversion', async () => {
    const fetchMock = vi.fn(async (input) => {
      const url = new URL(
        typeof input === 'string' ? input : input instanceof URL ? input : input.url,
        'http://test',
      );
      if (url.pathname.endsWith('/preferences')) return envelope(grantedPhotoPreferenceFixture);
      if (url.pathname.endsWith(`/photo-sets/${photoSetFixtureA.id}`))
        return envelope(photoSetFixtureA);
      return listEnvelope([]);
    }) as typeof fetch;
    renderPage(`/body/photos?set=${photoSetFixtureA.id}`, fetchMock);
    const input = (await screen.findAllByLabelText('Choose file'))[0];
    fireEvent.change(input, {
      target: { files: [new File(['synthetic'], 'fixture.heic', { type: 'image/heic' })] },
    });
    expect(await screen.findByText(/cannot be decoded or converted reliably/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Upload 1 selected/ })).not.toBeInTheDocument();
  });

  it('keeps a failed selected file available for an explicit safe retry', async () => {
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => ({ width: 16, height: 16, close: vi.fn() })),
    );
    const uploads: FormData[] = [];
    const fetchMock = vi.fn(async (input, init) => {
      const url = new URL(
        typeof input === 'string' ? input : input instanceof URL ? input : input.url,
        'http://test',
      );
      if (url.pathname.endsWith('/preferences')) return envelope(grantedPhotoPreferenceFixture);
      if (url.pathname.endsWith(`/photo-sets/${photoSetFixtureA.id}/photos`)) {
        uploads.push(init?.body as FormData);
        return new Response(
          JSON.stringify({
            error: { code: 'BODY_PROGRESS_PHOTO_STORAGE_UNAVAILABLE', message: 'offline' },
          }),
          { status: 503 },
        );
      }
      if (url.pathname.endsWith(`/photo-sets/${photoSetFixtureA.id}`))
        return envelope(photoSetFixtureA);
      return listEnvelope([]);
    }) as typeof fetch;
    renderPage(`/body/photos?set=${photoSetFixtureA.id}`, fetchMock);
    const input = (await screen.findAllByLabelText('Choose file'))[0];
    fireEvent.change(input, {
      target: { files: [new File(['synthetic'], 'synthetic-side.png', { type: 'image/png' })] },
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Upload 1 selected' }));
    expect(await screen.findByRole('button', { name: 'Retry failed uploads' })).toBeInTheDocument();
    expect(screen.getByText(/storage is temporarily unavailable/i)).toBeInTheDocument();
    expect(uploads[0].has('side_left')).toBe(true);
  });

  it('cancels an in-flight upload without discarding its in-memory retry state', async () => {
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => ({ width: 16, height: 16, close: vi.fn() })),
    );
    const fetchMock = vi.fn(async (input, init) => {
      const url = new URL(
        typeof input === 'string' ? input : input instanceof URL ? input : input.url,
        'http://test',
      );
      if (url.pathname.endsWith('/preferences')) return envelope(grantedPhotoPreferenceFixture);
      if (url.pathname.endsWith(`/photo-sets/${photoSetFixtureA.id}/photos`))
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('Aborted', 'AbortError')),
          );
        });
      if (url.pathname.endsWith(`/photo-sets/${photoSetFixtureA.id}`))
        return envelope(photoSetFixtureA);
      return listEnvelope([]);
    }) as typeof fetch;
    renderPage(`/body/photos?set=${photoSetFixtureA.id}`, fetchMock);
    const input = (await screen.findAllByLabelText('Choose file'))[0];
    fireEvent.change(input, {
      target: { files: [new File(['synthetic'], 'synthetic-side.png', { type: 'image/png' })] },
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Upload 1 selected' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel upload' }));
    expect(await screen.findByText(/Upload cancelled/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry failed uploads' })).toBeInTheDocument();
  });
});
