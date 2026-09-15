import { ApiError } from '@/lib/api-client';

const messages: Record<string, string> = {
  BODY_PROGRESS_PHOTO_UNAUTHORIZED:
    'Your session expired. Sign in again before opening private photos.',
  BODY_PROGRESS_PHOTO_FORBIDDEN: 'This private photo is not available to your account.',
  BODY_PROGRESS_PHOTO_CONSENT_REQUIRED: 'Grant progress-photo consent before making this change.',
  BODY_PROGRESS_PHOTO_CONSENT_REVOKED:
    'Consent is revoked. Existing photos remain until you explicitly delete them.',
  BODY_PROGRESS_PHOTO_INVALID:
    'Some photo details are invalid. Review the highlighted fields and try again.',
  BODY_PROGRESS_PHOTO_SIZE_LIMIT: 'The image is over the 12 MiB input limit.',
  BODY_PROGRESS_PHOTO_FILE_COUNT_LIMIT: 'Upload at most three images in one request.',
  BODY_PROGRESS_PHOTO_SIGNATURE_MISMATCH: 'The file contents do not match the reported image type.',
  BODY_PROGRESS_PHOTO_DECODER_REJECTED:
    'This image could not be decoded safely. Choose a different file.',
  BODY_PROGRESS_PHOTO_PIXEL_LIMIT: 'The image is over the 40 megapixel limit.',
  BODY_PROGRESS_PHOTO_UNSUPPORTED_FORMAT: 'Choose a JPEG, PNG, or WebP image.',
  BODY_PROGRESS_PHOTO_HEIC_CLIENT_CONVERSION_REQUIRED:
    'HEIC/HEIF is not supported here. Convert it to JPEG, PNG, or WebP and choose the converted file.',
  BODY_PROGRESS_PHOTO_DUPLICATE_VIEW:
    'That pose already has a photo in this set. Delete it before uploading a replacement.',
  BODY_PROGRESS_PHOTO_PROCESSING_FAILED:
    'The server could not normalize this image. Your existing set was preserved.',
  BODY_PROGRESS_PHOTO_STORAGE_UNAVAILABLE:
    'Private photo storage is temporarily unavailable. Try again later.',
  BODY_PROGRESS_PHOTO_KEY_UNAVAILABLE:
    'The private-photo encryption key is temporarily unavailable. Try again later.',
  BODY_PROGRESS_PHOTO_INTEGRITY_FAILURE:
    'This encrypted image failed its integrity check and was not displayed.',
  BODY_PROGRESS_PHOTO_NOT_FOUND: 'This photo is missing or was deleted.',
};

export function photoErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.code) return messages[error.code] ?? error.message;
  if (error instanceof Error) return error.message;
  return 'The request failed. Existing photo data was preserved; try again.';
}

export const viewLabels = {
  front: 'Front',
  side_left: 'Left side',
  side_right: 'Right side',
  back: 'Back',
} as const;

export function formatPhotoDate(date: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeZone: 'UTC' }).format(
    new Date(`${date}T12:00:00Z`),
  );
}
