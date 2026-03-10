type ApiErrorLike = {
  code?: string;
  message: string;
  status: number;
};

export const API_ERROR_MESSAGE_BY_CODE = {
  CONFLICT: 'This item already exists',
  INTERNAL_ERROR: 'Something went wrong. Please try again.',
  NOT_FOUND: 'The requested item was not found',
  UNAUTHORIZED: 'Your session has expired',
  VALIDATION_ERROR: 'Please check your input',
} as const;

export const NETWORK_ERROR_MESSAGE = 'Network error. Check your connection.';
const FALLBACK_ERROR_MESSAGE = API_ERROR_MESSAGE_BY_CODE.INTERNAL_ERROR;

export function isApiError(error: unknown): error is ApiErrorLike {
  if (typeof error !== 'object' || error === null) {
    return false;
  }

  const candidate = error as Partial<ApiErrorLike>;

  return typeof candidate.status === 'number' && typeof candidate.message === 'string';
}

export function isUnauthorizedApiError(error: unknown): error is ApiErrorLike {
  return isApiError(error) && error.status === 401;
}

function hasNetworkFailureMessage(message: string): boolean {
  const normalizedMessage = message.toLowerCase();

  return (
    normalizedMessage.includes('failed to fetch') ||
    normalizedMessage.includes('network error') ||
    normalizedMessage.includes('networkerror') ||
    normalizedMessage.includes('load failed')
  );
}

export function isNetworkError(error: unknown): boolean {
  if (error instanceof TypeError) {
    return true;
  }

  if (error instanceof Error) {
    return hasNetworkFailureMessage(error.message);
  }

  return false;
}

export function toUserFriendlyApiErrorMessage(error: unknown): string {
  if (isNetworkError(error)) {
    return NETWORK_ERROR_MESSAGE;
  }

  if (isApiError(error)) {
    if (error.code && error.code in API_ERROR_MESSAGE_BY_CODE) {
      return API_ERROR_MESSAGE_BY_CODE[error.code as keyof typeof API_ERROR_MESSAGE_BY_CODE];
    }

    if (error.status === 401) {
      return API_ERROR_MESSAGE_BY_CODE.UNAUTHORIZED;
    }

    if (error.message.trim().length > 0) {
      return error.message;
    }
  }

  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return FALLBACK_ERROR_MESSAGE;
}
