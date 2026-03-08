import { z } from 'zod';

const apiErrorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
  }),
});

export class ApiError extends Error {
  code?: string;
  status: number;

  constructor(message: string, options: { code?: string; status: number }) {
    super(message);
    this.name = 'ApiError';
    this.code = options.code;
    this.status = options.status;
  }
}

const trimTrailingSlash = (value: string) => value.replace(/\/+$/, '');

const getApiBaseUrl = () => trimTrailingSlash(import.meta.env.VITE_API_BASE_URL ?? '');

const getBearerToken = () => {
  const envToken = import.meta.env.VITE_API_BEARER_TOKEN;

  if (typeof window === 'undefined') {
    return envToken;
  }

  return window.localStorage.getItem('pulse-auth-token') ?? envToken;
};

const buildRequestUrl = (path: string) => `${getApiBaseUrl()}${path}`;

const parseApiError = async (response: Response) => {
  try {
    const payload = apiErrorResponseSchema.parse(await response.json());

    return new ApiError(payload.error.message, {
      code: payload.error.code,
      status: response.status,
    });
  } catch {
    return new ApiError(`Request failed with status ${response.status}`, {
      status: response.status,
    });
  }
};

type ApiRequestOptions = {
  body?: BodyInit | object;
  headers?: HeadersInit;
  method?: string;
  schema: z.ZodType<unknown>;
};

export async function apiRequest<T>({
  body,
  headers,
  method = 'GET',
  schema,
  path,
}: Omit<ApiRequestOptions, 'schema'> & { path: string; schema: z.ZodType<T> }): Promise<T> {
  const requestHeaders = new Headers(headers);
  const token = getBearerToken();

  if (!requestHeaders.has('accept')) {
    requestHeaders.set('accept', 'application/json');
  }

  if (token && !requestHeaders.has('authorization')) {
    requestHeaders.set('authorization', `Bearer ${token}`);
  }

  const requestBody =
    body &&
    typeof body === 'object' &&
    !(body instanceof FormData) &&
    !(body instanceof URLSearchParams)
      ? JSON.stringify(body)
      : body;

  if (requestBody && typeof requestBody === 'string' && !requestHeaders.has('content-type')) {
    requestHeaders.set('content-type', 'application/json');
  }

  const response = await fetch(buildRequestUrl(path), {
    body: requestBody,
    credentials: 'include',
    headers: requestHeaders,
    method,
  });

  if (!response.ok) {
    throw await parseApiError(response);
  }

  return schema.parse(await response.json()) as T;
}
