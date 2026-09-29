export type BrowserIdResult =
  | { ok: true; value: string }
  | { ok: false; error: 'CRYPTO_UNAVAILABLE' };

function cryptoApi(): Crypto | undefined {
  try {
    return globalThis.crypto;
  } catch {
    return undefined;
  }
}

function fallbackUuid(crypto: Crypto): string | null {
  if (typeof crypto.getRandomValues !== 'function') return null;

  try {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  } catch {
    return null;
  }
}

export function createBrowserId(prefix: string): BrowserIdResult {
  const crypto = cryptoApi();
  if (!crypto) return { ok: false, error: 'CRYPTO_UNAVAILABLE' };

  if (typeof crypto.randomUUID === 'function') {
    try {
      return { ok: true, value: `${prefix}${crypto.randomUUID()}` };
    } catch {
      // Some limited browser implementations expose the method but reject it.
    }
  }

  const uuid = fallbackUuid(crypto);
  return uuid
    ? { ok: true, value: `${prefix}${uuid}` }
    : { ok: false, error: 'CRYPTO_UNAVAILABLE' };
}
