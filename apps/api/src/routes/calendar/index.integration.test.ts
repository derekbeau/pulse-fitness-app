import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  calendarFoundationProjection,
  calendarReadModelSchema,
  calendarRuntimeSchema,
} from '@pulse/shared';

const migrationsFolder = fileURLToPath(new URL('../../../drizzle', import.meta.url));
const oldUrl = process.env.DATABASE_URL;
let directory = '';
let database: typeof import('../../db/index.js');
const auth = { authorization: 'AgentToken calendar-secret' };
const source = JSON.stringify({
  class: 'user_observation',
  sourceId: 'fictional-182',
  sourceLabel: 'Fictional',
  sourceOccurredAt: '2026-03-08T07:00:00.000Z',
  uncertainty: 'known',
  freshness: { state: 'current', asOf: '2026-03-08T07:00:00.000Z', reasons: [] },
  capturedAt: '2026-03-08T07:00:00.000Z',
  capturedBy: { kind: 'agent_token', id: 'agent', label: null },
});
const actor = JSON.stringify({ kind: 'agent_token', id: 'agent', label: null });
const url = (from = '2026-03-08', to = '2026-03-20', suffix = '') =>
  `/api/v1/calendar?from=${from}&to=${to}${suffix}`;

describe('Calendar registered API on a fictional isolated SQLite fixture', () => {
  beforeEach(async () => {
    directory = mkdtempSync(join(tmpdir(), 'pulse-calendar-182-'));
    process.env.DATABASE_URL = join(directory, 'test.db');
    process.env.JWT_SECRET = 'fictional-calendar-secret';
    vi.resetModules();
    database = await import('../../db/index.js');
    migrate(database.db, { migrationsFolder });
    const { users, agentTokens } = await import('../../db/schema/index.js');
    database.db
      .insert(users)
      .values([
        {
          id: 'owner',
          username: 'calendar-owner',
          passwordHash: 'x',
          preferences: { timeZone: 'America/Detroit' },
        },
        {
          id: 'foreign',
          username: 'calendar-foreign',
          passwordHash: 'x',
          preferences: { timeZone: 'America/Detroit' },
        },
      ])
      .run();
    database.db
      .insert(agentTokens)
      .values({
        id: 'agent',
        userId: 'owner',
        name: 'calendar',
        tokenHash: createHash('sha256').update('calendar-secret').digest('hex'),
      })
      .run();
  });
  afterEach(() => {
    database.sqlite.close();
    process.env.DATABASE_URL = oldUrl;
    delete process.env.JWT_SECRET;
    rmSync(directory, { recursive: true, force: true });
    vi.resetModules();
  });
  const seed = () => {
    const sql = database.sqlite;
    sql
      .prepare(
        "insert into canonical_activities (id,user_id,kind,name,source_json,actor_json,revision,current_revision_id,created_at,updated_at) values ('walk','owner','walking','Fictional walk',?,?,1,'walk-r1','2026-03-08T00:00:00.000Z','2026-03-08T00:00:00.000Z')",
      )
      .run(source, actor);
    sql
      .prepare(
        "insert into activity_assignments (id,user_id,activity_id,planned_local_date,time_zone,revision,current_revision_id,state,created_at,updated_at) values ('plan','owner','walk','2026-03-10','America/Detroit',1,'plan-r1','planned','2026-03-08T00:00:00.000Z','2026-03-08T00:00:00.000Z')",
      )
      .run();
    sql
      .prepare(
        "insert into activity_assignment_revisions (id,assignment_id,user_id,revision,planned_local_date,time_zone,state,actor_json,created_at) values ('plan-r1','plan','owner',1,'2026-03-10','America/Detroit','planned',?,'2026-03-08T00:00:00.000Z')",
      )
      .run(actor);
    sql
      .prepare(
        "insert into scheduled_workouts (id,user_id,date,created_at,updated_at) values ('unstarted','owner','2026-03-10',1000,1000),('started-plan','owner','2026-03-10',1000,1000)",
      )
      .run();
    sql
      .prepare(
        "insert into workout_sessions (id,user_id,scheduled_workout_id,name,date,status,started_at,completed_at,duration,time_segments,created_at,updated_at) values ('session','owner','started-plan','Fictional lift','2026-03-12','completed',1000,2000,60,'[]',1000,2000)",
      )
      .run();
    sql
      .prepare(
        "insert into activity_executions (id,user_id,activity_id,assignment_id,actual_occurred_at,actual_local_date,time_zone,outcome,structured_workout_session_id,source_json,revision,current_revision_id,created_at,updated_at) values ('actual','owner','walk','plan','2026-03-12T23:30:00.000-04:00','2026-03-12','America/Detroit','completed','session',?,1,'actual-r1','2026-03-13T03:30:00.000Z','2026-03-13T03:30:00.000Z')",
      )
      .run(source);
    sql
      .prepare(
        "insert into journal_entries (id,user_id,date,title,type,content,created_by,created_at,updated_at) values ('legacy-journal','owner','2026-03-12','Fictional note','observation','Text','user',1000,1000)",
      )
      .run();
    sql
      .prepare(
        "insert into nutrition_logs (id,user_id,date,status,status_updated_at,created_at,updated_at) values ('zero-log','owner','2026-03-12','complete',1000,1000,1000),('empty-implicit','owner','2026-03-13','unknown',null,1000,1000)",
      )
      .run();
    sql
      .prepare(
        "insert into activity_assignments (id,user_id,activity_id,planned_local_date,time_zone,revision,current_revision_id,state,created_at,updated_at) values ('foreign-plan','foreign','walk','2026-03-10','America/Detroit',1,'foreign-r1','planned','2026-03-08T00:00:00.000Z','2026-03-08T00:00:00.000Z')",
      )
      .run();
  };
  it('reads distinct planned and actual records, workout pairing, explicit zero, filters, ownership, and strict foundation', async () => {
    seed();
    const { buildServer } = await import('../../index.js');
    const app = buildServer();
    await app.ready();
    try {
      const response = await app.inject({ method: 'GET', url: url(), headers: auth });
      expect(response.statusCode, response.body).toBe(200);
      expect(response.headers['cache-control']).toBe('private, no-cache');
      const model = calendarRuntimeSchema.parse(response.json().data);
      expect(calendarReadModelSchema.safeParse(calendarFoundationProjection(model)).success).toBe(
        true,
      );
      const identity = model.items.map((item) => item.id);
      expect(identity).toContain('plan');
      expect(identity).toContain('actual');
      expect(identity).toContain('unstarted');
      expect(identity).toContain('session');
      expect(identity).not.toContain('started-plan');
      expect(identity).not.toContain('foreign-plan');
      expect(identity).not.toContain('empty-implicit');
      expect(model.items.find((item) => item.id === 'plan')).toMatchObject({
        localDate: '2026-03-10',
        state: 'planned',
      });
      expect(model.items.find((item) => item.id === 'actual')).toMatchObject({
        localDate: '2026-03-12',
        state: 'completed',
      });
      expect(model.items.find((item) => item.id === 'session')?.linkedActivityExecutionIds).toEqual(
        ['actual'],
      );
      expect(model.items.find((item) => item.id === 'zero-log')?.nutrition).toMatchObject({
        status: 'complete',
        actual: { calories: 0, protein: 0, carbs: 0, fat: 0 },
      });
      expect(model.items.find((item) => item.id === 'legacy-journal')).toMatchObject({
        missingProvenance: true,
        occurrenceAt: null,
        record: { revisionId: null },
      });
      const filtered = await app.inject({
        method: 'GET',
        url: url('2026-03-08', '2026-03-20', '&domain=activity&domain=journal&state=planned'),
        headers: auth,
      });
      expect(filtered.statusCode, filtered.body).toBe(200);
      expect(filtered.json().data.items.map((item: { id: string }) => item.id)).toEqual(['plan']);
      const workout = await app.inject({
        method: 'GET',
        url: url('2026-03-08', '2026-03-20', '&domain=workout'),
        headers: auth,
      });
      expect(workout.json().data.items.map((item: { id: string }) => item.id)).toEqual([
        'unstarted',
        'session',
      ]);
      const jwt = app.jwt.sign(
        { sub: 'owner', type: 'session', iss: 'pulse-api' },
        { expiresIn: '1h' },
      );
      expect(
        (
          await app.inject({
            method: 'GET',
            url: url(),
            headers: { authorization: `Bearer ${jwt}` },
          })
        ).statusCode,
      ).toBe(200);
    } finally {
      await app.close();
    }
  });
  it('reads committed reschedules without moving actual history or bypassing workout guards', async () => {
    seed();
    const { buildServer } = await import('../../index.js');
    const app = buildServer();
    await app.ready();
    const read = async () =>
      (
        await app.inject({ method: 'GET', url: url('2026-03-10', '2026-03-15'), headers: auth })
      ).json().data.items as Array<{ id: string; localDate: string }>;
    try {
      expect((await read()).find((item) => item.id === 'plan')?.localDate).toBe('2026-03-10');
      const move = await app.inject({
        method: 'PATCH',
        url: '/api/v1/activity-assignments/plan/reschedule',
        headers: auth,
        payload: {
          expectedRevision: 1,
          plannedLocalDate: '2026-03-14',
          timeZone: 'America/Detroit',
          reason: 'Fictional change',
          idempotencyKey: 'plan-move-182',
        },
      });
      expect(move.statusCode, move.body).toBe(200);
      const after = await read();
      expect(after.find((item) => item.id === 'plan')?.localDate).toBe('2026-03-14');
      expect(after.find((item) => item.id === 'actual')?.localDate).toBe('2026-03-12');
      const replay = await app.inject({
        method: 'PATCH',
        url: '/api/v1/activity-assignments/plan/reschedule',
        headers: auth,
        payload: {
          expectedRevision: 1,
          plannedLocalDate: '2026-03-14',
          timeZone: 'America/Detroit',
          reason: 'Fictional change',
          idempotencyKey: 'plan-move-182',
        },
      });
      expect(replay.statusCode).toBe(200);
      expect((await read()).filter((item) => item.id === 'plan')).toHaveLength(1);
      const conflict = await app.inject({
        method: 'PATCH',
        url: '/api/v1/activity-assignments/plan/reschedule',
        headers: auth,
        payload: {
          expectedRevision: 1,
          plannedLocalDate: '2026-03-15',
          timeZone: 'America/Detroit',
          reason: 'Changed request',
          idempotencyKey: 'plan-move-182',
        },
      });
      expect(conflict.statusCode).toBe(409);
      expect((await read()).find((item) => item.id === 'plan')?.localDate).toBe('2026-03-14');
      const jwt = app.jwt.sign(
        { sub: 'owner', type: 'session', iss: 'pulse-api' },
        { expiresIn: '1h' },
      );
      const headers = { authorization: `Bearer ${jwt}` };
      const workoutMove = await app.inject({
        method: 'PATCH',
        url: '/api/v1/scheduled-workouts/unstarted',
        headers,
        payload: { date: '2026-03-14', expectedUpdatedAt: 1000 },
      });
      expect(workoutMove.statusCode, workoutMove.body).toBe(200);
      expect((await read()).find((item) => item.id === 'unstarted')?.localDate).toBe('2026-03-14');
      const rejected = await app.inject({
        method: 'PATCH',
        url: '/api/v1/scheduled-workouts/started-plan',
        headers,
        payload: { date: '2026-03-14', expectedUpdatedAt: 1000 },
      });
      expect(rejected.statusCode, rejected.body).toBe(409);
      expect((await read()).find((item) => item.id === 'session')?.localDate).toBe('2026-03-12');
      expect(
        database.sqlite
          .prepare("select session_id from scheduled_workouts where id='started-plan'")
          .get(),
      ).toEqual({ session_id: null });
    } finally {
      await app.close();
    }
  });
  it('uses a stable date read identity for target-only days and keeps missing intake null', async () => {
    database.sqlite
      .prepare(
        "insert into nutrition_targets (id,user_id,calories,protein,carbs,fat,source,macro_calories,effective_date,created_at,updated_at) values ('target','owner',2000,100,250,60,'manual',1940,'2026-03-08',1000,1000)",
      )
      .run();
    database.sqlite
      .prepare(
        "insert into nutrition_target_events (id,target_id,user_id,sequence,effective_date,calories,protein,carbs,fat,macro_calories,source,event_type,recorded_at,created_at) values ('event','target','owner',1,'2026-03-08',2000,100,250,60,1940,'manual','manual_write',1000,1000)",
      )
      .run();
    const { buildServer } = await import('../../index.js');
    const app = buildServer();
    await app.ready();
    try {
      const response = await app.inject({
        method: 'GET',
        url: url('2026-03-08', '2026-03-08'),
        headers: auth,
      });
      expect(response.statusCode, response.body).toBe(200);
      const item = response.json().data.items[0];
      expect(item).toMatchObject({
        id: 'nutrition-day:2026-03-08',
        record: { kind: 'nutrition_log', id: 'nutrition-day:2026-03-08', revisionId: null },
        nutrition: { status: null, actual: null, target: { calories: 2000 } },
      });
      expect(item).not.toHaveProperty('sourceReference');
      expect(
        database.sqlite
          .prepare("select count(*) as count from nutrition_logs where user_id='owner'")
          .get(),
      ).toEqual({ count: 0 });
      const again = await app.inject({
        method: 'GET',
        url: url('2026-03-08', '2026-03-08'),
        headers: auth,
      });
      expect(again.json().data.items[0].id).toBe(item.id);
    } finally {
      await app.close();
    }
  });
  it('keeps meal-item actuals and target authority separate from a recorded zero day', async () => {
    seed();
    database.sqlite
      .prepare(
        "insert into nutrition_logs (id,user_id,date,status,status_updated_at,created_at,updated_at) values ('meal-log','owner','2026-03-14','partial',1000,1000,1000)",
      )
      .run();
    database.sqlite
      .prepare(
        "insert into meals (id,nutrition_log_id,name,created_at,updated_at) values ('meal','meal-log','Fictional meal',1000,1000)",
      )
      .run();
    database.sqlite
      .prepare(
        "insert into meal_items (id,meal_id,name,amount,unit,calories,protein,carbs,fat,created_at) values ('meal-item','meal','Fictional food',1,'serving',100,5,10,3,1000)",
      )
      .run();
    const { buildServer } = await import('../../index.js');
    const app = buildServer();
    await app.ready();
    try {
      const response = await app.inject({
        method: 'GET',
        url: url('2026-03-12', '2026-03-14'),
        headers: auth,
      });
      expect(response.statusCode, response.body).toBe(200);
      const items = response.json().data.items as Array<{
        id: string;
        nutrition?: { actual: unknown };
      }>;
      const { getDailyNutritionSummaryForDate } = await import('../nutrition/store.js');
      const summary = await getDailyNutritionSummaryForDate('owner', '2026-03-14');
      expect(items.find((item) => item.id === 'meal-log')?.nutrition?.actual).toEqual(
        summary.actual,
      );
      expect(items.find((item) => item.id === 'zero-log')?.nutrition?.actual).toEqual({
        calories: 0,
        protein: 0,
        carbs: 0,
        fat: 0,
      });
    } finally {
      await app.close();
    }
  });
  it('accepts 42 evidence logs; the 1000 nutrition source cap is unreachable under unique owner-day keys', async () => {
    const stmt = database.sqlite.prepare(
      "insert into nutrition_logs (id,user_id,date,status,status_updated_at,created_at,updated_at) values (?,'owner',?,'complete',1000,1000,1000)",
    );
    for (let index = 0; index < 42; index++) {
      const date = new Date(Date.parse('2026-03-08T12:00:00.000Z') + index * 86400000)
        .toISOString()
        .slice(0, 10);
      stmt.run(`log-${index}`, date);
    }
    const { buildServer } = await import('../../index.js');
    const app = buildServer();
    await app.ready();
    try {
      const accepted = await app.inject({
        method: 'GET',
        url: url('2026-03-08', '2026-04-18'),
        headers: auth,
      });
      expect(accepted.statusCode, accepted.body).toBe(200);
      expect(accepted.json().data.items).toHaveLength(42);
      const rejected = await app.inject({
        method: 'GET',
        url: url('2026-03-08', '2026-04-19'),
        headers: auth,
      });
      expect(rejected.statusCode).toBe(400);
      expect(rejected.json().error.code).toBe('CALENDAR_RANGE_LIMIT');
    } finally {
      await app.close();
    }
  });
  it('does not disclose foreign workouts, Journal, flares, or nutrition and keeps explicit unknown intake unknown', async () => {
    const sql = database.sqlite;
    sql
      .prepare(
        "insert into scheduled_workouts (id,user_id,date,created_at,updated_at) values ('foreign-schedule','foreign','2026-03-08',1000,1000)",
      )
      .run();
    sql
      .prepare(
        "insert into workout_sessions (id,user_id,name,date,status,started_at,completed_at,duration,time_segments,created_at,updated_at) values ('foreign-session','foreign','Foreign workout','2026-03-08','completed',1000,2000,60,'[]',1000,2000)",
      )
      .run();
    sql
      .prepare(
        "insert into journal_entries (id,user_id,date,title,type,content,created_by,created_at,updated_at) values ('foreign-journal','foreign','2026-03-08','Foreign note','observation','Text','user',1000,1000)",
      )
      .run();
    sql
      .prepare(
        "insert into body_context_concerns (id,user_id,label,body_region,symptom_state,management_state,source_json,revision,current_revision_id,created_at,updated_at) values ('foreign-concern','foreign','Foreign','arm','affirmed','active',?,1,'foreign-r1','2026-03-08T00:00:00.000Z','2026-03-08T00:00:00.000Z')",
      )
      .run(source);
    sql
      .prepare(
        "insert into body_context_flares (id,concern_id,user_id,occurred_at,local_date,time_zone,observation,source_json,created_at) values ('foreign-flare','foreign-concern','foreign','2026-03-08T03:30:00.000-04:00','2026-03-08','America/Detroit','Foreign flare',?,'2026-03-08T07:30:00.000Z')",
      )
      .run(source);
    sql
      .prepare(
        "insert into nutrition_logs (id,user_id,date,status,status_updated_at,created_at,updated_at) values ('foreign-log','foreign','2026-03-08','complete',1000,1000,1000),('explicit-unknown','owner','2026-03-08','unknown',1000,1000,1000)",
      )
      .run();
    const { buildServer } = await import('../../index.js');
    const app = buildServer();
    await app.ready();
    try {
      const owner = await app.inject({
        method: 'GET',
        url: url('2026-03-08', '2026-03-08'),
        headers: auth,
      });
      expect(owner.statusCode, owner.body).toBe(200);
      const items = owner.json().data.items as Array<{
        id: string;
        nutrition?: { status: string; actual: unknown };
      }>;
      const ids = items.map((item) => item.id);
      expect(ids).toEqual(['explicit-unknown']);
      expect(items[0]?.nutrition).toMatchObject({ status: 'unknown', actual: null });
      const foreignJwt = app.jwt.sign(
        { sub: 'foreign', type: 'session', iss: 'pulse-api' },
        { expiresIn: '1h' },
      );
      const foreign = await app.inject({
        method: 'GET',
        url: url('2026-03-08', '2026-03-08'),
        headers: { authorization: `Bearer ${foreignJwt}` },
      });
      expect(foreign.statusCode, foreign.body).toBe(200);
      expect(
        (foreign.json().data.items as Array<{ id: string }>).map((item) => item.id).sort(),
      ).toEqual([
        'foreign-flare',
        'foreign-journal',
        'foreign-log',
        'foreign-schedule',
        'foreign-session',
      ]);
    } finally {
      await app.close();
    }
  });
  it('uses recorded local dates across spring, fall, and UTC-day boundaries', async () => {
    const sql = database.sqlite;
    sql
      .prepare(
        "insert into canonical_activities (id,user_id,kind,name,source_json,actor_json,revision,current_revision_id,created_at,updated_at) values ('dst-walk','owner','walking','Fictional DST walk',?,?,1,'dst-r1','2026-03-01T00:00:00.000Z','2026-03-01T00:00:00.000Z')",
      )
      .run(source, actor);
    const execution = sql.prepare(
      "insert into activity_executions (id,user_id,activity_id,actual_occurred_at,actual_local_date,time_zone,outcome,source_json,revision,current_revision_id,created_at,updated_at) values (?,'owner','dst-walk',?,?,'America/Detroit','completed',?,1,?,'2026-03-01T00:00:00.000Z','2026-03-01T00:00:00.000Z')",
    );
    execution.run('spring', '2026-03-08T03:30:00.000-04:00', '2026-03-08', source, 'spring-r1');
    execution.run('fall', '2026-11-01T01:30:00.000-05:00', '2026-11-01', source, 'fall-r1');
    execution.run(
      'utc-boundary',
      '2026-03-12T23:30:00.000-04:00',
      '2026-03-12',
      source,
      'boundary-r1',
    );
    const { buildServer } = await import('../../index.js');
    const app = buildServer();
    await app.ready();
    try {
      const spring = await app.inject({
        method: 'GET',
        url: url('2026-03-08', '2026-03-12'),
        headers: auth,
      });
      expect(spring.statusCode, spring.body).toBe(200);
      expect(
        spring
          .json()
          .data.items.filter((item: { domain: string }) => item.domain === 'activity')
          .map((item: { id: string; localDate: string }) => [item.id, item.localDate]),
      ).toEqual([
        ['spring', '2026-03-08'],
        ['utc-boundary', '2026-03-12'],
      ]);
      const fall = await app.inject({
        method: 'GET',
        url: url('2026-11-01', '2026-11-01'),
        headers: auth,
      });
      expect(fall.statusCode, fall.body).toBe(200);
      expect(fall.json().data.items[0]).toMatchObject({
        id: 'fall',
        localDate: '2026-11-01',
        occurrenceAt: '2026-11-01T01:30:00.000-05:00',
      });
    } finally {
      await app.close();
    }
  });
  it('returns the missing-timezone error and leaves GET source rows untouched', async () => {
    const { buildServer } = await import('../../index.js');
    const app = buildServer();
    await app.ready();
    try {
      const jwt = app.jwt.sign(
        { sub: 'owner', type: 'session', iss: 'pulse-api' },
        { expiresIn: '1h' },
      );
      const jwtHeaders = { authorization: `Bearer ${jwt}` };
      const before = database.sqlite.prepare('select total_changes() as changes').get() as {
        changes: number;
      };
      const good = await app.inject({
        method: 'GET',
        url: url('2026-03-08', '2026-04-18'),
        headers: jwtHeaders,
      });
      expect(good.statusCode, good.body).toBe(200);
      expect(database.sqlite.prepare('select total_changes() as changes').get()).toEqual(before);
      database.sqlite
        .prepare("update users set preferences=? where id='owner'")
        .run(JSON.stringify({ timeZone: 'Invalid/Zone' }));
      const missing = await app.inject({
        method: 'GET',
        url: url('2026-03-08', '2026-03-08'),
        headers: jwtHeaders,
      });
      expect(missing.statusCode).toBe(400);
      expect(missing.json().error.code).toBe('USER_TIME_ZONE_REQUIRED');
    } finally {
      await app.close();
    }
  });
  it.each([
    [
      'source_activity_assignments',
      "insert into activity_assignments (id,user_id,activity_id,planned_local_date,time_zone,revision,current_revision_id,state,created_at,updated_at) values (?,'owner','scope-activity','2026-03-08','America/Detroit',1,?,'planned','2026-03-08T00:00:00.000Z','2026-03-08T00:00:00.000Z')",
    ],
    [
      'source_activity_executions',
      "insert into activity_executions (id,user_id,activity_id,actual_occurred_at,actual_local_date,time_zone,outcome,source_json,revision,current_revision_id,created_at,updated_at) values (?,'owner','scope-activity','2026-03-08T03:30:00.000-04:00','2026-03-08','America/Detroit','completed',?,1,?,'2026-03-08T07:30:00.000Z','2026-03-08T07:30:00.000Z')",
    ],
    [
      'source_legacy_activities',
      "insert into activities (id,user_id,date,type,name,duration_minutes) values (?,'owner','2026-03-08','walking','Fictional',1)",
    ],
    [
      'source_scheduled_workouts',
      "insert into scheduled_workouts (id,user_id,date,created_at,updated_at) values (?,'owner','2026-03-08',1000,1000)",
    ],
    [
      'source_workout_sessions',
      "insert into workout_sessions (id,user_id,name,date,status,started_at,completed_at,duration,time_segments,created_at,updated_at) values (?,'owner','Fictional','2026-03-08','completed',1000,2000,60,'[]',1000,2000)",
    ],
    [
      'source_journal_observations',
      "insert into journal_observations (id,user_id,local_date,time_zone,current_revision_id,revision,snapshot_json,created_at) values (?,'owner','2026-03-08','America/Detroit',?,1,?,'2026-03-08T07:30:00.000Z')",
    ],
    [
      'source_legacy_journal',
      "insert into journal_entries (id,user_id,date,title,type,content,created_by,created_at,updated_at) values (?,'owner','2026-03-08','Fictional','observation','Text','user',1000,1000)",
    ],
    [
      'source_observations',
      "insert into body_context_flares (id,concern_id,user_id,occurred_at,local_date,time_zone,observation,source_json,created_at) values (?,'scope-concern','owner','2026-03-08T03:30:00.000-04:00','2026-03-08','America/Detroit','Fictional',?,'2026-03-08T07:30:00.000Z')",
    ],
  ] as const)(
    'enforces %s at 1000 and rejects 1001 before output filtering',
    async (scope, insertion) => {
      const sql = database.sqlite;
      if (scope.startsWith('source_activity_'))
        sql
          .prepare(
            "insert into canonical_activities (id,user_id,kind,name,source_json,actor_json,revision,current_revision_id,created_at,updated_at) values ('scope-activity','owner','walking','Fictional',?,?,1,'scope-r1','2026-03-08T00:00:00.000Z','2026-03-08T00:00:00.000Z')",
          )
          .run(source, actor);
      if (scope === 'source_observations')
        sql
          .prepare(
            "insert into body_context_concerns (id,user_id,label,body_region,symptom_state,management_state,source_json,revision,current_revision_id,created_at,updated_at) values ('scope-concern','owner','Fictional','arm','affirmed','active',?,1,'concern-r1','2026-03-08T00:00:00.000Z','2026-03-08T00:00:00.000Z')",
          )
          .run(source);
      const statement = sql.prepare(insertion);
      for (let i = 0; i < 1000; i++) {
        const id = `scope-${i}`;
        if (scope === 'source_activity_assignments') statement.run(id, `${id}-r1`);
        else if (scope === 'source_activity_executions') statement.run(id, source, `${id}-r1`);
        else if (scope === 'source_journal_observations')
          statement.run(id, `${id}-r1`, JSON.stringify({ title: 'Fictional' }));
        else if (scope === 'source_observations') statement.run(id, source);
        else statement.run(id);
      }
      const { buildServer } = await import('../../index.js');
      const app = buildServer();
      await app.ready();
      try {
        const at = await app.inject({
          method: 'GET',
          url: url('2026-03-08', '2026-03-08'),
          headers: auth,
        });
        expect(at.statusCode, `${scope}: ${at.body}`).toBe(200);
        expect(at.json().data.items).toHaveLength(1000);
        const id = 'scope-1000';
        if (scope === 'source_activity_assignments') statement.run(id, `${id}-r1`);
        else if (scope === 'source_activity_executions') statement.run(id, source, `${id}-r1`);
        else if (scope === 'source_journal_observations')
          statement.run(id, `${id}-r1`, JSON.stringify({ title: 'Fictional' }));
        else if (scope === 'source_observations') statement.run(id, source);
        else statement.run(id);
        const over = await app.inject({
          method: 'GET',
          url: url('2026-03-08', '2026-03-08', '&domain=nutrition'),
          headers: auth,
        });
        expect(over.statusCode, `${scope}: ${over.body}`).toBe(422);
        expect(over.json().error).toMatchObject({
          code: 'CALENDAR_READ_LIMIT_EXCEEDED',
          details: { scope, limit: 1000 },
        });
      } finally {
        await app.close();
      }
    },
  );
  it('rejects invalid ranges and filter values, preserves source read limits', async () => {
    const { buildServer } = await import('../../index.js');
    const app = buildServer();
    await app.ready();
    try {
      expect(
        (
          await app.inject({ method: 'GET', url: url('2026-03-20', '2026-03-08'), headers: auth })
        ).json().error.code,
      ).toBe('CALENDAR_RANGE_INVALID');
      expect(
        (
          await app.inject({ method: 'GET', url: url('2026-03-08', '2026-04-19'), headers: auth })
        ).json().error.code,
      ).toBe('CALENDAR_RANGE_LIMIT');
      expect(
        (
          await app.inject({
            method: 'GET',
            url: url('2026-03-08', '2026-03-08', '&domain=nope'),
            headers: auth,
          })
        ).statusCode,
      ).toBe(400);
      expect(
        (
          await app.inject({
            method: 'GET',
            url: url('2026-03-08', '2026-03-08', '&state=nope'),
            headers: auth,
          })
        ).statusCode,
      ).toBe(400);
      const sql = database.sqlite.prepare(
        "insert into activities (id,user_id,date,type,name,duration_minutes) values (?,'owner','2026-03-08','walking','Fictional',1)",
      );
      for (let i = 0; i < 1001; i++) sql.run(`activity-${i}`);
      const overflow = await app.inject({
        method: 'GET',
        url: url('2026-03-08', '2026-03-08', '&domain=workout'),
        headers: auth,
      });
      expect(overflow.statusCode, overflow.body).toBe(422);
      expect(overflow.json().error).toMatchObject({
        code: 'CALENDAR_READ_LIMIT_EXCEEDED',
        details: { scope: 'source_legacy_activities', limit: 1000 },
      });
    } finally {
      await app.close();
    }
  });
});
