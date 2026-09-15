import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { convertWeightToKg } from '@pulse/shared';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const migrationsFolder = fileURLToPath(new URL('../../../drizzle', import.meta.url));
const originalDatabaseUrl = process.env.DATABASE_URL;
let tempDir = '';
let dbModule: typeof import('../../db/index.js');

describe('Body Progress analytics API', () => {
  beforeEach(async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'pulse-body-progress-analytics-'));
    process.env.DATABASE_URL = join(tempDir, 'analytics.db');
    process.env.JWT_SECRET = 'body-progress-analytics-test-secret';
    process.env.PULSE_TEST_NOW = '2026-09-15T16:00:00.000Z';
    vi.resetModules();
    dbModule = await import('../../db/index.js');
    migrate(dbModule.db, { migrationsFolder });
    const { agentTokens, bodyMeasurements, bodyWeight, users } =
      await import('../../db/schema/index.js');
    dbModule.db
      .insert(users)
      .values([
        {
          id: 'user-1',
          username: 'analytics-owner',
          passwordHash: 'hash',
          weightUnit: 'lbs',
          preferences: { timeZone: 'America/Detroit' },
        },
        {
          id: 'user-2',
          username: 'analytics-other',
          passwordHash: 'hash',
          weightUnit: 'lbs',
          preferences: { timeZone: 'America/Detroit' },
        },
        { id: 'user-no-zone', username: 'analytics-unresolved', passwordHash: 'hash' },
      ])
      .run();
    dbModule.db
      .insert(agentTokens)
      .values({
        id: 'body-progress-agent-token',
        userId: 'user-1',
        name: 'body-progress-agent',
        tokenHash: createHash('sha256').update('body-progress-agent-secret').digest('hex'),
      })
      .run();
    for (let index = 0; index < 30; index += 1) {
      const date = new Date(Date.UTC(2026, 7, 17 + index)).toISOString().slice(0, 10);
      const weightLbs = 180 - index * 0.1;
      dbModule.db
        .insert(bodyWeight)
        .values({
          id: `weight-${date}`,
          userId: 'user-1',
          date,
          weight: weightLbs,
          weightKg: convertWeightToKg(weightLbs, 'lbs'),
          unitAtEntry: 'lbs',
          createdAt: Date.parse(`${date}T12:00:00Z`),
          updatedAt: Date.parse(`${date}T12:00:00Z`),
        })
        .run();
    }
    dbModule.db
      .insert(bodyMeasurements)
      .values({
        id: 'legacy-measurement',
        userId: 'user-1',
        date: '2026-07-20',
        waistMm: 910,
        unitAtEntry: 'cm',
        bodyFatPercent: 18.2,
        createdAt: Date.parse('2026-07-20T12:00:00Z'),
        updatedAt: Date.parse('2026-07-20T12:00:00Z'),
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

  it('returns source-bound analytics and recomputes fingerprints after correction and delete', async () => {
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
      await app.inject({
        method: 'PATCH',
        url: '/api/v1/body-check-ins/preferences',
        headers: ownerHeaders,
        payload: {
          measurementCadenceDays: 14,
          cadenceChange: 'restart',
          restartAnchorDate: '2026-08-01',
          lengthUnit: 'cm',
          enabledSites: [
            { site: 'waist_iliac_crest_nhanes', laterality: 'none' },
            { site: 'upper_arm_midpoint_flexed', laterality: 'right' },
          ],
        },
      });
      const ids: string[] = [];
      for (const [date, waist, arm] of [
        ['2026-08-01', 90, 35],
        ['2026-08-15', 88.5, 35.5],
        ['2026-09-01', 87, 36.5],
      ] as const) {
        const response = await app.inject({
          method: 'POST',
          url: '/api/v1/body-check-ins',
          headers: ownerHeaders,
          payload: {
            date,
            status: 'completed',
            measurements: [
              {
                site: 'waist_iliac_crest_nhanes',
                laterality: 'none',
                unit: 'cm',
                readings: [waist - 0.2, waist + 0.2],
              },
              {
                site: 'upper_arm_midpoint_flexed',
                laterality: 'right',
                unit: 'cm',
                readings: [arm - 0.1, arm + 0.1],
              },
            ],
          },
        });
        expect(response.statusCode, response.body).toBe(201);
        ids.push(response.json().data.id);
      }

      const analyticsResponse = await app.inject({
        method: 'GET',
        url: '/api/v1/body-check-ins/analytics?range=3m',
        headers: ownerHeaders,
      });
      expect(analyticsResponse.statusCode, analyticsResponse.body).toBe(200);
      const analytics = analyticsResponse.json().data;
      const trend = (
        await app.inject({
          method: 'GET',
          url: '/api/v1/weight/trend?range=3m',
          headers: ownerHeaders,
        })
      ).json().data;
      expect(analytics).toMatchObject({
        timeZone: 'America/Detroit',
        algorithm: {
          version: 'body-progress-analytics-v1',
          minimumCompatibleCheckIns: 3,
          minimumElapsedDays: 28,
          minimumSpacingDays: 10,
          noiseFloorMm: { waist_iliac_crest_nhanes: 20, upper_arm_midpoint_flexed: 10 },
          interpolation: 'none',
        },
        weight: {
          sourceContract: 'trend-weight-v1',
          sourceFingerprint: trend.sourceFingerprint,
          direction: 'down',
        },
        strengthEvidence: { state: 'unavailable', sourceContract: 'workout-progression-v1' },
        readiness: {
          enabledSites: [
            { site: 'waist_iliac_crest_nhanes', laterality: 'none' },
            { site: 'upper_arm_midpoint_flexed', laterality: 'right' },
          ],
        },
        signal: {
          state: 'possible_recomp_signal',
          unavailableInputs: expect.arrayContaining(['goal', 'strength']),
        },
      });
      const waist = analytics.segments.find(
        (segment: { site: string }) => segment.site === 'waist_iliac_crest_nhanes',
      );
      expect(waist).toMatchObject({
        rawDelta: {
          fromDate: '2026-08-01',
          fromCanonicalMm: 900,
          toDate: '2026-09-01',
          toCanonicalMm: 870,
          deltaMm: -30,
        },
        analysis: { state: 'supported', direction: 'down', elapsedDays: 31 },
      });
      expect(waist.points[0]).toMatchObject({
        readingsMm: [898, 902, null],
        quality: 'replicated',
        protocolVersion: 'body-circumference-v1',
        corrected: false,
      });
      expect(analytics.legacyPoints).toEqual([
        expect.objectContaining({
          entryId: 'legacy-measurement',
          canonicalMm: 910,
          provenance: 'legacy_unknown',
          compatibility: 'unsupported',
        }),
      ]);
      expect(JSON.stringify(analytics)).not.toContain('18.2');

      const originalFingerprint = analytics.sourceFingerprint;
      const corrected = await app.inject({
        method: 'PATCH',
        url: `/api/v1/body-check-ins/${ids[2]}`,
        headers: ownerHeaders,
        payload: {
          expectedVersion: 1,
          correctionReason: 'Corrected tape transcription',
          measurements: [
            {
              site: 'waist_iliac_crest_nhanes',
              laterality: 'none',
              unit: 'cm',
              readings: [87.8, 88.2],
            },
            {
              site: 'upper_arm_midpoint_flexed',
              laterality: 'right',
              unit: 'cm',
              readings: [36.4, 36.6],
            },
          ],
        },
      });
      expect(corrected.statusCode, corrected.body).toBe(200);
      const afterCorrection = (
        await app.inject({
          method: 'GET',
          url: '/api/v1/body-check-ins/analytics?range=3m',
          headers: ownerHeaders,
        })
      ).json().data;
      expect(afterCorrection.sourceFingerprint).not.toBe(originalFingerprint);
      expect(afterCorrection.markers).toContainEqual(
        expect.objectContaining({ kind: 'correction', sourceId: ids[2] }),
      );
      expect(
        afterCorrection.segments
          .flatMap((segment: { points: unknown[] }) => segment.points)
          .find((entry: { checkInId: string }) => entry.checkInId === ids[2]),
      ).toMatchObject({ corrected: true, correctionReason: 'Corrected tape transcription' });

      const deleted = await app.inject({
        method: 'DELETE',
        url: `/api/v1/body-check-ins/${ids[2]}`,
        headers: ownerHeaders,
      });
      expect(deleted.statusCode).toBe(200);
      const afterDelete = (
        await app.inject({
          method: 'GET',
          url: '/api/v1/body-check-ins/analytics?range=3m',
          headers: ownerHeaders,
        })
      ).json().data;
      expect(afterDelete.sourceFingerprint).not.toBe(afterCorrection.sourceFingerprint);
      expect(afterDelete.signal.state).toBe('insufficient_data');
      expect(
        afterDelete.markers.some((marker: { sourceId: string }) => marker.sourceId === ids[2]),
      ).toBe(false);

      const historical = (
        await app.inject({
          method: 'GET',
          url: '/api/v1/body-check-ins/analytics?range=all&end=2026-08-15',
          headers: ownerHeaders,
        })
      ).json().data;
      expect(historical.isHistorical).toBe(true);
      expect(historical.range.endDate).toBe('2026-08-15');
      expect(
        historical.segments
          .flatMap((segment: { points: Array<{ date: string }> }) => segment.points)
          .every((entry: { date: string }) => entry.date <= '2026-08-15'),
      ).toBe(true);

      const agentAnalytics = await app.inject({
        method: 'GET',
        url: '/api/v1/body-check-ins/analytics?range=3m',
        headers: { authorization: 'AgentToken body-progress-agent-secret' },
      });
      expect(agentAnalytics.statusCode).toBe(200);
      expect(agentAnalytics.json().data.sourceFingerprint).toBe(afterDelete.sourceFingerprint);
      const otherAnalytics = await app.inject({
        method: 'GET',
        url: '/api/v1/body-check-ins/analytics?range=3m',
        headers: { authorization: `Bearer ${otherJwt}` },
      });
      expect(otherAnalytics.statusCode).toBe(200);
      expect(otherAnalytics.json().data.segments).toEqual([]);
      expect(otherAnalytics.json().data.sourceFingerprint).not.toBe(afterDelete.sourceFingerprint);

      const conflict = await app.inject({
        method: 'GET',
        url: '/api/v1/body-check-ins/analytics?range=3m&timeZone=Asia%2FTokyo',
        headers: ownerHeaders,
      });
      expect(conflict.statusCode).toBe(400);
      const unresolved = await app.inject({
        method: 'GET',
        url: '/api/v1/body-check-ins/analytics?range=3m',
        headers: { authorization: `Bearer ${unresolvedJwt}` },
      });
      expect(unresolved.statusCode).toBe(409);
      expect(unresolved.json().error.code).toBe('TIME_ZONE_REQUIRED');
    } finally {
      await app.close();
    }
  });
});
