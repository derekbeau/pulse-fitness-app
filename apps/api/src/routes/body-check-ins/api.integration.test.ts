import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const migrationsFolder = fileURLToPath(new URL('../../../drizzle', import.meta.url));
const originalDatabaseUrl = process.env.DATABASE_URL;
let tempDir = '';
let dbModule: typeof import('../../db/index.js');

describe('body check-in API bridge', () => {
  beforeEach(async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'pulse-body-check-in-api-'));
    process.env.DATABASE_URL = join(tempDir, 'api.db');
    process.env.JWT_SECRET = 'body-check-in-api-test-secret';
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
          username: 'body-owner',
          passwordHash: 'hash',
          preferences: { timeZone: 'America/Detroit' },
        },
        {
          id: 'user-2',
          username: 'body-other',
          passwordHash: 'hash',
          preferences: { timeZone: 'America/Detroit' },
        },
        { id: 'user-no-zone', username: 'body-unresolved', passwordHash: 'hash' },
      ])
      .run();
    dbModule.db
      .insert(agentTokens)
      .values({
        id: 'body-agent-token',
        userId: 'user-1',
        name: 'body-agent',
        tokenHash: createHash('sha256').update('body-agent-secret').digest('hex'),
      })
      .run();
  });

  afterEach(() => {
    dbModule.sqlite.close();
    process.env.DATABASE_URL = originalDatabaseUrl;
    delete process.env.JWT_SECRET;
    delete process.env.PULSE_TEST_NOW;
    rmSync(tempDir, { recursive: true, force: true });
    vi.resetModules();
  });

  it('persists preferences, due lifecycle, drafts, completion, raw readings, provenance, and context', async () => {
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
      const unresolvedJwt = app.jwt.sign(
        { sub: 'user-no-zone', type: 'session', iss: 'pulse-api' },
        { expiresIn: '1h' },
      );
      const ownerHeaders = { authorization: `Bearer ${ownerJwt}` };
      const otherHeaders = { authorization: `Bearer ${otherJwt}` };
      const agentHeaders = { authorization: 'AgentToken body-agent-secret' };

      expect(
        (
          await app.inject({
            method: 'GET',
            url: '/api/v1/body-check-ins/preferences',
            headers: ownerHeaders,
          })
        ).json(),
      ).toEqual({ data: null });
      const unresolved = await app.inject({
        method: 'GET',
        url: '/api/v1/body-check-ins/due',
        headers: { authorization: `Bearer ${unresolvedJwt}` },
      });
      expect(unresolved.statusCode).toBe(409);
      expect(unresolved.json().error.code).toBe('TIME_ZONE_REQUIRED');

      const configured = await app.inject({
        method: 'PATCH',
        url: '/api/v1/body-check-ins/preferences',
        headers: ownerHeaders,
        payload: {
          measurementCadenceDays: 14,
          cadenceChange: 'restart',
          lengthUnit: 'in',
          restartAnchorDate: '2026-09-15',
          reminderLocalTime: '09:30',
          enabledSites: [
            { site: 'waist_iliac_crest_nhanes', laterality: 'none' },
            { site: 'upper_arm_midpoint_flexed', laterality: 'right' },
          ],
        },
      });
      expect(configured.statusCode).toBe(200);
      expect(configured.json().data).toMatchObject({
        measurementCadenceDays: 14,
        lengthUnit: 'in',
        anchorDate: '2026-09-15',
        protocolVersion: 'body-circumference-v1',
      });
      expect(
        (
          await app.inject({
            method: 'GET',
            url: '/api/v1/body-check-ins/due',
            headers: agentHeaders,
          })
        ).json().data,
      ).toMatchObject({ state: 'due_today', occurrenceDueDate: '2026-09-15' });

      const draftPayload = {
        date: '2026-09-14',
        status: 'draft',
        idempotencyKey: 'draft-body-169',
        localTime: '08:15',
        mealContext: 'pre_meal',
        workoutContext: 'pre_workout',
        pumpPresent: false,
        unusualBloating: false,
        measurements: [
          {
            site: 'waist_iliac_crest_nhanes',
            laterality: 'none',
            unit: 'cm',
            readings: [80, 81.2],
          },
        ],
      };
      const created = await app.inject({
        method: 'POST',
        url: '/api/v1/body-check-ins/',
        headers: agentHeaders,
        payload: draftPayload,
      });
      expect(created.statusCode).toBe(201);
      expect(created.json().data).toMatchObject({
        status: 'draft',
        source: 'agent_token',
        sourceId: 'body-agent-token',
        measurements: [
          {
            reading1Mm: 800,
            reading2Mm: 812,
            reading3Mm: null,
            quality: 'needs_third_reading',
            protocolName: 'NHANES iliac-crest waist',
            protocolSourceUrls: [
              'https://wwwn.cdc.gov/nchs/data/nhanes/public/2021/manuals/2021-Anthropometry-Procedures-Manual-508.pdf',
              'https://www.phenxtoolkit.org/protocols/view/21604',
            ],
          },
        ],
      });
      const draftId = created.json().data.id;
      const replay = await app.inject({
        method: 'POST',
        url: '/api/v1/body-check-ins/',
        headers: agentHeaders,
        payload: draftPayload,
      });
      expect(replay.statusCode).toBe(200);
      expect(replay.json().data.id).toBe(draftId);
      const changedReplay = await app.inject({
        method: 'POST',
        url: '/api/v1/body-check-ins/',
        headers: agentHeaders,
        payload: { ...draftPayload, notes: 'changed' },
      });
      expect(changedReplay.statusCode).toBe(409);
      expect(changedReplay.json().error.code).toBe('BODY_CHECK_IN_IDEMPOTENCY_CONFLICT');

      const completed = await app.inject({
        method: 'PATCH',
        url: `/api/v1/body-check-ins/${draftId}`,
        headers: ownerHeaders,
        payload: {
          status: 'completed',
          correctionReason: 'completed after repeat',
          measurements: [
            {
              site: 'waist_iliac_crest_nhanes',
              laterality: 'none',
              unit: 'cm',
              readings: [80, 81, 79],
            },
          ],
        },
      });
      expect(completed.statusCode).toBe(200);
      expect(completed.json().data).toMatchObject({
        status: 'completed',
        completedAt: expect.any(Number),
        measurements: [
          {
            canonicalMm: 805,
            quality: 'replicated_with_tiebreaker',
            selectedReadingPair: [1, 2],
            reading3Mm: 790,
          },
        ],
      });

      const scheduled = await app.inject({
        method: 'POST',
        url: '/api/v1/body-check-ins/',
        headers: ownerHeaders,
        payload: {
          date: '2026-09-15',
          status: 'completed',
          countAsScheduledOccurrence: true,
          measurements: [
            {
              site: 'upper_arm_midpoint_flexed',
              laterality: 'right',
              unit: 'in',
              readings: [15, 15.1],
            },
          ],
        },
      });
      expect(scheduled.statusCode).toBe(201);
      const scheduledId = scheduled.json().data.id;
      const corrected = await app.inject({
        method: 'PATCH',
        url: `/api/v1/body-check-ins/${scheduledId}`,
        headers: agentHeaders,
        payload: { notes: 'agent correction', correctionReason: 'fixed context note' },
      });
      expect(corrected.json().data).toMatchObject({
        source: 'user',
        sourceId: null,
        correctedAt: expect.any(Number),
        correctedBySource: 'agent_token',
        correctedBySourceId: 'body-agent-token',
        correctionReason: 'fixed context note',
      });
      expect(
        (
          await app.inject({
            method: 'GET',
            url: '/api/v1/body-check-ins/due',
            headers: ownerHeaders,
          })
        ).json().data,
      ).toMatchObject({
        state: 'satisfied',
        nextDueDate: '2026-09-29',
        satisfiedByCheckInId: scheduledId,
      });

      const duplicate = await app.inject({
        method: 'POST',
        url: '/api/v1/body-check-ins/',
        headers: ownerHeaders,
        payload: { date: '2026-09-15', status: 'draft', measurements: [] },
      });
      expect(duplicate.statusCode).toBe(409);
      expect(duplicate.json().error).toMatchObject({
        code: 'BODY_CHECK_IN_DATE_CONFLICT',
        existingId: scheduledId,
      });

      for (const method of ['GET', 'PATCH', 'DELETE'] as const) {
        const response = await app.inject({
          method,
          url: `/api/v1/body-check-ins/${scheduledId}`,
          headers: otherHeaders,
          ...(method === 'PATCH' ? { payload: { notes: 'leak' } } : {}),
        });
        expect(response.statusCode).toBe(404);
      }
      const context = await app.inject({
        method: 'GET',
        url: '/api/v1/context/body',
        headers: agentHeaders,
      });
      expect(context.statusCode).toBe(200);
      expect(context.headers['cache-control']).toBe('private, no-cache');
      expect(context.json().data).toMatchObject({
        configured: true,
        latestCompleted: { id: scheduledId },
        due: { state: 'satisfied' },
      });
      expect(context.json().data.latestCompleted).not.toHaveProperty('notes');
      expect(context.json().data.latestCompleted.measurements[0]).not.toHaveProperty('reading1Mm');
      const exported = await app.inject({
        method: 'GET',
        url: '/api/v1/body-check-ins/export',
        headers: ownerHeaders,
      });
      expect(exported.statusCode).toBe(200);
      expect(exported.headers['cache-control']).toBe('private, no-store');
      expect(exported.json().data).toMatchObject({
        preferences: { anchorDate: '2026-09-15' },
        checkIns: [{ id: scheduledId }, { id: draftId }],
      });
      const otherExport = await app.inject({
        method: 'GET',
        url: '/api/v1/body-check-ins/export',
        headers: otherHeaders,
      });
      expect(otherExport.json().data.checkIns).toEqual([]);

      const deleted = await app.inject({
        method: 'DELETE',
        url: `/api/v1/body-check-ins/${scheduledId}`,
        headers: ownerHeaders,
      });
      expect(deleted.statusCode).toBe(200);
      expect(
        (
          await app.inject({
            method: 'GET',
            url: '/api/v1/body-check-ins/due',
            headers: ownerHeaders,
          })
        ).json().data.state,
      ).toBe('due_today');
      const { bodyCheckInMeasurements } = await import('../../db/schema/index.js');
      expect(dbModule.db.select().from(bodyCheckInMeasurements).all()).toHaveLength(1);
    } finally {
      await app.close();
    }
  });

  it('keeps cadence anchored through snooze and skip and exposes OpenAPI contracts', async () => {
    const { buildServer } = await import('../../index.js');
    const app = buildServer();
    await app.ready();
    try {
      const jwt = app.jwt.sign(
        { sub: 'user-1', type: 'session', iss: 'pulse-api' },
        { expiresIn: '1h' },
      );
      const headers = { authorization: `Bearer ${jwt}` };
      await app.inject({
        method: 'PATCH',
        url: '/api/v1/body-check-ins/preferences',
        headers,
        payload: {
          anchorDate: '2026-09-15',
          lengthUnit: 'cm',
          enabledSites: [{ site: 'hips_maximum', laterality: 'none' }],
        },
      });
      const snoozed = await app.inject({
        method: 'POST',
        url: '/api/v1/body-check-ins/due/2026-09-15/snooze',
        headers,
        payload: { snoozedUntil: '2026-09-18' },
      });
      expect(snoozed.json().data).toMatchObject({
        state: 'snoozed',
        occurrenceDueDate: '2026-09-15',
        nextDueDate: '2026-09-18',
      });
      expect(
        (
          await app.inject({
            method: 'POST',
            url: '/api/v1/body-check-ins/due/2026-09-15/snooze',
            headers,
            payload: { snoozedUntil: '2026-09-18' },
          })
        ).statusCode,
      ).toBe(200);
      const skipped = await app.inject({
        method: 'POST',
        url: '/api/v1/body-check-ins/due/2026-09-15/skip',
        headers,
        payload: {},
      });
      expect(skipped.json().data).toMatchObject({
        state: 'skipped_current_occurrence',
        occurrenceDueDate: '2026-09-15',
        nextDueDate: '2026-09-29',
      });
      expect(
        (
          await app.inject({
            method: 'POST',
            url: '/api/v1/body-check-ins/due/2026-09-15/skip',
            headers,
            payload: {},
          })
        ).statusCode,
      ).toBe(200);
      const document = await (await app.inject({ method: 'GET', url: '/api/docs/json' })).json();
      expect(document.paths['/api/v1/body-check-ins/preferences']?.patch).toBeDefined();
      expect(document.paths['/api/v1/body-check-ins/due/{date}/snooze']?.post).toBeDefined();
      expect(document.paths['/api/v1/context/body']?.get).toBeDefined();
      expect(document.paths['/api/v1/body-check-ins/export']?.get).toBeDefined();
    } finally {
      await app.close();
    }
  });

  it('serializes same-date creates and replays concurrent identical retries', async () => {
    const { buildServer } = await import('../../index.js');
    const app = buildServer();
    await app.ready();
    try {
      const jwt = app.jwt.sign(
        { sub: 'user-1', type: 'session', iss: 'pulse-api' },
        { expiresIn: '1h' },
      );
      const headers = { authorization: `Bearer ${jwt}` };
      const payload = {
        date: '2026-09-15',
        status: 'draft',
        idempotencyKey: 'concurrent-body-retry',
        measurements: [],
      };
      const responses = await Promise.all([
        app.inject({ method: 'POST', url: '/api/v1/body-check-ins/', headers, payload }),
        app.inject({ method: 'POST', url: '/api/v1/body-check-ins/', headers, payload }),
      ]);
      expect(responses.map((response) => response.statusCode).sort()).toEqual([200, 201]);
      expect(new Set(responses.map((response) => response.json().data.id)).size).toBe(1);
      const competing = await Promise.all([
        app.inject({
          method: 'POST',
          url: '/api/v1/body-check-ins/',
          headers,
          payload: { date: '2026-09-14', status: 'draft', measurements: [] },
        }),
        app.inject({
          method: 'POST',
          url: '/api/v1/body-check-ins/',
          headers,
          payload: { date: '2026-09-14', status: 'draft', notes: 'other', measurements: [] },
        }),
      ]);
      expect(competing.map((response) => response.statusCode).sort()).toEqual([201, 409]);
    } finally {
      await app.close();
    }
  });

  it('cascades preferences, check-ins, and raw readings when the owner is deleted', async () => {
    const { upsertBodyCheckInPreference, createBodyCheckIn } = await import('./store.js');
    await upsertBodyCheckInPreference('user-1', { anchorDate: '2026-09-15', lengthUnit: 'cm' });
    await createBodyCheckIn({
      userId: 'user-1',
      source: 'user',
      sourceId: null,
      input: {
        date: '2026-09-15',
        status: 'completed',
        measurements: [{ site: 'hips_maximum', laterality: 'none', unit: 'cm', readings: [95] }],
      },
    });
    const { deleteUserAccount } = await import('../auth/store.js');
    await expect(deleteUserAccount('user-1')).resolves.toBe(true);
    const { bodyCheckInMeasurements, bodyCheckInPreferences, bodyCheckIns } =
      await import('../../db/schema/index.js');
    expect(dbModule.db.select().from(bodyCheckInPreferences).all()).toEqual([]);
    expect(dbModule.db.select().from(bodyCheckIns).all()).toEqual([]);
    expect(dbModule.db.select().from(bodyCheckInMeasurements).all()).toEqual([]);
  });
});
