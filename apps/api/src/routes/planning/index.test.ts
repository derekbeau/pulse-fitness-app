import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const migrationsFolder = fileURLToPath(new URL('../../../drizzle', import.meta.url));
const oldUrl = process.env.DATABASE_URL;
const oldNow = process.env.PULSE_TEST_NOW;
let dir = '';
let database: typeof import('../../db/index.js');
const source = (sourceId: string, asOf = '2026-09-01T12:00:00.000Z') => ({
  class: 'user_observation',
  sourceId,
  sourceLabel: sourceId,
  sourceOccurredAt: asOf,
  capturedAt: asOf,
  capturedBy: { kind: 'agent_token', id: 'agent', label: 'agent' },
  uncertainty: 'known',
  freshness: { state: 'current', asOf, reasons: [] },
});
const auth = { authorization: 'AgentToken planning-secret' };
const run = (sql: string, ...args: unknown[]) => database.sqlite.prepare(sql).run(...args);
const domainSnapshot = () =>
  JSON.stringify(
    [
      'body_context_concerns',
      'body_context_capabilities',
      'body_context_guidance',
      'body_context_flares',
      'journal_observations',
      'workout_sessions',
      'activity_executions',
      'daily_check_in_questions',
      'daily_check_in_answers',
    ].map((table) => database.sqlite.prepare(`select * from ${table} order by id`).all()),
  );
const addFlare = (id: string) =>
  run(
    'insert into body_context_flares (id,concern_id,user_id,occurred_at,local_date,time_zone,observation,source_json,created_at) values (?,?,?,?,?,?,?,?,?)',
    id,
    'shoulder',
    'owner',
    '2026-09-19T16:00:00.000Z',
    '2026-09-19',
    'America/Detroit',
    `Fictional ${id}`,
    JSON.stringify(source(id)),
    '2026-09-19T16:00:00.000Z',
  );
const addJournal = (id: string) => {
  const snapshot = {
    id,
    subjectUserId: 'owner',
    localDate: '2026-09-19',
    timeZone: 'America/Detroit',
    title: `Fictional ${id}`,
    content: `A recorded observation for ${id}.`,
    category: 'movement',
    sourceReferences: [
      { kind: 'body_concern', id: 'shoulder', subjectUserId: 'owner', revisionId: 'shoulder-r1' },
    ],
    source: source(id),
    currentRevisionId: `${id}-r1`,
    createdAt: '2026-09-19T16:00:00.000Z',
  };
  run(
    'insert into journal_observations (id,user_id,local_date,time_zone,current_revision_id,revision,snapshot_json,created_at) values (?,?,?,?,?,?,?,?)',
    id,
    'owner',
    '2026-09-19',
    'America/Detroit',
    `${id}-r1`,
    1,
    JSON.stringify(snapshot),
    '2026-09-19T16:00:00.000Z',
  );
};

