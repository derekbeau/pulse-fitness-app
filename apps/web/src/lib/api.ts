type ApiErrorResponse = {
  error?: {
    code?: string;
    message?: string;
  };
};

type ApiSuccessResponse<T> = {
  data: T;
};

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';

export async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    credentials: 'include',
    ...init,
    headers: {
      ...(init?.body ? { 'content-type': 'application/json' } : {}),
      ...(init?.headers ?? {}),
    },
  });

  const responseBody = (await response.json()) as ApiSuccessResponse<T> | ApiErrorResponse;

  if (!response.ok) {
    const errorMessage =
      'error' in responseBody
        ? responseBody.error?.message
        : `Request failed with status ${response.status}`;

    throw new Error(errorMessage ?? `Request failed with status ${response.status}`);
  }

  if (!('data' in responseBody)) {
    throw new Error('Invalid API response');
  }

  return responseBody.data;
}
