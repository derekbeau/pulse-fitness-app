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

const agentHeaders = { authorization: 'AgentToken activity-agent-secret' };
const otherAgentHeaders = { authorization: 'AgentToken other-activity-agent-secret' };

const source = (sourceLabel = 'User described five-minute PT routine') => ({
  class: 'user_observation' as const,
  sourceId: 'conversation-2026-09-19',
  sourceLabel,
  sourceOccurredAt: '2026-09-18T21:15:00.000-04:00',
  capturedAt: '2026-09-19T14:00:00.000Z',
  uncertainty: 'known' as const,
  freshness: {
    state: 'current' as const,
    asOf: '2026-09-18T21:15:00.000-04:00',
    reasons: [],
  },
});

const createActivityPayload = (idempotencyKey: string, name = 'Five-minute PT') => ({
  kind: 'physical_therapy',
  name,
  goalIds: [],
  structuredWorkoutSessionId: null,
  source: source(),
  idempotencyKey,
});

describe('activity runtime API acceptance', () => {
  beforeEach(async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'pulse-activity-api-'));
    process.env.DATABASE_URL = join(tempDir, 'api.db');
    process.env.JWT_SECRET = 'activity-api-test-secret';
    vi.resetModules();
    dbModule = await import('../../db/index.js');
    migrate(dbModule.db, { migrationsFolder });

    const { agentTokens, users } = await import('../../db/schema/index.js');
    dbModule.db
      .insert(users)
      .values([
        { id: 'user-1', username: 'activity-owner', passwordHash: 'hash' },
        { id: 'user-2', username: 'activity-other', passwordHash: 'hash' },
      ])
      .run();
    dbModule.db
      .insert(agentTokens)
      .values([
        {
          id: 'agent-token-1',
          userId: 'user-1',
          name: 'activity-agent',
          tokenHash: createHash('sha256').update('activity-agent-secret').digest('hex'),
        },
        {
          id: 'agent-token-2',
          userId: 'user-2',
          name: 'other-activity-agent',
          tokenHash: createHash('sha256').update('other-activity-agent-secret').digest('hex'),
        },
      ])
      .run();
  });

  afterEach(() => {
    dbModule.sqlite.close();
    process.env.DATABASE_URL = originalDatabaseUrl;
    delete process.env.JWT_SECRET;
    rmSync(tempDir, { recursive: true, force: true });
    vi.resetModules();
  });

  it('captures planned and actual facts separately and preserves immutable lifecycle history', async () => {
    const { buildServer } = await import('../../index.js');
    const app = buildServer();
    await app.ready();
    try {
      const ownerJwt = app.jwt.sign(
        { sub: 'user-1', type: 'session', iss: 'pulse-api' },
        { expiresIn: '1h' },
      );
      const rejectedJwtWrite = await app.inject({
        method: 'POST',
        url: '/api/v1/activities',
        headers: { authorization: `Bearer ${ownerJwt}` },
        payload: createActivityPayload('jwt-write-rejected'),
      });
      expect(rejectedJwtWrite.statusCode).toBe(403);

      const goalA = await app.inject({
        method: 'POST',
        url: '/api/v1/activity-goals',
        headers: agentHeaders,
        payload: {
          kind: 'physical_therapy',
          label: 'Restore shoulder motion',
          idempotencyKey: 'goal-a-176',
        },
      });
      const goalB = await app.inject({
        method: 'POST',
        url: '/api/v1/activity-goals',
        headers: agentHeaders,
        payload: { kind: 'mobility', label: 'Daily mobility', idempotencyKey: 'goal-b-176' },
      });
      expect(goalA.statusCode).toBe(201);
      expect(goalB.statusCode).toBe(201);

      const created = await app.inject({
        method: 'POST',
        url: '/api/v1/activities',
        headers: agentHeaders,
        payload: {
          ...createActivityPayload('activity-create-176'),
          goalIds: [goalA.json().data.id, goalB.json().data.id],
        },
      });
      expect(created.statusCode).toBe(201);
      const activityId = created.json().data.activity.id as string;
      expect(created.json().data.activity).toMatchObject({
        subjectUserId: 'user-1',
        name: 'Five-minute PT',
        ownership: {
          subjectUserId: 'user-1',
          actor: { kind: 'agent_token', id: 'agent-token-1', label: 'activity-agent' },
        },
        source: {
          sourceLabel: 'User described five-minute PT routine',
          sourceOccurredAt: '2026-09-18T21:15:00.000-04:00',
          capturedBy: { kind: 'agent_token', id: 'agent-token-1' },
        },
      });
      expect(created.json().data.goals).toHaveLength(2);

      const related = await app.inject({
        method: 'POST',
        url: '/api/v1/activities',
        headers: agentHeaders,
        payload: createActivityPayload('related-activity-176', 'Morning mobility'),
      });
      const linked = await app.inject({
        method: 'POST',
        url: `/api/v1/activities/${activityId}/links`,
        headers: agentHeaders,
        payload: {
          target: {
            kind: 'activity',
            id: related.json().data.activity.id,
            revisionId: related.json().data.revisions[0].id,
          },
          relation: 'observed_during',
          idempotencyKey: 'activity-link-176',
        },
      });
      expect(linked.statusCode).toBe(201);

      const assignment = await app.inject({
        method: 'POST',
        url: `/api/v1/activities/${activityId}/assignments`,
        headers: agentHeaders,
        payload: {
          plannedLocalDate: '2026-09-22',
          timeZone: 'America/Detroit',
          recurrenceRevisionId: null,
          idempotencyKey: 'assignment-tuesday-176',
        },
      });
      expect(assignment.statusCode).toBe(201);
      const assignmentId = assignment.json().data.id as string;

      const rescheduled = await app.inject({
        method: 'PATCH',
        url: `/api/v1/activity-assignments/${assignmentId}/reschedule`,
        headers: agentHeaders,
        payload: {
          expectedRevision: 1,
          plannedLocalDate: '2026-09-24',
          timeZone: 'America/Detroit',
          reason: 'Moved from Tuesday to Thursday',
          idempotencyKey: 'assignment-thursday-176',
        },
      });
      expect(rescheduled.statusCode).toBe(200);
      expect(rescheduled.json().data).toMatchObject({
        plannedLocalDate: '2026-09-24',
        revision: 2,
      });

      const execution = await app.inject({
        method: 'POST',
        url: `/api/v1/activities/${activityId}/executions`,
        headers: agentHeaders,
        payload: {
          assignmentId,
          actualOccurredAt: '2026-09-24T07:30:00.000-04:00',
          actualLocalDate: '2026-09-24',
          timeZone: 'America/Detroit',
          durationMinutes: 5,
          outcome: 'completed',
          structuredWorkoutSessionId: null,
          source: source('User reported completed PT'),
          idempotencyKey: 'execution-thursday-176',
        },
      });
      expect(execution.statusCode).toBe(201);
      const executionId = execution.json().data.id as string;

      const corrected = await app.inject({
        method: 'POST',
        url: `/api/v1/activity-executions/${executionId}/corrections`,
        headers: agentHeaders,
        payload: {
          expectedRevision: 1,
          correctedFields: { durationMinutes: 6 },
          reason: 'User clarified duration',
          idempotencyKey: 'execution-correction-176',
        },
      });
      expect(corrected.statusCode).toBe(200);
      expect(corrected.json().data.durationMinutes).toBe(6);

      const detail = await app.inject({
        method: 'GET',
        url: `/api/v1/activities/${activityId}`,
        headers: { authorization: `Bearer ${ownerJwt}` },
      });
      expect(detail.statusCode).toBe(200);
      expect(detail.json().data).toMatchObject({
        recordType: 'canonical',
        assignments: [{ plannedLocalDate: '2026-09-24', state: 'completed', revision: 3 }],
        executions: [{ actualLocalDate: '2026-09-24', durationMinutes: 6 }],
      });
      expect(detail.json().data.assignmentHistory).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ plannedLocalDate: '2026-09-22', revision: 1 }),
          expect.objectContaining({ plannedLocalDate: '2026-09-24', revision: 2 }),
          expect.objectContaining({
            plannedLocalDate: '2026-09-24',
            revision: 3,
            state: 'completed',
          }),
        ]),
      );
      expect(detail.json().data.executionCorrections).toHaveLength(2);
      expect(detail.json().data.sourceLinks).toEqual([
        expect.objectContaining({
          relation: 'observed_during',
          target: expect.objectContaining({
            kind: 'activity',
            id: related.json().data.activity.id,
          }),
        }),
      ]);
    } finally {
      await app.close();
    }
  });

  it('materializes effective-dated recurrence revisions and makes retries durable', async () => {
    const { buildServer } = await import('../../index.js');
    let app = buildServer();
    await app.ready();
    const payload = createActivityPayload('durable-activity-176');
    const first = await app.inject({
      method: 'POST',
      url: '/api/v1/activities',
      headers: agentHeaders,
      payload,
    });
    expect(first.statusCode).toBe(201);
    const activityId = first.json().data.activity.id as string;
    const replayBeforeRestart = await app.inject({
      method: 'POST',
      url: '/api/v1/activities',
      headers: agentHeaders,
      payload,
    });
    expect(replayBeforeRestart.json()).toEqual(first.json());
    expect(replayBeforeRestart.headers['idempotent-replay']).toBe('true');
    await app.close();

    app = buildServer();
    await app.ready();
    try {
      const replayAfterRestart = await app.inject({
        method: 'POST',
        url: '/api/v1/activities',
        headers: agentHeaders,
        payload,
      });
      expect(replayAfterRestart.json()).toEqual(first.json());
      expect(replayAfterRestart.headers['idempotent-replay']).toBe('true');
      const altered = await app.inject({
        method: 'POST',
        url: '/api/v1/activities',
        headers: agentHeaders,
        payload: { ...payload, name: 'Altered semantic request' },
      });
      expect(altered.statusCode).toBe(409);
      expect(altered.json().error.code).toBe('IDEMPOTENCY_KEY_REUSE');

      const recurrence = await app.inject({
        method: 'POST',
        url: `/api/v1/activities/${activityId}/recurrences`,
        headers: agentHeaders,
        payload: {
          effectiveFromLocalDate: '2026-09-21',
          timeZone: 'America/Detroit',
          frequency: 'specific_weekdays',
          interval: 1,
          weekdays: [1, 3],
          assignmentPolicy: 'unassigned_on_or_after_effective_date',
          idempotencyKey: 'recurrence-create-176',
        },
      });
      expect(recurrence.statusCode).toBe(201);
      const recurrenceId = recurrence.json().data.id as string;
      const firstRevisionId = recurrence.json().data.revisions[0].id as string;

      const firstMaterialization = await app.inject({
        method: 'POST',
        url: `/api/v1/activity-recurrences/${recurrenceId}/materialize`,
        headers: agentHeaders,
        payload: { from: '2026-09-21', to: '2026-09-27', idempotencyKey: 'materialize-week-1' },
      });
      expect(firstMaterialization.statusCode).toBe(200);
      expect(
        firstMaterialization
          .json()
          .data.created.map((item: { plannedLocalDate: string }) => item.plannedLocalDate),
      ).toEqual(['2026-09-21', '2026-09-23']);

      const revised = await app.inject({
        method: 'POST',
        url: `/api/v1/activity-recurrences/${recurrenceId}/revisions`,
        headers: agentHeaders,
        payload: {
          expectedRevisionId: firstRevisionId,
          effectiveFromLocalDate: '2026-09-24',
          timeZone: 'America/Detroit',
          frequency: 'specific_weekdays',
          interval: 1,
          weekdays: [4],
          assignmentPolicy: 'unassigned_on_or_after_effective_date',
          idempotencyKey: 'recurrence-revise-176',
        },
      });
      expect(revised.statusCode).toBe(201);
      const secondRevisionId = revised.json().data.revisions[1].id as string;
      const secondMaterialization = await app.inject({
        method: 'POST',
        url: `/api/v1/activity-recurrences/${recurrenceId}/materialize`,
        headers: agentHeaders,
        payload: { from: '2026-09-21', to: '2026-10-02', idempotencyKey: 'materialize-week-2' },
      });
      expect(secondMaterialization.statusCode).toBe(200);
      expect(secondMaterialization.json().data.created).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            plannedLocalDate: '2026-09-24',
            recurrenceRevisionId: secondRevisionId,
          }),
          expect.objectContaining({
            plannedLocalDate: '2026-10-01',
            recurrenceRevisionId: secondRevisionId,
          }),
        ]),
      );
      const detail = await app.inject({
        method: 'GET',
        url: `/api/v1/activities/${activityId}`,
        headers: agentHeaders,
      });
      expect(detail.json().data.assignments).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            plannedLocalDate: '2026-09-21',
            recurrenceRevisionId: firstRevisionId,
          }),
          expect.objectContaining({
            plannedLocalDate: '2026-09-24',
            recurrenceRevisionId: secondRevisionId,
          }),
        ]),
      );
      dbModule.sqlite.prepare(`delete from users where id = 'user-1'`).run();
      expect(
        dbModule.sqlite.prepare(`select count(*) from activity_recurrences`).pluck().get(),
      ).toBe(0);
      expect(
        dbModule.sqlite.prepare(`select count(*) from activity_assignments`).pluck().get(),
      ).toBe(0);
      expect(dbModule.sqlite.prepare('pragma foreign_key_check').all()).toEqual([]);
    } finally {
      await app.close();
    }
  });

  it('rejects spoofing and foreign records, resolves concurrent retries, and exposes exact OpenAPI contracts', async () => {
    const { buildServer } = await import('../../index.js');
    const app = buildServer();
    await app.ready();
    try {
      for (const spoofed of [
        { subjectUserId: 'user-2' },
        { actor: { kind: 'user', id: 'user-2', label: null } },
        { route: '/forged' },
        { operation: 'forged' },
        { requestFingerprint: 'a'.repeat(64) },
      ]) {
        const response = await app.inject({
          method: 'POST',
          url: '/api/v1/activities',
          headers: agentHeaders,
          payload: { ...createActivityPayload(`spoof-${Object.keys(spoofed)[0]}-176`), ...spoofed },
        });
        expect(response.statusCode).toBe(400);
      }

      const concurrent = await Promise.all(
        Array.from({ length: 8 }, () =>
          app.inject({
            method: 'POST',
            url: '/api/v1/activities',
            headers: agentHeaders,
            payload: createActivityPayload('concurrent-create-176'),
          }),
        ),
      );
      expect(new Set(concurrent.map((response) => response.json().data.activity.id))).toHaveLength(
        1,
      );
      expect(
        dbModule.sqlite.prepare(`select count(*) from canonical_activities`).pluck().get(),
      ).toBe(1);
      const firstConcurrent = concurrent[0];
      expect(firstConcurrent).toBeDefined();
      const activityId = firstConcurrent?.json().data.activity.id as string;

      const foreignRead = await app.inject({
        method: 'GET',
        url: `/api/v1/activities/${activityId}`,
        headers: otherAgentHeaders,
      });
      const foreignCorrection = await app.inject({
        method: 'PATCH',
        url: `/api/v1/activities/${activityId}`,
        headers: otherAgentHeaders,
        payload: {
          expectedRevision: 1,
          correctedFields: { name: 'Ownership leak' },
          reason: 'Must not write',
          idempotencyKey: 'foreign-correction-176',
        },
      });
      expect(foreignRead.statusCode).toBe(404);
      expect(foreignCorrection.statusCode).toBe(404);
      expect(
        dbModule.sqlite
          .prepare(`select count(*) from activity_idempotency_receipts where user_id = 'user-2'`)
          .pluck()
          .get(),
      ).toBe(0);

      const foreignGoal = await app.inject({
        method: 'POST',
        url: '/api/v1/activity-goals',
        headers: otherAgentHeaders,
        payload: {
          kind: 'mobility',
          label: 'Other user goal',
          idempotencyKey: 'foreign-goal-create-176',
        },
      });
      const rejectedForeignGoalLink = await app.inject({
        method: 'POST',
        url: '/api/v1/activities',
        headers: agentHeaders,
        payload: {
          ...createActivityPayload('foreign-goal-link-176'),
          goalIds: [foreignGoal.json().data.id],
        },
      });
      expect(rejectedForeignGoalLink.statusCode).toBe(404);
      expect(
        dbModule.sqlite
          .prepare(
            `select count(*) from activity_idempotency_receipts where idempotency_key = 'foreign-goal-link-176'`,
          )
          .pluck()
          .get(),
      ).toBe(0);

      dbModule.sqlite
        .prepare(
          `insert into workout_sessions
            (id, user_id, name, date, status, started_at, completed_at, duration, time_segments)
           values ('foreign-workout-session', 'user-2', 'Private workout', '2026-09-18',
                   'completed', 1789750800000, 1789754400000, 60, '[]')`,
        )
        .run();
      const rejectedForeignWorkoutLink = await app.inject({
        method: 'POST',
        url: `/api/v1/activities/${activityId}/links`,
        headers: agentHeaders,
        payload: {
          target: { kind: 'workout_session', id: 'foreign-workout-session', revisionId: null },
          relation: 'structured_workout_reference',
          idempotencyKey: 'foreign-workout-link-176',
        },
      });
      expect(rejectedForeignWorkoutLink.statusCode).toBe(404);

      const assignment = await app.inject({
        method: 'POST',
        url: `/api/v1/activities/${activityId}/assignments`,
        headers: agentHeaders,
        payload: {
          plannedLocalDate: '2026-11-01',
          timeZone: 'America/Detroit',
          recurrenceRevisionId: null,
          idempotencyKey: 'dst-assignment-176',
        },
      });
      const assignmentId = assignment.json().data.id as string;
      const foreignReschedule = await app.inject({
        method: 'PATCH',
        url: `/api/v1/activity-assignments/${assignmentId}/reschedule`,
        headers: otherAgentHeaders,
        payload: {
          expectedRevision: 1,
          plannedLocalDate: '2026-11-04',
          timeZone: 'America/Detroit',
          reason: 'Must not disclose assignment',
          idempotencyKey: 'foreign-reschedule-176',
        },
      });
      expect(foreignReschedule.statusCode).toBe(404);
      const staleRaces = await Promise.all([
        app.inject({
          method: 'PATCH',
          url: `/api/v1/activity-assignments/${assignmentId}/reschedule`,
          headers: agentHeaders,
          payload: {
            expectedRevision: 1,
            plannedLocalDate: '2026-11-02',
            timeZone: 'America/Detroit',
            reason: 'First contender',
            idempotencyKey: 'race-reschedule-a',
          },
        }),
        app.inject({
          method: 'PATCH',
          url: `/api/v1/activity-assignments/${assignmentId}/reschedule`,
          headers: agentHeaders,
          payload: {
            expectedRevision: 1,
            plannedLocalDate: '2026-11-03',
            timeZone: 'America/Detroit',
            reason: 'Second contender',
            idempotencyKey: 'race-reschedule-b',
          },
        }),
      ]);
      expect(staleRaces.map((response) => response.statusCode).sort()).toEqual([200, 409]);

      const execution = await app.inject({
        method: 'POST',
        url: `/api/v1/activities/${activityId}/executions`,
        headers: agentHeaders,
        payload: {
          assignmentId: null,
          actualOccurredAt: '2026-11-02T08:00:00.000-05:00',
          actualLocalDate: '2026-11-02',
          timeZone: 'America/Detroit',
          durationMinutes: 5,
          outcome: 'completed',
          structuredWorkoutSessionId: null,
          source: source(),
          idempotencyKey: 'race-execution-create-176',
        },
      });
      const executionId = execution.json().data.id as string;
      const foreignExecutionCorrection = await app.inject({
        method: 'POST',
        url: `/api/v1/activity-executions/${executionId}/corrections`,
        headers: otherAgentHeaders,
        payload: {
          expectedRevision: 1,
          correctedFields: { durationMinutes: 99 },
          reason: 'Must not disclose execution',
          idempotencyKey: 'foreign-execution-correction-176',
        },
      });
      expect(foreignExecutionCorrection.statusCode).toBe(404);
      const correctionRaces = await Promise.all([
        app.inject({
          method: 'POST',
          url: `/api/v1/activity-executions/${executionId}/corrections`,
          headers: agentHeaders,
          payload: {
            expectedRevision: 1,
            correctedFields: { durationMinutes: 6 },
            reason: 'First correction contender',
            idempotencyKey: 'race-correction-a',
          },
        }),
        app.inject({
          method: 'POST',
          url: `/api/v1/activity-executions/${executionId}/corrections`,
          headers: agentHeaders,
          payload: {
            expectedRevision: 1,
            correctedFields: { durationMinutes: 7 },
            reason: 'Second correction contender',
            idempotencyKey: 'race-correction-b',
          },
        }),
      ]);
      expect(correctionRaces.map((response) => response.statusCode).sort()).toEqual([200, 409]);

      const otherList = await app.inject({
        method: 'GET',
        url: '/api/v1/activities',
        headers: otherAgentHeaders,
      });
      expect(otherList.statusCode).toBe(200);
      expect(otherList.json().data).toEqual([]);

      const invalidDstDate = await app.inject({
        method: 'POST',
        url: `/api/v1/activities/${activityId}/executions`,
        headers: agentHeaders,
        payload: {
          assignmentId: null,
          actualOccurredAt: '2026-11-01T01:30:00.000-04:00',
          actualLocalDate: '2026-11-02',
          timeZone: 'America/Detroit',
          durationMinutes: 5,
          outcome: 'completed',
          structuredWorkoutSessionId: null,
          source: source(),
          idempotencyKey: 'dst-invalid-local-date',
        },
      });
      expect(invalidDstDate.statusCode).toBe(400);
      expect(
        dbModule.sqlite
          .prepare(
            `select count(*) from activity_idempotency_receipts where idempotency_key = 'dst-invalid-local-date'`,
          )
          .pluck()
          .get(),
      ).toBe(0);

      dbModule.sqlite.exec(`
        insert into activities
          (id, user_id, date, type, name, duration_minutes, notes, created_at, updated_at)
        values ('legacy-date-only', 'user-1', '2026-08-01', 'walking', 'Legacy walk', 30,
                null, 1785542400000, 1785542400000);
      `);
      const legacy = await app.inject({
        method: 'GET',
        url: '/api/v1/activities/legacy-date-only',
        headers: agentHeaders,
      });
      expect(legacy.json().data).toMatchObject({
        recordType: 'legacy_date_only',
        ambiguity: 'No occurrence time, timezone, actor, or provenance was recorded.',
      });
      const canonicalOnly = await app.inject({
        method: 'GET',
        url: '/api/v1/activities?includeLegacy=false',
        headers: agentHeaders,
      });
      expect(canonicalOnly.statusCode).toBe(200);
      expect(canonicalOnly.json().data).not.toEqual(
        expect.arrayContaining([expect.objectContaining({ recordType: 'legacy_date_only' })]),
      );

      const openApi = (await app.inject({ method: 'GET', url: '/api/docs/json' })).json();
      expect(openApi.paths['/api/v1/activities'].post.security).toEqual([{ agentToken: [] }]);
      const createProperties =
        openApi.paths['/api/v1/activities'].post.requestBody.content['application/json'].schema
          .properties;
      expect(createProperties).not.toHaveProperty('subjectUserId');
      expect(createProperties).not.toHaveProperty('actor');
      expect(createProperties).not.toHaveProperty('requestFingerprint');
      expect(openApi.paths).toMatchObject({
        '/api/v1/activity-goals': { get: expect.any(Object), post: expect.any(Object) },
        '/api/v1/activity-recurrences/{id}/materialize': { post: expect.any(Object) },
      });

      dbModule.sqlite.prepare(`delete from users where id = 'user-1'`).run();
      for (const table of [
        'canonical_activities',
        'activity_assignments',
        'activity_assignment_revisions',
        'activity_idempotency_receipts',
      ]) {
        expect(
          dbModule.sqlite
            .prepare(`select count(*) from ${table} where user_id = 'user-1'`)
            .pluck()
            .get(),
        ).toBe(0);
      }
      expect(dbModule.sqlite.prepare('pragma foreign_key_check').all()).toEqual([]);
    } finally {
      await app.close();
    }
  });
});