describe('registered planning and session context reads', () => {
  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'pulse-planning-181-'));
    process.env.DATABASE_URL = join(dir, 'test.db');
    process.env.JWT_SECRET = 'fictional-planning-secret';
    process.env.PULSE_TEST_NOW = '2026-09-20T04:30:00.000Z';
    vi.resetModules();
    database = await import('../../db/index.js');
    migrate(database.db, { migrationsFolder });
    const { users, agentTokens } = await import('../../db/schema/index.js');
    database.db
      .insert(users)
      .values([
        {
          id: 'owner',
          username: 'owner',
          passwordHash: 'x',
          preferences: { timeZone: 'America/Detroit' },
        },
        {
          id: 'foreign',
          username: 'foreign',
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
        name: 'agent',
        tokenHash: createHash('sha256').update('planning-secret').digest('hex'),
      })
      .run();
    for (const [id, region, state] of [
      ['shoulder', 'shoulder', 'active'],
      ['knee', 'knee', 'maintenance'],
    ] as const)
      run(
        'insert into body_context_concerns (id,user_id,label,body_region,symptom_state,management_state,source_json,revision,current_revision_id,created_at,updated_at) values (?,?,?,?,?,?,?,?,?,?,?)',
        id,
        'owner',
        id,
        region,
        'unknown',
        state,
        JSON.stringify(source(id)),
        1,
        `${id}-r1`,
        '2026-09-01T12:00:00.000Z',
        '2026-09-01T12:00:00.000Z',
      );
    run(
      'insert into body_context_capabilities (id,user_id,label,state,source_json,revision,current_revision_id,created_at,updated_at) values (?,?,?,?,?,?,?,?,?)',
      'press',
      'owner',
      'Press capacity',
      'developing',
      JSON.stringify(source('press')),
      1,
      'press-r1',
      '2026-09-01T12:00:00.000Z',
      '2026-09-18T12:00:00.000Z',
    );
    run(
      'insert into body_context_capabilities (id,user_id,label,state,source_json,revision,current_revision_id,created_at,updated_at) values (?,?,?,?,?,?,?,?,?)',
      'leg',
      'owner',
      'Leg capacity',
      'developing',
      JSON.stringify(source('leg')),
      1,
      'leg-r1',
      '2026-09-01T12:00:00.000Z',
      '2026-09-19T12:00:00.000Z',
    );
    run(
      'insert into body_context_guidance (id,user_id,concern_id,capability_id,text,state,source_json,revision,current_revision_id,created_at,updated_at) values (?,?,?,?,?,?,?,?,?,?,?)',
      'guide',
      'owner',
      'shoulder',
      'press',
      'Use recorded range',
      'current',
      JSON.stringify(source('guide')),
      1,
      'guide-r1',
      '2026-09-01T12:00:00.000Z',
      '2026-09-01T12:00:00.000Z',
    );
    for (const [id, status, duration] of [
      ['upper', 'completed', 600],
      ['lower', 'paused', null],
      ['scheduled', 'scheduled', null],
      ['cancelled', 'cancelled', null],
    ] as const)
      run(
        'insert into workout_sessions (id,user_id,name,date,status,started_at,completed_at,duration) values (?,?,?,?,?,?,?,?)',
        id,
        'owner',
        id,
        '2026-09-19',
        status,
        Date.parse('2026-09-19T12:00:00Z'),
        status === 'completed' ? Date.parse('2026-09-19T13:00:00Z') : null,
        duration,
      );
    run(
      "insert into workout_sessions (id,user_id,name,date,status,started_at) values ('foreign-session','foreign','foreign','2026-09-19','paused',1789819200000)",
    );
    run(
      "insert into exercises (id,user_id,name,muscle_groups,equipment,category) values ('shoulder-ex','owner','Shoulder','[\"shoulders\"]','none','compound')",
    );
    run(
      "insert into exercises (id,user_id,name,muscle_groups,equipment,category) values ('leg-ex','owner','Leg','[\"quads\"]','none','compound')",
    );
    run(
      "insert into session_sets (id,session_id,exercise_id,set_number) values ('upper-set','upper','shoulder-ex',1)",
    );
    run(
      "insert into session_sets (id,session_id,exercise_id,set_number) values ('lower-set','lower','leg-ex',1)",
    );
  });
  afterEach(() => {
    database.sqlite.close();
    process.env.DATABASE_URL = oldUrl;
    process.env.PULSE_TEST_NOW = oldNow;
    delete process.env.JWT_SECRET;
    rmSync(dir, { recursive: true, force: true });
    vi.resetModules();
  });

  it('makes session relevance differ and preserves irrelevant concerns, freshness and active duration', async () => {
    const { buildServer } = await import('../../index.js');
    const app = buildServer();
    await app.ready();
    try {
      const before = domainSnapshot();
      const upper = await app.inject({
        method: 'GET',
        url: '/api/v1/workout-sessions/upper/session-context',
        headers: auth,
      });
      const lower = await app.inject({
        method: 'GET',
        url: '/api/v1/workout-sessions/lower/session-context',
        headers: auth,
      });
      expect(upper.statusCode).toBe(200);
      expect(lower.statusCode).toBe(200);
      const openApi = await app.inject({ method: 'GET', url: '/api/docs/json' });
      expect(openApi.statusCode).toBe(200);
      expect(openApi.json().paths).toHaveProperty('/api/v1/planning/what-matters');
      expect(openApi.json().paths).toHaveProperty('/api/v1/workout-sessions/{id}/session-context');
      expect(upper.headers['cache-control']).toBe('private, no-cache');
      const a = upper.json().data;
      const b = lower.json().data;
      expect(a.relevantConcerns.map((x: { id: string }) => x.id)).toEqual(['shoulder']);
      expect(b.relevantConcerns).toEqual([]);
      expect(a.trackedIrrelevantConcerns.map((x: { id: string }) => x.id)).toEqual(['knee']);
      expect(b.trackedIrrelevantConcerns.map((x: { id: string }) => x.id)).toEqual([
        'knee',
        'shoulder',
      ]);
      expect(a.positiveFocus.map((x: { id: string }) => x.id)).toEqual(['press']);
      expect(b.positiveFocus.map((x: { id: string }) => x.id)).toEqual(['leg']);
      expect(a.positiveFocusAttributions[0].derivedFreshness.state).toBe('stale');
      expect(a.guidanceFreshnessAttributions[0].derivedFreshness).toMatchObject({
        state: 'stale',
        reasons: ['as_of_older_than_14_local_days'],
      });
      expect(a.workload.items.map((x: { identityId: string }) => x.identityId)).toEqual([
        'lower',
        'upper',
      ]);
      expect(
        a.workload.items.find((x: { identityId: string }) => x.identityId === 'upper')
          .workoutDurationSeconds,
      ).toBe(600);
      expect(a.workload.totals.workoutDurationSeconds).toBeNull();
      expect(a.missingInputs).toContain('workout_load_duration:lower');
      expect(a.missingInputs).toContain('sleep');
      expect(a.missingInputs).toContain('training_phase');
      const { sessionContextReadModelSchema, sessionContextFoundationProjection } =
        await import('@pulse/shared');
      expect(sessionContextReadModelSchema.safeParse(a).success).toBe(false);
      expect(
        sessionContextReadModelSchema.safeParse(sessionContextFoundationProjection(a)).success,
      ).toBe(true);
      expect(domainSnapshot()).toBe(before);
    } finally {
      await app.close();
    }
  });

  it('serves local-date reads, hides ineligible sessions, and supports JWT', async () => {
    const { buildServer } = await import('../../index.js');
    const app = buildServer();
    await app.ready();
    try {
      const jwt = app.jwt.sign(
        { sub: 'owner', type: 'session', iss: 'pulse-api' },
        { expiresIn: '1h' },
      );
      const date = await app.inject({
        method: 'GET',
        url: '/api/v1/planning/what-matters?date=2026-09-19',
        headers: { authorization: `Bearer ${jwt}` },
      });
      expect(date.statusCode).toBe(200);
      expect(date.json().data.target).toEqual({ kind: 'local_date', workoutSessionId: null });
      const scheduled = await app.inject({
        method: 'GET',
        url: '/api/v1/workout-sessions/scheduled/session-context',
        headers: auth,
      });
      expect(scheduled.statusCode).toBe(200);
      expect(
        scheduled
          .json()
          .data.workload.items.every(
            (item: { identityId: string }) => item.identityId !== 'scheduled',
          ),
      ).toBe(true);
      run("update workout_sessions set deleted_at='2026-09-20T00:00:00.000Z' where id='lower'");
      for (const id of ['foreign-session', 'cancelled', 'lower', 'absent']) {
        const result = await app.inject({
          method: 'GET',
          url: `/api/v1/workout-sessions/${id}/session-context`,
          headers: auth,
        });
        expect(result.statusCode).toBe(404);
        expect(result.json().error.code).toBe('SESSION_CONTEXT_NOT_FOUND');
      }
    } finally {
      await app.close();
    }
  });

  it('reports missing positive focus instead of inventing recovery or phase copy', async () => {
    run("delete from body_context_guidance where id='guide'");
    run("delete from body_context_capabilities where id in ('press','leg')");
    const { buildServer } = await import('../../index.js');
    const app = buildServer();
    await app.ready();
    try {
      const result = await app.inject({
        method: 'GET',
        url: '/api/v1/workout-sessions/upper/session-context',
        headers: auth,
      });
      expect(result.statusCode).toBe(200);
      expect(result.json().data.positiveFocus).toEqual([]);
      expect(result.json().data.missingInputs).toContain('positive_focus');
      expect(result.json().data).not.toHaveProperty('sleepStatus');
      expect(result.json().data).not.toHaveProperty('trainingPhase');
    } finally {
      await app.close();
    }
  });

  it('counts unlinked PT once, merges valid links, and reports inconsistent links without invented load', async () => {
    run(
      'insert into canonical_activities (id,user_id,kind,name,source_json,actor_json,current_revision_id,created_at,updated_at) values (?,?,?,?,?,?,?,?,?)',
      'pt',
      'owner',
      'physical_therapy',
      'PT',
      JSON.stringify(source('pt')),
      JSON.stringify({ kind: 'agent_token', id: 'agent', label: 'agent' }),
      'pt-r1',
      '2026-09-19T12:00:00.000Z',
      '2026-09-19T12:00:00.000Z',
    );
    const insert =
      'insert into activity_executions (id,user_id,activity_id,actual_occurred_at,actual_local_date,time_zone,duration_minutes,outcome,structured_workout_session_id,source_json,current_revision_id,created_at,updated_at) values (?,?,?,?,?,?,?,?,?,?,?,?,?)';
    const addExecution = (
      id: string,
      date: string,
      outcome: string,
      linked: string | null,
      minutes: number | null,
    ) =>
      run(
        insert,
        id,
        'owner',
        'pt',
        `${date}T16:00:00.000Z`,
        date,
        'America/Detroit',
        minutes,
        outcome,
        linked,
        JSON.stringify(source(id)),
        `${id}-r1`,
        `${date}T16:00:00.000Z`,
        `${date}T16:00:00.000Z`,
      );
    addExecution('pt-unlinked', '2026-09-19', 'partial', null, 5);
    addExecution('linked-upper', '2026-09-19', 'completed', 'upper', 45);
    addExecution('linked-scheduled', '2026-09-19', 'completed', 'scheduled', 30);
    addExecution('linked-wrong-date', '2026-09-18', 'completed', 'upper', 20);
    addExecution('skipped', '2026-09-19', 'skipped', null, 10);
    const { buildServer } = await import('../../index.js');
    const app = buildServer();
    await app.ready();
    try {
      const result = await app.inject({
        method: 'GET',
        url: '/api/v1/planning/what-matters?date=2026-09-19',
        headers: auth,
      });
      expect(result.statusCode).toBe(200);
      const data = result.json().data;
      expect(data.workload.items.map((item: { identityId: string }) => item.identityId)).toEqual([
        'pt-unlinked',
        'lower',
        'upper',
      ]);
      expect(
        data.workload.items.find((item: { identityId: string }) => item.identityId === 'upper')
          .linkedActivityExecutionIds,
      ).toEqual(['linked-upper']);
      expect(data.workload.totals.activityDurationMinutes).toBe(5);
      expect(data.workload.totals.activityExecutionCount).toBe(1);
      expect(data.missingInputs).toContain('linked_load_mismatch:linked-scheduled');
      expect(data.missingInputs).toContain('linked_load_mismatch:linked-wrong-date');
      expect(data.missingInputs).not.toContain('activity_load_duration:skipped');
      run("update workout_sessions set status='scheduled' where id='lower'");
      run("update workout_sessions set status='cancelled' where id='upper'");
      const noWorkout = await app.inject({
        method: 'GET',
        url: '/api/v1/planning/what-matters?date=2026-09-19',
        headers: auth,
      });
      expect(noWorkout.statusCode).toBe(200);
      expect(noWorkout.json().data.workload.totals.workoutSessionCount).toBe(0);
      expect(
        noWorkout.json().data.workload.items.map((item: { identityId: string }) => item.identityId),
      ).toEqual(['pt-unlinked']);
      expect(noWorkout.json().data.missingInputs).toContain('linked_load_mismatch:linked-upper');
    } finally {
      await app.close();
    }
  });

  it('signals owner-scoped relevant concern overflow rather than truncating at 20', async () => {
    for (let i = 0; i < 20; i++) {
      const id = `shoulder-${i}`;
      run(
        'insert into body_context_concerns (id,user_id,label,body_region,symptom_state,management_state,source_json,revision,current_revision_id,created_at,updated_at) values (?,?,?,?,?,?,?,?,?,?,?)',
        id,
        'owner',
        id,
        'right shoulder',
        'not_asked',
        'active',
        JSON.stringify(source(id)),
        1,
        `${id}-r1`,
        '2026-09-01T12:00:00.000Z',
        '2026-09-01T12:00:00.000Z',
      );
      run(
        'insert into body_context_guidance (id,user_id,concern_id,capability_id,text,state,source_json,revision,current_revision_id,created_at,updated_at) values (?,?,?,?,?,?,?,?,?,?,?)',
        `guide-${i}`,
        'owner',
        id,
        null,
        `Recorded guidance ${i}`,
        'current',
        JSON.stringify(source(`guide-${i}`)),
        1,
        `guide-${i}-r1`,
        '2026-09-01T12:00:00.000Z',
        '2026-09-01T12:00:00.000Z',
      );
    }
    const { buildServer } = await import('../../index.js');
    const app = buildServer();
    await app.ready();
    try {
      const read = () =>
        app.inject({
          method: 'GET',
          url: '/api/v1/workout-sessions/upper/session-context',
          headers: auth,
        });
      const above = await read();
      expect(above.statusCode).toBe(422);
      expect(above.json().error).toMatchObject({
        code: 'SESSION_CONTEXT_READ_LIMIT_EXCEEDED',
        details: { scope: 'relevant_concerns', limit: 20 },
      });
      run("update body_context_concerns set management_state='archived' where id='shoulder-0'");
      const at = await read();
      expect(at.statusCode).toBe(200);
      expect(at.json().data.relevantConcerns).toHaveLength(20);
      run("update body_context_concerns set management_state='archived' where id='shoulder-1'");
      const below = await read();
      expect(below.statusCode).toBe(200);
      expect(below.json().data.relevantConcerns).toHaveLength(19);
    } finally {
      await app.close();
    }
  });

  it('keeps flare and Journal observations separate and labels co-occurrence only by date', async () => {
    run(
      'insert into body_context_flares (id,concern_id,user_id,occurred_at,local_date,time_zone,observation,source_json,created_at) values (?,?,?,?,?,?,?,?,?)',
      'flare',
      'shoulder',
      'owner',
      '2026-09-19T16:00:00.000Z',
      '2026-09-19',
      'America/Detroit',
      'Fictional shoulder tightness',
      JSON.stringify(source('flare')),
      '2026-09-19T16:00:00.000Z',
    );
    const journal = {
      id: 'journal',
      subjectUserId: 'owner',
      localDate: '2026-09-19',
      timeZone: 'America/Detroit',
      title: 'Fictional response',
      content: 'Noted a brief change after movement.',
      category: 'movement',
      sourceReferences: [
        { kind: 'body_concern', id: 'shoulder', subjectUserId: 'owner', revisionId: 'shoulder-r1' },
        {
          kind: 'workout_session',
          id: 'upper',
          subjectUserId: 'owner',
          revisionId: 'fictional-current',
        },
      ],
      source: source('journal'),
      currentRevisionId: 'journal-r1',
      createdAt: '2026-09-19T16:00:00.000Z',
    };
    run(
      'insert into journal_observations (id,user_id,local_date,time_zone,current_revision_id,revision,snapshot_json,created_at) values (?,?,?,?,?,?,?,?)',
      'journal',
      'owner',
      '2026-09-19',
      'America/Detroit',
      'journal-r1',
      1,
      JSON.stringify(journal),
      '2026-09-19T16:00:00.000Z',
    );
    const { buildServer } = await import('../../index.js');
    const app = buildServer();
    await app.ready();
    try {
      const result = await app.inject({
        method: 'GET',
        url: '/api/v1/workout-sessions/upper/session-context',
        headers: auth,
      });
      expect(result.statusCode).toBe(200);
      const data = result.json().data;
      expect(data.recentObservations.map((item: { id: string }) => item.id)).toEqual(['flare']);
      expect(data.journalObservations.map((item: { id: string }) => item.id)).toEqual(['journal']);
      expect(data.coOccurrences).toHaveLength(4);
      expect(
        data.coOccurrences.every(
          (item: { relationship: string }) => item.relationship === 'same_local_date',
        ),
      ).toBe(true);
      expect(JSON.stringify(data)).not.toMatch(/cause|clearance|diagnosis/iu);
    } finally {
      await app.close();
    }
  });

  it('uses local date windows across DST and requires the subject timezone', async () => {
    const { buildServer } = await import('../../index.js');
    const app = buildServer();
    await app.ready();
    try {
      for (const [date, expectedStart] of [
        ['2026-03-08', '2026-03-02'],
        ['2026-11-01', '2026-10-26'],
      ] as const) {
        const result = await app.inject({
          method: 'GET',
          url: `/api/v1/planning/what-matters?date=${date}`,
          headers: auth,
        });
        expect(result.statusCode).toBe(200);
        expect(result.json().data.workload.window).toEqual({
          startLocalDate: expectedStart,
          endLocalDate: date,
          timeZone: 'America/Detroit',
        });
      }
      run("update users set preferences='{}' where id='owner'");
      const missingZone = await app.inject({
        method: 'GET',
        url: '/api/v1/planning/what-matters',
        headers: auth,
      });
      expect(missingZone.statusCode).toBe(400);
      expect(missingZone.json().error.code).toBe('USER_TIME_ZONE_REQUIRED');
    } finally {
      await app.close();
    }
  });

  it('keeps symptom states and source classes intact when guidance is no longer current', async () => {
    run("update body_context_guidance set state='superseded' where id='guide'");
    run(
      "update body_context_concerns set symptom_state='denied', source_json=? where id='shoulder'",
      JSON.stringify({ ...source('clinician'), class: 'clinician_authored' }),
    );
    run(
      "update body_context_concerns set symptom_state='not_asked', source_json=? where id='knee'",
      JSON.stringify({ ...source('relay'), class: 'user_relayed_clinician' }),
    );
    run(
      "update body_context_capabilities set source_json=? where id='leg'",
      JSON.stringify({ ...source('suggestion'), class: 'agent_suggestion' }),
    );
    const { buildServer } = await import('../../index.js');
    const app = buildServer();
    await app.ready();
    try {
      const result = await app.inject({
        method: 'GET',
        url: '/api/v1/workout-sessions/upper/session-context',
        headers: auth,
      });
      expect(result.statusCode).toBe(200);
      const data = result.json().data;
      expect(data.relevantConcerns[0]).toMatchObject({
        id: 'shoulder',
        symptomState: 'denied',
        source: { class: 'clinician_authored' },
      });
      expect(data.trackedIrrelevantConcerns[0]).toMatchObject({
        id: 'knee',
        symptomState: 'not_asked',
        source: { class: 'user_relayed_clinician' },
      });
      expect(data.positiveFocus[0].source.class).toBe('agent_suggestion');
      expect(data.applicableGuidance).toEqual([]);
      expect(data.missingInputs).toContain('guidance_for_concern:shoulder');
    } finally {
      await app.close();
    }
  });

  it('bounds irrelevant concerns and workload items without counting foreign rows', async () => {
    for (let i = 0; i < 51; i++) {
      const id = `knee-${i}`;
      run(
        'insert into body_context_concerns (id,user_id,label,body_region,symptom_state,management_state,source_json,revision,current_revision_id,created_at,updated_at) values (?,?,?,?,?,?,?,?,?,?,?)',
        id,
        'owner',
        id,
        'knee',
        'unknown',
        'maintenance',
        JSON.stringify(source(id)),
        1,
        `${id}-r1`,
        '2026-09-01T12:00:00.000Z',
        '2026-09-01T12:00:00.000Z',
      );
    }
    const { buildServer } = await import('../../index.js');
    const app = buildServer();
    await app.ready();
    try {
      const read = () =>
        app.inject({
          method: 'GET',
          url: '/api/v1/workout-sessions/upper/session-context',
          headers: auth,
        });
      const above = await read();
      expect(above.statusCode).toBe(422);
      expect(above.json().error.details).toEqual({
        scope: 'tracked_irrelevant_concerns',
        limit: 50,
      });
      run(
        "update body_context_concerns set management_state='archived' where id in ('knee-0','knee-1')",
      );
      const at = await read();
      expect(at.statusCode).toBe(200);
      expect(at.json().data.trackedIrrelevantConcerns).toHaveLength(50);
      run("update body_context_concerns set management_state='archived' where id='knee-2'");
      const below = await read();
      expect(below.statusCode).toBe(200);
      expect(below.json().data.trackedIrrelevantConcerns).toHaveLength(49);
      for (let i = 0; i < 199; i++)
        run(
          'insert into workout_sessions (id,user_id,name,date,status,started_at,duration) values (?,?,?,?,?,?,?)',
          `load-${i}`,
          'owner',
          `load-${i}`,
          '2026-09-19',
          'paused',
          Date.parse('2026-09-19T12:00:00Z'),
          60,
        );
      const tooMany = await read();
      expect(tooMany.statusCode).toBe(422);
      expect(tooMany.json().error.details).toEqual({ scope: 'workload_items', limit: 200 });
      run("delete from workout_sessions where id='load-0'");
      const atLoad = await read();
      expect(atLoad.statusCode).toBe(200);
      expect(atLoad.json().data.workload.items).toHaveLength(200);
      run("delete from workout_sessions where id='load-1'");
      const belowLoad = await read();
      expect(belowLoad.statusCode).toBe(200);
      expect(belowLoad.json().data.workload.items).toHaveLength(199);
    } finally {
      await app.close();
    }
  });

  it('bounds flares, Journal observations, and same-date co-occurrences independently', async () => {
    for (let i = 0; i < 21; i++) addFlare(`flare-${i}`);
    const { buildServer } = await import('../../index.js');
    const app = buildServer();
    await app.ready();
    try {
      const read = () =>
        app.inject({
          method: 'GET',
          url: '/api/v1/workout-sessions/upper/session-context',
          headers: auth,
        });
      const flareOverflow = await read();
      expect(flareOverflow.statusCode).toBe(422);
      expect(flareOverflow.json().error.details).toEqual({
        scope: 'recent_observations',
        limit: 20,
      });
      run("delete from body_context_flares where id='flare-20'");
      const atFlare = await read();
      expect(atFlare.statusCode).toBe(200);
      expect(atFlare.json().data.recentObservations).toHaveLength(20);
      for (let i = 0; i < 21; i++) addJournal(`journal-${i}`);
      const journalOverflow = await read();
      expect(journalOverflow.statusCode).toBe(422);
      expect(journalOverflow.json().error.details).toEqual({
        scope: 'journal_observations',
        limit: 20,
      });
      for (let i = 5; i < 21; i++)
        run('delete from journal_observations where id=?', `journal-${i}`);
      const atCoOccurrence = await read();
      expect(atCoOccurrence.statusCode).toBe(200);
      expect(atCoOccurrence.json().data.coOccurrences).toHaveLength(50);
      addJournal('journal-sixth');
      const coOverflow = await read();
      expect(coOverflow.statusCode).toBe(422);
      expect(coOverflow.json().error.details).toEqual({ scope: 'co_occurrences', limit: 50 });
    } finally {
      await app.close();
    }
  });

  it('bounds guided focus and current guidance at their separate limits', async () => {
    for (let i = 0; i < 10; i++) {
      run(
        'insert into body_context_capabilities (id,user_id,label,state,source_json,revision,current_revision_id,created_at,updated_at) values (?,?,?,?,?,?,?,?,?)',
        `focus-${i}`,
        'owner',
        `Focus ${i}`,
        'stable',
        JSON.stringify(source(`focus-${i}`)),
        1,
        `focus-${i}-r1`,
        '2026-09-01T12:00:00.000Z',
        '2026-09-18T12:00:00.000Z',
      );
      run(
        'insert into body_context_guidance (id,user_id,concern_id,capability_id,text,state,source_json,revision,current_revision_id,created_at,updated_at) values (?,?,?,?,?,?,?,?,?,?,?)',
        `focus-guide-${i}`,
        'owner',
        'shoulder',
        `focus-${i}`,
        `Recorded focus ${i}`,
        'current',
        JSON.stringify(source(`focus-guide-${i}`)),
        1,
        `focus-guide-${i}-r1`,
        '2026-09-01T12:00:00.000Z',
        '2026-09-01T12:00:00.000Z',
      );
    }
    const { buildServer } = await import('../../index.js');
    const app = buildServer();
    await app.ready();
    try {
      const read = () =>
        app.inject({
          method: 'GET',
          url: '/api/v1/workout-sessions/upper/session-context',
          headers: auth,
        });
      const focusOverflow = await read();
      expect(focusOverflow.statusCode).toBe(422);
      expect(focusOverflow.json().error.details).toEqual({ scope: 'positive_focus', limit: 10 });
      run("update body_context_capabilities set state='limited' where id='focus-0'");
      const atFocus = await read();
      expect(atFocus.statusCode).toBe(200);
      expect(atFocus.json().data.positiveFocus).toHaveLength(10);
      run("update body_context_capabilities set state='limited' where id='focus-1'");
      expect((await read()).json().data.positiveFocus).toHaveLength(9);
      for (let i = 0; i < 10; i++)
        run(
          'insert into body_context_guidance (id,user_id,concern_id,capability_id,text,state,source_json,revision,current_revision_id,created_at,updated_at) values (?,?,?,?,?,?,?,?,?,?,?)',
          `extra-guide-${i}`,
          'owner',
          'shoulder',
          null,
          `Extra guidance ${i}`,
          'current',
          JSON.stringify(source(`extra-guide-${i}`)),
          1,
          `extra-guide-${i}-r1`,
          '2026-09-01T12:00:00.000Z',
          '2026-09-01T12:00:00.000Z',
        );
      const guidanceOverflow = await read();
      expect(guidanceOverflow.statusCode).toBe(422);
      expect(guidanceOverflow.json().error.details).toEqual({
        scope: 'applicable_guidance',
        limit: 20,
      });
      run("update body_context_guidance set state='retired' where id='extra-guide-0'");
      const atGuidance = await read();
      expect(atGuidance.statusCode).toBe(200);
      expect(atGuidance.json().data.applicableGuidance).toHaveLength(20);
      run("update body_context_guidance set state='retired' where id='extra-guide-1'");
      expect((await read()).json().data.applicableGuidance).toHaveLength(19);
    } finally {
      await app.close();
    }
  });
});
