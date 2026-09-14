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

describe('body measurement API acceptance', () => {
  beforeEach(async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'pulse-body-measurement-api-'));
    process.env.DATABASE_URL = join(tempDir, 'api.db');
    process.env.JWT_SECRET = 'body-measurement-api-test-secret';
    process.env.PULSE_TEST_NOW = '2026-09-15T05:30:00.000Z';
    vi.resetModules();
    dbModule = await import('../../db/index.js');
    migrate(dbModule.db, { migrationsFolder });

    const { agentTokens, users } = await import('../../db/schema/index.js');
    dbModule.db
      .insert(users)
      .values([
        {
          id: 'user-1',
          username: 'measurement-owner',
          passwordHash: 'hash',
          preferences: { timeZone: 'Pacific/Kiritimati' },
        },
        {
          id: 'user-2',
          username: 'measurement-other',
          passwordHash: 'hash',
        },
      ])
      .run();
    dbModule.db
      .insert(agentTokens)
      .values({
        id: 'agent-token-1',
        userId: 'user-1',
        name: 'measurement-agent',
        tokenHash: createHash('sha256').update('measurement-agent-secret').digest('hex'),
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

  it('merges same-date partial writes, isolates owners, and preserves facts atomically', async () => {
    const { buildServer } = await import('../../index.js');
    const app = buildServer();
    try {
      await app.ready();
      const ownerJwt = app.jwt.sign(
        { sub: 'user-1', type: 'session', iss: 'pulse-api' },
        { expiresIn: '1h' },
      );
      const otherJwt = app.jwt.sign(
        { sub: 'user-2', type: 'session', iss: 'pulse-api' },
        { expiresIn: '1h' },
      );
      const ownerHeaders = { authorization: `Bearer ${ownerJwt}` };
      const agentHeaders = { authorization: 'AgentToken measurement-agent-secret' };

      const invalidAuth = await app.inject({
        method: 'GET',
        url: '/api/v1/body-measurements/',
        headers: { authorization: 'Bearer invalid' },
      });
      expect(invalidAuth.statusCode).toBe(401);

      const future = await app.inject({
        method: 'POST',
        url: '/api/v1/body-measurements/',
        headers: ownerHeaders,
        payload: { date: '2099-01-01', unit: 'cm', waist: 80 },
      });
      expect(future.statusCode).toBe(400);
      expect(future.json().error.code).toBe('FUTURE_BODY_MEASUREMENT_DATE');

      const unresolvedZone = await app.inject({
        method: 'POST',
        url: '/api/v1/body-measurements/',
        headers: { authorization: `Bearer ${otherJwt}` },
        payload: { date: '2026-09-10', body_fat_percent: 22 },
      });
      expect(unresolvedZone.statusCode).toBe(409);
      expect(unresolvedZone.json().error.code).toBe('TIME_ZONE_REQUIRED');

      const created = await app.inject({
        method: 'POST',
        url: '/api/v1/body-measurements/',
        headers: ownerHeaders,
        payload: {
          date: '2026-09-10',
          unit: 'in',
          waist: 32,
          body_fat_percent: 18.4,
          notes: ' self reported ',
        },
      });
      expect(created.statusCode).toBe(201);
      const createdEntry = created.json().data;
      expect(createdEntry).toMatchObject({
        date: '2026-09-10',
        waistMm: 813,
        chestMm: null,
        bodyFatPercent: 18.4,
        unitAtEntry: 'in',
        notes: 'self reported',
      });

      const merged = await app.inject({
        method: 'POST',
        url: '/api/v1/body-measurements/',
        headers: agentHeaders,
        payload: { date: '2026-09-10', unit: 'cm', chest: 100 },
      });
      expect(merged.statusCode).toBe(200);
      expect(merged.json().data).toMatchObject({
        id: createdEntry.id,
        waistMm: 813,
        chestMm: 1000,
        bodyFatPercent: 18.4,
        unitAtEntry: 'cm',
        notes: 'self reported',
      });

      const clearedOne = await app.inject({
        method: 'PATCH',
        url: `/api/v1/body-measurements/${createdEntry.id}`,
        headers: ownerHeaders,
        payload: { waist: null },
      });
      expect(clearedOne.statusCode).toBe(200);
      expect(clearedOne.json().data).toMatchObject({
        waistMm: null,
        chestMm: 1000,
        bodyFatPercent: 18.4,
      });

      const emptyResult = await app.inject({
        method: 'PATCH',
        url: `/api/v1/body-measurements/${createdEntry.id}`,
        headers: ownerHeaders,
        payload: { chest: null, body_fat_percent: null },
      });
      expect(emptyResult.statusCode).toBe(400);
      expect(emptyResult.json().error.code).toBe('BODY_MEASUREMENT_EMPTY');

      for (const method of ['GET', 'PATCH', 'DELETE'] as const) {
        const response = await app.inject({
          method,
          url: `/api/v1/body-measurements/${createdEntry.id}`,
          headers: { authorization: `Bearer ${otherJwt}` },
          ...(method === 'PATCH' ? { payload: { notes: 'ownership leak' } } : {}),
        });
        expect(response.statusCode).toBe(404);
      }

      const ownerRead = await app.inject({
        method: 'GET',
        url: `/api/v1/body-measurements/${createdEntry.id}`,
        headers: ownerHeaders,
      });
      const agentRead = await app.inject({
        method: 'GET',
        url: `/api/v1/body-measurements/${createdEntry.id}`,
        headers: agentHeaders,
      });
      expect(ownerRead.statusCode).toBe(200);
      expect(agentRead.json()).toEqual(ownerRead.json());
      expect(ownerRead.json().data).toMatchObject({
        chestMm: 1000,
        bodyFatPercent: 18.4,
        notes: 'self reported',
      });

      await app.inject({
        method: 'POST',
        url: '/api/v1/body-measurements/',
        headers: agentHeaders,
        payload: { date: '2026-09-01', unit: 'cm', hips: 95 },
      });
      const page = await app.inject({
        method: 'GET',
        url: '/api/v1/body-measurements/?from=2026-09-01&to=2026-09-10&page=1&limit=1',
        headers: ownerHeaders,
      });
      expect(page.json()).toMatchObject({
        data: [{ date: '2026-09-01', hipsMm: 950 }],
        meta: { page: 1, limit: 1, total: 2 },
      });
      const byDate = await app.inject({
        method: 'GET',
        url: '/api/v1/body-measurements/date/2026-09-10',
        headers: agentHeaders,
      });
      expect(byDate.json().data.id).toBe(createdEntry.id);

      const deleted = await app.inject({
        method: 'DELETE',
        url: `/api/v1/body-measurements/${createdEntry.id}`,
        headers: agentHeaders,
      });
      expect(deleted.json()).toEqual({ data: { deleted: true, id: createdEntry.id } });
      const missing = await app.inject({
        method: 'GET',
        url: `/api/v1/body-measurements/${createdEntry.id}`,
        headers: ownerHeaders,
      });
      expect(missing.statusCode).toBe(404);
    } finally {
      await app.close();
    }
  });

  it('cascades ordinary measurement data when the owning account is deleted', async () => {
    const { upsertBodyMeasurement } = await import('./store.js');
    const entry = await upsertBodyMeasurement('user-1', {
      date: '2026-09-10',
      unit: 'cm',
      neck: 38.5,
    });
    const { deleteUserAccount } = await import('../auth/store.js');
    await expect(deleteUserAccount('user-1')).resolves.toBe(true);
    const { bodyMeasurements } = await import('../../db/schema/index.js');
    expect(dbModule.db.select().from(bodyMeasurements).all()).toEqual([]);
    expect(entry.neckMm).toBe(385);
  });

  it('uses Adaptive program timezone precedence for relative-day ranges', async () => {
    const { adaptiveNutritionPrograms } = await import('../../db/schema/index.js');
    dbModule.db
      .insert(adaptiveNutritionPrograms)
      .values({
        id: 'program-1',
        userId: 'user-1',
        timeZone: 'America/Adak',
        rmrEquation: 'manual_tdee',
        manualBaselineTdeeKcal: 2400,
        baselineTdeeKcal: 2400,
        goalType: 'maintain',
        goalRatePctPerWeek: 0,
        proteinGrams: 160,
        fatAllocationPct: 30,
        systemCalorieFloorKcal: 1500,
        userCalorieFloorKcal: 1500,
        algorithmVersion: 'adaptive-tdee-v1',
      })
      .run();

    const { upsertBodyMeasurement } = await import('./store.js');
    await upsertBodyMeasurement('user-1', { date: '2026-09-13', unit: 'cm', waist: 80 });
    await upsertBodyMeasurement('user-1', { date: '2026-09-14', unit: 'cm', waist: 79.5 });
    await expect(
      upsertBodyMeasurement('user-1', { date: '2026-09-15', unit: 'cm', waist: 79 }),
    ).rejects.toMatchObject({ code: 'FUTURE_BODY_MEASUREMENT_DATE' });

    const { listBodyMeasurements } = await import('./store.js');
    await expect(listBodyMeasurements('user-1', { days: 1 })).resolves.toMatchObject([
      { date: '2026-09-14', waistMm: 795 },
    ]);
  });
});
