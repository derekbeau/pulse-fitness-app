import { createHash } from 'node:crypto';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import bcrypt from 'bcryptjs';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const migrationsFolder = fileURLToPath(new URL('../../../drizzle', import.meta.url));
const TEST_KEY = Buffer.from('pulse-route-test-key-32-bytes-ok!')
  .subarray(0, 32)
  .toString('base64');
const originalDatabaseUrl = process.env.DATABASE_URL;
let directory = '';
let mediaRoot = '';
let dbModule: typeof import('../../db/index.js');

const multipart = (name: string, filename: string, type: string, bytes: Buffer) => {
  const boundary = 'pulse-synthetic-boundary-123';
  const head = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="${name}"; filename="${filename}"\r\nContent-Type: ${type}\r\n\r\n`,
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
  return {
    payload: Buffer.concat([head, bytes, tail]),
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
  };
};

const multipartMany = (
  files: Array<{ name: string; filename: string; type: string; bytes: Buffer }>,
) => {
  const boundary = 'pulse-synthetic-many-boundary-123';
  const parts = files.flatMap(({ name, filename, type, bytes }) => [
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="${name}"; filename="${filename}"\r\nContent-Type: ${type}\r\n\r\n`,
    ),
    bytes,
    Buffer.from('\r\n'),
  ]);
  return {
    payload: Buffer.concat([...parts, Buffer.from(`--${boundary}--\r\n`)]),
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
  };
};

