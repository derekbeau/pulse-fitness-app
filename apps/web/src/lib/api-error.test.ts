import { describe, expect, it } from 'vitest';

import { ApiError } from '@/lib/api-client';

import {
  API_ERROR_MESSAGE_BY_CODE,
  NETWORK_ERROR_MESSAGE,
  isNetworkError,
  isUnauthorizedApiError,
  toUserFriendlyApiErrorMessage,
} from './api-error';

describe('api-error', () => {
  it('maps known API codes to user-friendly messages', () => {
    const error = new ApiError(400, 'invalid request', 'VALIDATION_ERROR');

    expect(toUserFriendlyApiErrorMessage(error)).toBe(API_ERROR_MESSAGE_BY_CODE.VALIDATION_ERROR);
  });

  it('uses unauthorized session-expired messaging for 401 responses', () => {
    const error = new ApiError(401, 'unauthorized');

    expect(isUnauthorizedApiError(error)).toBe(true);
    expect(toUserFriendlyApiErrorMessage(error)).toBe(API_ERROR_MESSAGE_BY_CODE.UNAUTHORIZED);
  });

  it('returns backend message for unknown API codes', () => {
    const error = new ApiError(422, 'Unable to process this record', 'UNKNOWN_ERROR');

    expect(toUserFriendlyApiErrorMessage(error)).toBe('Unable to process this record');
  });

  it('detects network failures from TypeError and standard fetch messages', () => {
    expect(isNetworkError(new TypeError('Failed to fetch'))).toBe(true);
    expect(isNetworkError(new Error('NetworkError when attempting to fetch resource.'))).toBe(true);
    expect(toUserFriendlyApiErrorMessage(new TypeError('Failed to fetch'))).toBe(
      NETWORK_ERROR_MESSAGE,
    );
  });

  it('falls back to a generic internal error message when no details are available', () => {
    expect(toUserFriendlyApiErrorMessage({})).toBe(API_ERROR_MESSAGE_BY_CODE.INTERNAL_ERROR);
  });
});
