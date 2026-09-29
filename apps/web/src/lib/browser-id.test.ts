import { afterEach, describe, expect, it, vi } from 'vitest';

import { createBrowserId } from './browser-id';

const originalCrypto = globalThis.crypto;

function setCrypto(value: Crypto | undefined) {
  Object.defineProperty(globalThis, 'crypto', { configurable: true, value });
}

describe('createBrowserId', () => {
  afterEach(() => {
    setCrypto(originalCrypto);
    vi.restoreAllMocks();
  });

  it('uses the native UUID implementation when available', () => {
    const randomUUID = vi.fn(
      () =>
        '123e4567-e89b-42d3-a456-426614174000' as `${string}-${string}-${string}-${string}-${string}`,
    );
    setCrypto({ randomUUID } as unknown as Crypto);

    expect(createBrowserId('native-')).toEqual({
      ok: true,
      value: 'native-123e4567-e89b-42d3-a456-426614174000',
    });
    expect(randomUUID).toHaveBeenCalledOnce();
  });

  it('creates unique RFC 4122 v4 IDs when randomUUID is missing', () => {
    let seed = 0;
    setCrypto({
      getRandomValues: <T extends ArrayBufferView | null>(array: T) => {
        const bytes = array as Uint8Array;
        bytes.forEach((_, index) => {
          bytes[index] = (seed + index) & 0xff;
        });
        seed += 17;
        return array;
      },
    } as Crypto);

    const first = createBrowserId('fallback-');
    const second = createBrowserId('fallback-');
    expect(first).toEqual({
      ok: true,
      value: expect.stringMatching(
        /^fallback-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u,
      ),
    });
    expect(second).toEqual({
      ok: true,
      value: expect.stringMatching(/^fallback-[0-9a-f-]{36}$/u),
    });
    expect(second).not.toEqual(first);
  });

  it('returns an explicit failure when cryptographic randomness is unavailable', () => {
    setCrypto(undefined);
    expect(createBrowserId('missing-')).toEqual({ ok: false, error: 'CRYPTO_UNAVAILABLE' });

    setCrypto({} as Crypto);
    expect(createBrowserId('missing-')).toEqual({ ok: false, error: 'CRYPTO_UNAVAILABLE' });
  });
});
