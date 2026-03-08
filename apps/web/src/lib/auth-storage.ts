export const API_TOKEN_STORAGE_KEY = 'pulse-auth-token';
export const AUTH_STORAGE_KEY = 'pulse-auth';

function getLocalStorage(): Storage | null {
  if (typeof window === 'undefined') {
    return null;
  }

  return window.localStorage;
}

export function getStoredToken(): string | null {
  try {
    return getLocalStorage()?.getItem(API_TOKEN_STORAGE_KEY) ?? null;
  } catch {
    return null;
  }
}

export function setStoredToken(token: string | null): void {
  const storage = getLocalStorage();
  if (!storage) {
    return;
  }

  try {
    if (token) {
      storage.setItem(API_TOKEN_STORAGE_KEY, token);
      return;
    }

    storage.removeItem(API_TOKEN_STORAGE_KEY);
  } catch {
    // Ignore storage failures so auth can continue in memory.
  }
}

export function clearStoredAuthState(): void {
  const storage = getLocalStorage();
  if (!storage) {
    return;
  }

  try {
    storage.removeItem(API_TOKEN_STORAGE_KEY);
    storage.removeItem(AUTH_STORAGE_KEY);
  } catch {
    // Ignore storage failures so logout / 401 handling still completes.
  }
}
