import { createReadStream } from 'node:fs';

import multipart from '@fastify/multipart';
import {
  apiDataResponseSchema,
  apiPaginatedResponseSchema,
  bodyProgressPhotoContentQuerySchema,
  bodyProgressPhotoDeleteAllInputSchema,
  bodyProgressPhotoExportInputSchema,
  bodyProgressPhotoPreferenceSchema,
  bodyProgressPhotoSetListQuerySchema,
  bodyProgressPhotoSetSchema,
  bodyProgressPhotoSkipSchema,
  bodyProgressPhotoSnoozeSchema,
  createBodyProgressPhotoSetSchema,
  patchBodyProgressPhotoPreferenceSchema,
  patchBodyProgressPhotoSetSchema,
  BODY_PROGRESS_PHOTO_MAX_FILES,
  BODY_PROGRESS_PHOTO_MAX_INPUT_BYTES,
  BODY_PROGRESS_PHOTO_MAX_REQUEST_BYTES,
} from '@pulse/shared';
import archiver from 'archiver';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { type ZodTypeProvider } from 'fastify-type-provider-zod';
import { PassThrough } from 'node:stream';
import { z } from 'zod';

import { users } from '../../db/schema/index.js';
import { sendError } from '../../lib/reply.js';
import { requireAuth, requireJwtOnly } from '../../middleware/auth.js';
import {
  apiErrorResponseSchema,
  authSecurity,
  badRequestResponseSchema,
  idParamsSchema,
  jwtSecurity,
} from '../../openapi.js';

import { decryptVariantToTemporaryFile, ProgressPhotoMediaError } from './media.js';
import {
  createPhotoSet,
  deleteAllPhotos,
  deletePhoto,
  deletePhotoSet,
  getPhotoInternal,
  getPhotoPreference,
  getPhotoSet,
  getUserPhotoRows,
  listPhotoSets,
  patchPhotoPreference,
  patchPhotoSet,
  ProgressPhotoStoreError,
  skipPhotoOccurrence,
  snoozePhotoOccurrence,
  uploadPhotos,
} from './store.js';

const deleteResultSchema = apiDataResponseSchema(
  z
    .object({
      id: z.string().uuid(),
      deleted: z.number().int().nonnegative(),
      missing: z.number().int().nonnegative(),
    })
    .strict(),
);
const bulkDeleteResultSchema = apiDataResponseSchema(
  z
    .object({
      deletedSets: z.number().int().nonnegative(),
      deletedPhotos: z.number().int().nonnegative(),
      deletedFiles: z.number().int().nonnegative(),
      missingFiles: z.number().int().nonnegative(),
      backupRetention: z.string(),
    })
    .strict(),
);

const handleError = (reply: Parameters<typeof sendError>[0], error: unknown) => {
  if (error instanceof ProgressPhotoStoreError) {
    const status =
      error.code === 'BODY_PROGRESS_PHOTO_NOT_FOUND'
        ? 404
        : error.code === 'BODY_PROGRESS_PHOTO_DUPLICATE_VIEW'
          ? 409
          : 403;
    return sendError(reply, status, error.code, error.message);
  }
  if (error instanceof ProgressPhotoMediaError) {
    const status =
      error.code === 'BODY_PROGRESS_PHOTO_SIZE_LIMIT' ||
      error.code === 'BODY_PROGRESS_PHOTO_FILE_COUNT_LIMIT'
        ? 413
        : error.code === 'BODY_PROGRESS_PHOTO_KEY_UNAVAILABLE' ||
            error.code === 'BODY_PROGRESS_PHOTO_STORAGE_UNAVAILABLE'
          ? 503
          : error.code === 'BODY_PROGRESS_PHOTO_INTEGRITY_FAILURE'
            ? 422
            : 400;
    return sendError(reply, status, error.code, error.message);
  }
  if (error instanceof RangeError)
    return sendError(reply, 400, 'BODY_PROGRESS_PHOTO_INVALID', error.message);
  throw error;
};