describe('progress photo API security contract', () => {
  beforeEach(async () => {
    directory = mkdtempSync(join(tmpdir(), 'pulse-photo-api-'));
    process.env.DATABASE_URL = join(directory, 'api.db');
    mediaRoot = join(directory, 'private');
    process.env.BODY_PROGRESS_MEDIA_ROOT = mediaRoot;
    process.env.BODY_PROGRESS_MEDIA_KEY = TEST_KEY;
    process.env.JWT_SECRET = 'progress-photo-api-test-secret';
    process.env.PULSE_TEST_NOW = '2026-09-15T16:00:00.000Z';
    vi.resetModules();
    dbModule = await import('../../db/index.js');
    migrate(dbModule.db, { migrationsFolder });
    const { agentTokens, users } = await import('../../db/schema/index.js');
    dbModule.db
      .insert(users)
      .values([
        {
          id: 'user-1',
          username: 'photo-owner',
          passwordHash: bcrypt.hashSync('correct-password', 4),
          preferences: { timeZone: 'America/Detroit' },
        },
        {
          id: 'user-2',
          username: 'photo-other',
          passwordHash: bcrypt.hashSync('other-password', 4),
          preferences: { timeZone: 'America/Detroit' },
        },
      ])
      .run();
    dbModule.db
      .insert(agentTokens)
      .values({
        id: 'photo-agent',
        userId: 'user-1',
        name: 'photo-agent',
        tokenHash: createHash('sha256').update('photo-agent-secret').digest('hex'),
      })
      .run();
  });

  afterEach(() => {
    dbModule.sqlite.close();
    process.env.DATABASE_URL = originalDatabaseUrl;
    delete process.env.BODY_PROGRESS_MEDIA_ROOT;
    delete process.env.BODY_PROGRESS_MEDIA_KEY;
    delete process.env.JWT_SECRET;
    delete process.env.PULSE_TEST_NOW;
    rmSync(directory, { recursive: true, force: true });
    vi.resetModules();
  });

  it('allows AgentToken metadata only and enforces consent, owner scope, private headers, export reauth, and deletion', async () => {
    const { buildServer } = await import('../../index.js');
    const app = buildServer();
    await app.ready();
    try {
      const ownerJwt = app.jwt.sign(
        { sub: 'user-1', type: 'session', iss: 'pulse-api' },
        { expiresIn: '1h' },
      );
      const otherJwt = app.jwt.sign(
        { sub: 'user-2', type: 'session', iss: 'pulse-api' },
        { expiresIn: '1h' },
      );
      const owner = { authorization: `Bearer ${ownerJwt}` };
      const other = { authorization: `Bearer ${otherJwt}` };
      const agent = { authorization: 'AgentToken photo-agent-secret' };

      const openapi = (await app.inject({ method: 'GET', url: '/api/docs/json' })).json();
      expect(openapi.paths['/api/v1/body-progress/photo-sets/{id}/photos'].post).toMatchObject({
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: { minProperties: 1, maxProperties: 3, additionalProperties: false },
            },
          },
        },
      });
      expect(openapi.paths['/api/v1/body-progress/photos/{id}/content'].get).toMatchObject({
        security: [{ bearerAuth: [] }],
        responses: { 200: { content: { 'image/jpeg': { schema: { format: 'binary' } } } } },
      });
      expect(openapi.paths['/api/v1/body-progress/photos/export'].post).toMatchObject({
        security: [{ bearerAuth: [] }],
        responses: { 200: { content: { 'application/zip': { schema: { format: 'binary' } } } } },
      });

      const metadata = await app.inject({
        method: 'GET',
        url: '/api/v1/body-progress/photos/preferences',
        headers: agent,
      });
      expect(metadata.statusCode).toBe(200);
      expect(metadata.json().data).toMatchObject({
        cadenceDays: 28,
        consent: { state: 'not_decided' },
        capabilities: { metadataAuth: 'jwt_or_agent_token', uploadAuth: 'jwt_only' },
      });
      expect(
        (
          await app.inject({
            method: 'PATCH',
            url: '/api/v1/body-progress/photos/preferences',
            headers: agent,
            payload: { consentDecision: 'grant', consentVersion: 'body-progress-photo-consent-v1' },
          })
        ).statusCode,
      ).toBe(403);

      const consent = await app.inject({
        method: 'PATCH',
        url: '/api/v1/body-progress/photos/preferences',
        headers: owner,
        payload: {
          consentDecision: 'grant',
          consentVersion: 'body-progress-photo-consent-v1',
          cadenceDays: 28,
          cadenceChange: 'restart',
          restartAnchorDate: '2026-09-15',
        },
      });
      expect(consent.statusCode).toBe(200);
      const agentCreate = await app.inject({
        method: 'POST',
        url: '/api/v1/body-progress/photo-sets/',
        headers: agent,
        payload: {
          date: '2026-09-15',
          guideVersion: 'body-progress-photo-guide-v1',
          countAsScheduledOccurrence: false,
        },
      });
      expect(agentCreate.statusCode).toBe(403);
      const created = await app.inject({
        method: 'POST',
        url: '/api/v1/body-progress/photo-sets/',
        headers: owner,
        payload: {
          date: '2026-09-15',
          guideVersion: 'body-progress-photo-guide-v1',
          countAsScheduledOccurrence: false,
        },
      });
      expect(created.statusCode).toBe(201);
      const setId = created.json().data.id as string;
      expect(
        (
          await app.inject({
            method: 'PATCH',
            url: `/api/v1/body-progress/photo-sets/${setId}`,
            headers: agent,
            payload: { notes: 'metadata mutation remains JWT-only' },
          })
        ).statusCode,
      ).toBe(403);

      const fixture = await sharp(
        Buffer.from(
          `<svg width="180" height="260" xmlns="http://www.w3.org/2000/svg"><rect width="180" height="260" fill="#dce7ef"/><circle cx="90" cy="45" r="24" fill="#986943"/><path d="M50 74h80l18 112H32z" fill="#24608d"/><rect x="50" y="184" width="30" height="72" fill="#263443"/><rect x="100" y="184" width="30" height="72" fill="#263443"/></svg>`,
        ),
      )
        .jpeg()
        .toBuffer();
      const uploadBody = multipart('front', 'synthetic-clothed.jpg', 'image/jpeg', fixture);
      expect(
        (
          await app.inject({
            method: 'POST',
            url: `/api/v1/body-progress/photo-sets/${setId}/photos`,
            headers: { ...agent, ...uploadBody.headers },
            payload: uploadBody.payload,
          })
        ).statusCode,
      ).toBe(403);
      delete process.env.BODY_PROGRESS_MEDIA_KEY;
      const missingKeyBody = multipart('front', 'synthetic-clothed.jpg', 'image/jpeg', fixture);
      const missingKey = await app.inject({
        method: 'POST',
        url: `/api/v1/body-progress/photo-sets/${setId}/photos`,
        headers: { ...owner, ...missingKeyBody.headers },
        payload: missingKeyBody.payload,
      });
      expect(missingKey.statusCode).toBe(503);
      expect(missingKey.json().error.code).toBe('BODY_PROGRESS_PHOTO_KEY_UNAVAILABLE');
      process.env.BODY_PROGRESS_MEDIA_KEY = TEST_KEY;
      const uploaded = await app.inject({
        method: 'POST',
        url: `/api/v1/body-progress/photo-sets/${setId}/photos`,
        headers: { ...owner, ...uploadBody.headers },
        payload: uploadBody.payload,
      });
      expect(uploaded.statusCode).toBe(200);
      expect(uploaded.json().data).toMatchObject({
        status: 'partial',
        photos: [{ view: 'front', mediaType: 'image/jpeg' }],
      });
      const photoId = uploaded.json().data.photos[0].id as string;
      const duplicateBody = multipart('front', 'synthetic-clothed.jpg', 'image/jpeg', fixture);
      const duplicate = await app.inject({
        method: 'POST',
        url: `/api/v1/body-progress/photo-sets/${setId}/photos`,
        headers: { ...owner, ...duplicateBody.headers },
        payload: duplicateBody.payload,
      });
      expect(duplicate.statusCode).toBe(409);
      expect(duplicate.json().error.code).toBe('BODY_PROGRESS_PHOTO_DUPLICATE_VIEW');

      const tooManySet = await app.inject({
        method: 'POST',
        url: '/api/v1/body-progress/photo-sets/',
        headers: owner,
        payload: {
          date: '2026-09-14',
          guideVersion: 'body-progress-photo-guide-v1',
          countAsScheduledOccurrence: false,
        },
      });
      const tooManyBody = multipartMany(
        ['front', 'side_left', 'side_right', 'back'].map((name) => ({
          name,
          filename: `${name}.jpg`,
          type: 'image/jpeg',
          bytes: fixture,
        })),
      );
      const tooMany = await app.inject({
        method: 'POST',
        url: `/api/v1/body-progress/photo-sets/${tooManySet.json().data.id}/photos`,
        headers: { ...owner, ...tooManyBody.headers },
        payload: tooManyBody.payload,
      });
      expect(tooMany.statusCode).toBe(413);
      expect(tooMany.json().error.code).toBe('BODY_PROGRESS_PHOTO_FILE_COUNT_LIMIT');
      expect(readdirSync(mediaRoot).filter((name) => name.endsWith('.enc'))).toHaveLength(4);

      const unchangedDue = await app.inject({
        method: 'GET',
        url: '/api/v1/body-progress/photos/preferences',
        headers: owner,
      });
      expect(unchangedDue.json().data).toMatchObject({
        anchorDate: '2026-09-15',
        due: { dueDate: '2026-09-15', state: 'due' },
      });
      const scheduled = await app.inject({
        method: 'POST',
        url: '/api/v1/body-progress/photo-sets/',
        headers: owner,
        payload: {
          date: '2026-09-15',
          guideVersion: 'body-progress-photo-guide-v1',
          countAsScheduledOccurrence: true,
        },
      });
      const scheduledId = scheduled.json().data.id as string;
      const advancedDue = await app.inject({
        method: 'GET',
        url: '/api/v1/body-progress/photos/preferences',
        headers: owner,
      });
      expect(advancedDue.json().data).toMatchObject({
        anchorDate: '2026-09-15',
        due: { dueDate: '2026-10-13', state: 'upcoming' },
      });
      const scheduledUpload = multipart('back', 'synthetic-clothed.jpg', 'image/jpeg', fixture);
      expect(
        (
          await app.inject({
            method: 'POST',
            url: `/api/v1/body-progress/photo-sets/${scheduledId}/photos`,
            headers: { ...owner, ...scheduledUpload.headers },
            payload: scheduledUpload.payload,
          })
        ).statusCode,
      ).toBe(200);
      expect(
        (
          await app.inject({
            method: 'DELETE',
            url: `/api/v1/body-progress/photo-sets/${scheduledId}`,
            headers: owner,
          })
        ).json().data,
      ).toMatchObject({ deleted: 4, missing: 0 });
      expect(
        (
          await app.inject({
            method: 'GET',
            url: '/api/v1/body-progress/photos/preferences',
            headers: owner,
          })
        ).json().data,
      ).toMatchObject({
        lastScheduledOccurrenceDate: null,
        due: { dueDate: '2026-09-15', state: 'due' },
      });

      const raceSet = await app.inject({
        method: 'POST',
        url: '/api/v1/body-progress/photo-sets/',
        headers: owner,
        payload: {
          date: '2026-09-13',
          guideVersion: 'body-progress-photo-guide-v1',
          countAsScheduledOccurrence: false,
        },
      });
      const raceSetId = raceSet.json().data.id as string;
      const raceA = multipart('front', 'synthetic-clothed.jpg', 'image/jpeg', fixture);
      const raceB = multipart('front', 'synthetic-clothed.jpg', 'image/jpeg', fixture);
      const raceResults = await Promise.all([
        app.inject({
          method: 'POST',
          url: `/api/v1/body-progress/photo-sets/${raceSetId}/photos`,
          headers: { ...owner, ...raceA.headers },
          payload: raceA.payload,
        }),
        app.inject({
          method: 'POST',
          url: `/api/v1/body-progress/photo-sets/${raceSetId}/photos`,
          headers: { ...owner, ...raceB.headers },
          payload: raceB.payload,
        }),
      ]);
      expect(raceResults.map(({ statusCode }) => statusCode).sort()).toEqual([200, 409]);
      expect(
        (
          await app.inject({
            method: 'GET',
            url: `/api/v1/body-progress/photo-sets/${raceSetId}`,
            headers: owner,
          })
        ).json().data.photos,
      ).toHaveLength(1);
      expect(
        (
          await app.inject({
            method: 'DELETE',
            url: `/api/v1/body-progress/photo-sets/${raceSetId}`,
            headers: owner,
          })
        ).json().data,
      ).toMatchObject({ deleted: 4, missing: 0 });

      const failureSet = await app.inject({
        method: 'POST',
        url: '/api/v1/body-progress/photo-sets/',
        headers: owner,
        payload: {
          date: '2026-09-12',
          guideVersion: 'body-progress-photo-guide-v1',
          countAsScheduledOccurrence: false,
        },
      });
      const failureSetId = failureSet.json().data.id as string;
      const fileCountBeforeFailure = readdirSync(mediaRoot).length;
      dbModule.sqlite.exec(
        "create trigger progress_photo_forced_insert_failure before insert on body_progress_photos begin select raise(abort, 'forced photo insert failure'); end",
      );
      const failedBody = multipart('back', 'synthetic-clothed.jpg', 'image/jpeg', fixture);
      const failedUpload = await app.inject({
        method: 'POST',
        url: `/api/v1/body-progress/photo-sets/${failureSetId}/photos`,
        headers: { ...owner, ...failedBody.headers },
        payload: failedBody.payload,
      });
      expect(failedUpload.statusCode).toBe(500);
      dbModule.sqlite.exec('drop trigger progress_photo_forced_insert_failure');
      expect(readdirSync(mediaRoot).length).toBe(fileCountBeforeFailure);
      expect(
        (
          await app.inject({
            method: 'DELETE',
            url: `/api/v1/body-progress/photo-sets/${failureSetId}`,
            headers: owner,
          })
        ).statusCode,
      ).toBe(200);

      expect(
        (
          await app.inject({
            method: 'GET',
            url: `/api/v1/body-progress/photo-sets/${setId}`,
            headers: other,
          })
        ).statusCode,
      ).toBe(404);
      expect(
        (
          await app.inject({
            method: 'GET',
            url: `/api/v1/body-progress/photos/${photoId}/content?variant=thumbnail`,
            headers: agent,
          })
        ).statusCode,
      ).toBe(403);
      expect(
        (
          await app.inject({
            method: 'GET',
            url: `/api/v1/body-progress/photos/${photoId}/content?variant=thumbnail`,
            headers: other,
          })
        ).statusCode,
      ).toBe(404);
      const content = await app.inject({
        method: 'GET',
        url: `/api/v1/body-progress/photos/${photoId}/content?variant=thumbnail`,
        headers: owner,
      });
      expect(content.statusCode).toBe(200);
      expect(content.headers).toMatchObject({
        'content-type': 'image/jpeg',
        'cache-control': 'private, no-store',
        'x-content-type-options': 'nosniff',
        'content-disposition': 'inline',
      });
      expect(content.rawPayload.subarray(0, 3)).toEqual(Buffer.from([0xff, 0xd8, 0xff]));

      expect(
        (
          await app.inject({
            method: 'POST',
            url: '/api/v1/body-progress/photos/export',
            headers: agent,
            payload: { password: 'correct-password' },
          })
        ).statusCode,
      ).toBe(403);
      const wrongExport = await app.inject({
        method: 'POST',
        url: '/api/v1/body-progress/photos/export',
        headers: owner,
        payload: { password: 'wrong-password' },
      });
      expect(wrongExport.statusCode).toBe(403);
      expect(wrongExport.json().error.code).toBe('BODY_PROGRESS_PHOTO_EXPORT_REAUTH_REQUIRED');
      const exported = await app.inject({
        method: 'POST',
        url: '/api/v1/body-progress/photos/export',
        headers: owner,
        payload: { password: 'correct-password' },
      });
      expect(exported.statusCode).toBe(200);
      expect(exported.headers['content-type']).toBe('application/zip');
      expect(exported.rawPayload.subarray(0, 2).toString()).toBe('PK');

      const revoked = await app.inject({
        method: 'PATCH',
        url: '/api/v1/body-progress/photos/preferences',
        headers: owner,
        payload: { consentDecision: 'revoke', consentVersion: 'body-progress-photo-consent-v1' },
      });
      expect(revoked.json().data.consent).toMatchObject({
        state: 'revoked',
        revokedAt: expect.any(Number),
      });
      expect(
        (
          await app.inject({
            method: 'GET',
            url: `/api/v1/body-progress/photos/${photoId}/content?variant=thumbnail`,
            headers: owner,
          })
        ).statusCode,
      ).toBe(200);
      const revokedSet = await app.inject({
        method: 'POST',
        url: '/api/v1/body-progress/photo-sets/',
        headers: owner,
        payload: {
          date: '2026-09-14',
          guideVersion: 'body-progress-photo-guide-v1',
          countAsScheduledOccurrence: false,
        },
      });
      const revokedUploadBody = multipart('front', 'synthetic-clothed.jpg', 'image/jpeg', fixture);
      const revokedUpload = await app.inject({
        method: 'POST',
        url: `/api/v1/body-progress/photo-sets/${revokedSet.json().data.id}/photos`,
        headers: { ...owner, ...revokedUploadBody.headers },
        payload: revokedUploadBody.payload,
      });
      expect(revokedUpload.statusCode).toBe(403);
      expect(revokedUpload.json().error.code).toBe('BODY_PROGRESS_PHOTO_CONSENT_REVOKED');

      const deleted = await app.inject({
        method: 'DELETE',
        url: `/api/v1/body-progress/photos/${photoId}`,
        headers: owner,
      });
      expect(deleted.statusCode).toBe(200);
      expect(deleted.json().data).toMatchObject({ deleted: 4, missing: 0 });
      expect(
        (
          await app.inject({
            method: 'DELETE',
            url: `/api/v1/body-progress/photos/${photoId}`,
            headers: owner,
          })
        ).statusCode,
      ).toBe(404);
      expect(
        (
          await app.inject({
            method: 'GET',
            url: `/api/v1/body-progress/photos/${photoId}/content?variant=thumbnail`,
            headers: owner,
          })
        ).statusCode,
      ).toBe(404);
      const bulk = await app.inject({
        method: 'DELETE',
        url: '/api/v1/body-progress/photos',
        headers: owner,
        payload: { confirm: 'delete_all_live_progress_photos' },
      });
      expect(bulk.statusCode).toBe(200);
      expect(bulk.json().data).toMatchObject({
        deletedSets: 3,
        deletedPhotos: 0,
        backupRetention: expect.stringContaining('30'),
      });

      const otherPreference = await app.inject({
        method: 'PATCH',
        url: '/api/v1/body-progress/photos/preferences',
        headers: other,
        payload: { cadenceDays: 28, cadenceChange: 'restart', restartAnchorDate: '2026-09-15' },
      });
      expect(otherPreference.statusCode).toBe(200);
      const snoozed = await app.inject({
        method: 'POST',
        url: '/api/v1/body-progress/photos/preferences/snooze',
        headers: other,
        payload: { until: '2026-09-20' },
      });
      expect(snoozed.json().data).toMatchObject({
        anchorDate: '2026-09-15',
        due: { dueDate: '2026-09-15', state: 'snoozed' },
        snoozedUntil: '2026-09-20',
      });
      const skipped = await app.inject({
        method: 'POST',
        url: '/api/v1/body-progress/photos/preferences/skip',
        headers: other,
        payload: { occurrenceDate: '2026-09-15' },
      });
      expect(skipped.json().data).toMatchObject({
        anchorDate: '2026-09-15',
        due: { dueDate: '2026-09-15', state: 'skipped', nextDueDate: '2026-10-13' },
        snoozedUntil: null,
      });
    } finally {
      await app.close();
    }
  });
});