const mediaHeaders = (reply: Parameters<typeof sendError>[0], disposition: string) => {
  reply.header('Cache-Control', 'private, no-store');
  reply.header('Pragma', 'no-cache');
  reply.header('X-Content-Type-Options', 'nosniff');
  reply.header('Content-Security-Policy', "default-src 'none'; sandbox");
  reply.header('Content-Disposition', disposition);
};

export const bodyProgressPhotoRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('onRoute', (routeOptions) => {
    routeOptions.logLevel = 'silent';
  });
  await app.register(multipart, {
    throwFileSizeLimit: true,
    limits: {
      fileSize: BODY_PROGRESS_PHOTO_MAX_INPUT_BYTES,
      // Accept one excess part so the application can drain it and return the
      // stable count-limit error without leaving the multipart parser paused.
      files: BODY_PROGRESS_PHOTO_MAX_FILES + 1,
      fields: 0,
      parts: BODY_PROGRESS_PHOTO_MAX_FILES + 1,
      headerPairs: 50,
    },
  });
  app.addHook('onRequest', requireAuth);
  const typedApp = app.withTypeProvider<ZodTypeProvider>();

  typedApp.get(
    '/photos/preferences',
    {
      schema: {
        response: {
          200: apiDataResponseSchema(bodyProgressPhotoPreferenceSchema),
          401: apiErrorResponseSchema,
        },
        tags: ['body-progress-photos'],
        summary: 'Get progress photo consent, preferences, due state, and capabilities',
        security: authSecurity,
      },
    },
    async (request, reply) => reply.send({ data: await getPhotoPreference(request.userId) }),
  );

  typedApp.patch(
    '/photos/preferences',
    {
      preHandler: requireJwtOnly,
      schema: {
        body: patchBodyProgressPhotoPreferenceSchema,
        response: {
          200: apiDataResponseSchema(bodyProgressPhotoPreferenceSchema),
          400: badRequestResponseSchema,
          401: apiErrorResponseSchema,
          403: apiErrorResponseSchema,
        },
        tags: ['body-progress-photos'],
        summary: 'Update progress photo consent and independent cadence',
        security: jwtSecurity,
      },
    },
    async (request, reply) => {
      try {
        return reply.send({ data: await patchPhotoPreference(request.userId, request.body) });
      } catch (error) {
        return handleError(reply, error);
      }
    },
  );

  typedApp.post(
    '/photos/preferences/skip',
    {
      preHandler: requireJwtOnly,
      schema: {
        body: bodyProgressPhotoSkipSchema,
        response: {
          200: apiDataResponseSchema(bodyProgressPhotoPreferenceSchema),
          400: badRequestResponseSchema,
          401: apiErrorResponseSchema,
          403: apiErrorResponseSchema,
        },
        tags: ['body-progress-photos'],
        summary: 'Skip the current photo occurrence without changing its anchor',
        security: jwtSecurity,
      },
    },
    async (request, reply) => {
      try {
        return reply.send({
          data: await skipPhotoOccurrence(request.userId, request.body.occurrenceDate),
        });
      } catch (error) {
        return handleError(reply, error);
      }
    },
  );

  typedApp.post(
    '/photos/preferences/snooze',
    {
      preHandler: requireJwtOnly,
      schema: {
        body: bodyProgressPhotoSnoozeSchema,
        response: {
          200: apiDataResponseSchema(bodyProgressPhotoPreferenceSchema),
          400: badRequestResponseSchema,
          401: apiErrorResponseSchema,
          403: apiErrorResponseSchema,
        },
        tags: ['body-progress-photos'],
        summary: 'Snooze the current photo prompt without changing its anchor',
        security: jwtSecurity,
      },
    },
    async (request, reply) => {
      try {
        return reply.send({
          data: await snoozePhotoOccurrence(request.userId, request.body.until),
        });
      } catch (error) {
        return handleError(reply, error);
      }
    },
  );

  typedApp.get(
    '/photo-sets/',
    {
      schema: {
        querystring: bodyProgressPhotoSetListQuerySchema,
        response: {
          200: apiPaginatedResponseSchema(bodyProgressPhotoSetSchema),
          401: apiErrorResponseSchema,
        },
        tags: ['body-progress-photos'],
        summary: 'List user-scoped progress photo set metadata',
        security: authSecurity,
      },
    },
    async (request, reply) => {
      const result = await listPhotoSets(request.userId, request.query);
      return reply.send({
        data: result.entries,
        meta: { page: request.query.page, limit: request.query.limit, total: result.total },
      });
    },
  );

  typedApp.post(
    '/photo-sets/',
    {
      preHandler: requireJwtOnly,
      schema: {
        body: createBodyProgressPhotoSetSchema,
        response: {
          201: apiDataResponseSchema(bodyProgressPhotoSetSchema),
          400: badRequestResponseSchema,
          401: apiErrorResponseSchema,
          403: apiErrorResponseSchema,
          404: apiErrorResponseSchema,
        },
        tags: ['body-progress-photos'],
        summary: 'Create a partial progress photo set',
        security: jwtSecurity,
      },
    },
    async (request, reply) => {
      try {
        return reply.code(201).send({ data: await createPhotoSet(request.userId, request.body) });
      } catch (error) {
        return handleError(reply, error);
      }
    },
  );

  typedApp.get(
    '/photo-sets/:id',
    {
      schema: {
        params: idParamsSchema,
        response: {
          200: apiDataResponseSchema(bodyProgressPhotoSetSchema),
          401: apiErrorResponseSchema,
          404: apiErrorResponseSchema,
        },
        tags: ['body-progress-photos'],
        summary: 'Get one user-scoped progress photo set',
        security: authSecurity,
      },
    },
    async (request, reply) => {
      const set = await getPhotoSet(request.params.id, request.userId);
      return set
        ? reply.send({ data: set })
        : sendError(reply, 404, 'BODY_PROGRESS_PHOTO_NOT_FOUND', 'Progress photo set not found');
    },
  );

  typedApp.patch(
    '/photo-sets/:id',
    {
      preHandler: requireJwtOnly,
      schema: {
        params: idParamsSchema,
        body: patchBodyProgressPhotoSetSchema,
        response: {
          200: apiDataResponseSchema(bodyProgressPhotoSetSchema),
          400: badRequestResponseSchema,
          401: apiErrorResponseSchema,
          403: apiErrorResponseSchema,
          404: apiErrorResponseSchema,
        },
        tags: ['body-progress-photos'],
        summary: 'Update progress photo set metadata',
        security: jwtSecurity,
      },
    },
    async (request, reply) => {
      try {
        const set = await patchPhotoSet(request.params.id, request.userId, request.body);
        return set
          ? reply.send({ data: set })
          : sendError(reply, 404, 'BODY_PROGRESS_PHOTO_NOT_FOUND', 'Progress photo set not found');
      } catch (error) {
        return handleError(reply, error);
      }
    },
  );

  typedApp.delete(
    '/photo-sets/:id',
    {
      preHandler: requireJwtOnly,
      schema: {
        params: idParamsSchema,
        response: {
          200: deleteResultSchema,
          401: apiErrorResponseSchema,
          403: apiErrorResponseSchema,
          404: apiErrorResponseSchema,
        },
        tags: ['body-progress-photos'],
        summary: 'Delete a progress photo set and all live ciphertext',
        security: jwtSecurity,
      },
    },
    async (request, reply) => {
      try {
        const result = await deletePhotoSet(request.params.id, request.userId);
        return result
          ? reply.send({ data: result })
          : sendError(reply, 404, 'BODY_PROGRESS_PHOTO_NOT_FOUND', 'Progress photo set not found');
      } catch (error) {
        return handleError(reply, error);
      }
    },
  );

  typedApp.post(
    '/photo-sets/:id/photos',
    {
      preHandler: requireJwtOnly,
      bodyLimit: BODY_PROGRESS_PHOTO_MAX_REQUEST_BYTES,
      schema: {
        params: idParamsSchema,
        consumes: ['multipart/form-data'],
        response: {
          200: apiDataResponseSchema(bodyProgressPhotoSetSchema),
          400: apiErrorResponseSchema,
          401: apiErrorResponseSchema,
          403: apiErrorResponseSchema,
          404: apiErrorResponseSchema,
          409: apiErrorResponseSchema,
          413: apiErrorResponseSchema,
          503: apiErrorResponseSchema,
        },
        tags: ['body-progress-photos'],
        summary:
          'Upload up to three view-named JPEG, PNG, or WebP files; HEIC requires client conversion',
        security: jwtSecurity,
      },
    },
    async (request, reply) => {
      try {
        if (!request.isMultipart())
          return sendError(
            reply,
            400,
            'BODY_PROGRESS_PHOTO_INVALID',
            'Expected multipart/form-data',
          );
        return reply.send({
          data: await uploadPhotos(request.params.id, request.userId, request.parts()),
        });
      } catch (error) {
        if (error instanceof app.multipartErrors.FilesLimitError)
          return sendError(
            reply,
            413,
            'BODY_PROGRESS_PHOTO_FILE_COUNT_LIMIT',
            'At most three images may be uploaded',
          );
        if (error instanceof app.multipartErrors.RequestFileTooLargeError)
          return sendError(
            reply,
            413,
            'BODY_PROGRESS_PHOTO_SIZE_LIMIT',
            'Image exceeds the 12 MiB input limit',
          );
        return handleError(reply, error);
      }
    },
  );

  typedApp.delete(
    '/photos/:id',
    {
      preHandler: requireJwtOnly,
      schema: {
        params: idParamsSchema,
        response: {
          200: deleteResultSchema,
          401: apiErrorResponseSchema,
          403: apiErrorResponseSchema,
          404: apiErrorResponseSchema,
        },
        tags: ['body-progress-photos'],
        summary: 'Delete one photo and every encrypted variant',
        security: jwtSecurity,
      },
    },
    async (request, reply) => {
      try {
        const result = await deletePhoto(request.params.id, request.userId);
        return result
          ? reply.send({ data: result })
          : sendError(reply, 404, 'BODY_PROGRESS_PHOTO_NOT_FOUND', 'Progress photo not found');
      } catch (error) {
        return handleError(reply, error);
      }
    },
  );

  typedApp.get(
    '/photos/:id/content',
    {
      preHandler: requireJwtOnly,
      schema: {
        params: idParamsSchema,
        querystring: bodyProgressPhotoContentQuerySchema,
        response: {
          401: apiErrorResponseSchema,
          403: apiErrorResponseSchema,
          404: apiErrorResponseSchema,
          422: apiErrorResponseSchema,
          503: apiErrorResponseSchema,
        },
        tags: ['body-progress-photos'],
        summary: 'Stream a verified private normalized photo variant',
        security: jwtSecurity,
      },
    },
    async (request, reply) => {
      try {
        const row = await getPhotoInternal(request.params.id, request.userId);
        const variant = row?.variants.find((item) => item.variant === request.query.variant);
        if (!row || !variant)
          return sendError(reply, 404, 'BODY_PROGRESS_PHOTO_NOT_FOUND', 'Progress photo not found');
        const decrypted = await decryptVariantToTemporaryFile({
          userId: request.userId,
          photoId: row.id,
          view: row.view,
          variant,
        });
        const stream = createReadStream(decrypted.path);
        let cleaned = false;
        const cleanup = () => {
          if (!cleaned) {
            cleaned = true;
            void decrypted.cleanup();
          }
        };
        stream.once('close', cleanup);
        stream.once('error', cleanup);
        reply.raw.once('close', cleanup);
        mediaHeaders(reply, 'inline');
        reply.type(variant.mediaType);
        return reply.send(stream as never);
      } catch (error) {
        return handleError(reply, error);
      }
    },
  );

  typedApp.delete(
    '/photos',
    {
      preHandler: requireJwtOnly,
      schema: {
        body: bodyProgressPhotoDeleteAllInputSchema,
        response: {
          200: bulkDeleteResultSchema,
          400: badRequestResponseSchema,
          401: apiErrorResponseSchema,
          403: apiErrorResponseSchema,
        },
        tags: ['body-progress-photos'],
        summary: 'Delete all user-scoped live progress photo sets and ciphertext',
        security: jwtSecurity,
      },
    },
    async (request, reply) => {
      try {
        return reply.send({ data: await deleteAllPhotos(request.userId) });
      } catch (error) {
        return handleError(reply, error);
      }
    },
  );

  typedApp.post(
    '/photos/export',
    {
      preHandler: requireJwtOnly,
      schema: {
        body: bodyProgressPhotoExportInputSchema,
        response: {
          400: badRequestResponseSchema,
          401: apiErrorResponseSchema,
          403: apiErrorResponseSchema,
          413: apiErrorResponseSchema,
        },
        tags: ['body-progress-photos'],
        summary: 'Create a transient password-reauthenticated ZIP export',
        security: jwtSecurity,
      },
    },
    async (request, reply) => {
      const { db } = await import('../../db/index.js');
      const user = db
        .select({ passwordHash: users.passwordHash })
        .from(users)
        .where(eq(users.id, request.userId))
        .get();
      if (!user || !(await bcrypt.compare(request.body.password, user.passwordHash)))
        return sendError(
          reply,
          403,
          'BODY_PROGRESS_PHOTO_EXPORT_REAUTH_REQUIRED',
          'Current password reauthentication is required',
        );
      const rows = await getUserPhotoRows(request.userId);
      const total = rows
        .flatMap((row) => row.variants)
        .reduce((sum, item) => sum + item.byteSize, 0);
      if (total > 512 * 1024 * 1024)
        return sendError(
          reply,
          413,
          'BODY_PROGRESS_PHOTO_SIZE_LIMIT',
          'Export exceeds the bounded 512 MiB limit',
        );
      const cleanups: Array<() => Promise<void>> = [];
      try {
        const archive = archiver('zip', { zlib: { level: 6 } });
        const output = new PassThrough();
        archive.on('error', (error) => output.destroy(error));
        archive.pipe(output);
        const manifest = rows.map((row) => ({
          id: row.id,
          setId: row.setId,
          view: row.view,
          mediaType: row.normalizedMediaType,
          width: row.width,
          height: row.height,
          checksum: row.checksum,
          processingVersion: row.processingVersion,
          encryptionVersion: row.encryptionVersion,
          createdAt: row.createdAt,
          variants: row.variants.map(
            ({ variant, mediaType, byteSize, width, height, checksum }) => ({
              variant,
              mediaType,
              byteSize,
              width,
              height,
              checksum,
            }),
          ),
        }));
        archive.append(
          JSON.stringify(
            {
              contractVersion: 'body-progress-photos-v1',
              backupRetention:
                'Live deletion does not rewrite backups; encrypted copies age out after the newest 30 archives.',
              photos: manifest,
            },
            null,
            2,
          ),
          { name: 'manifest.json' },
        );
        for (const row of rows)
          for (const variant of row.variants) {
            const decrypted = await decryptVariantToTemporaryFile({
              userId: request.userId,
              photoId: row.id,
              view: row.view,
              variant,
            });
            cleanups.push(decrypted.cleanup);
            const extension =
              variant.mediaType === 'image/png'
                ? 'png'
                : variant.mediaType === 'image/webp'
                  ? 'webp'
                  : 'jpg';
            archive.file(decrypted.path, {
              name: `media/${row.id}/${row.view}-${variant.variant}.${extension}`,
            });
          }
        void archive.finalize();
        const cleanup = () => {
          void Promise.all(cleanups.map((item) => item()));
        };
        output.once('close', cleanup);
        output.once('error', cleanup);
        reply.raw.once('close', cleanup);
        mediaHeaders(reply, 'attachment; filename="pulse-progress-photos.zip"');
        reply.type('application/zip');
        return reply.send(output as never);
      } catch (error) {
        await Promise.all(cleanups.map((cleanup) => cleanup()));
        return handleError(reply, error);
      }
    },
  );
};
