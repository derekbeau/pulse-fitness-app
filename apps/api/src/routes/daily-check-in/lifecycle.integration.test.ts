import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const migrationsFolder = fileURLToPath(new URL('../../../drizzle', import.meta.url));
const originalUrl = process.env.DATABASE_URL;
const originalNow = process.env.PULSE_TEST_NOW;
let directory = '';
let database: typeof import('../../db/index.js');
const actor = { kind: 'agent_token', id: 'agent-a', label: 'a' };
const inputSource = {
  class: 'user_observation',
  sourceId: 'fictional-lifecycle-source',
  sourceLabel: 'Fictional lifecycle source',
  sourceOccurredAt: '2026-09-20T12:00:00.000Z',
  uncertainty: 'known',
  freshness: { state: 'current', asOf: '2026-09-20T12:00:00.000Z', reasons: [] },
};
const storedSource = {
  ...inputSource,
  capturedAt: '2026-09-20T12:01:00.000Z',
  capturedBy: actor,
};

describe('daily check-in lifecycle and date projections', () => {
  beforeEach(async () => {
    directory = mkdtempSync(join(tmpdir(), 'pulse-daily-lifecycle-'));
    process.env.DATABASE_URL = join(directory, 'test.db');
    process.env.JWT_SECRET = 'fictional-lifecycle-secret';
    process.env.PULSE_TEST_NOW = '2026-09-20T16:00:00.000Z';
    vi.resetModules();
    database = await import('../../db/index.js');
    migrate(database.db, { migrationsFolder });
    database.sqlite.exec(`
      insert into users (id,username,password_hash,preferences) values
        ('owner','owner','x','{"timeZone":"America/Detroit"}'),
        ('foreign','foreign','x','{"timeZone":"America/Detroit"}');
    `);
    database.sqlite
      .prepare('insert into agent_tokens (id,user_id,name,token_hash) values (?,?,?,?),(?,?,?,?)')
      .run(
        'agent-a',
        'owner',
        'a',
        createHash('sha256').update('a-secret').digest('hex'),
        'agent-b',
        'owner',
        'b',
        createHash('sha256').update('b-secret').digest('hex'),
      );
    database.sqlite
      .prepare(
        "insert into body_context_concerns (id,user_id,label,body_region,symptom_state,management_state,source_json,revision,current_revision_id,created_at,updated_at) values ('concern','owner','Fictional shoulder','shoulder','unknown','monitoring',?,1,'concern-r1','2026-09-20T12:00:00.000Z','2026-09-20T12:00:00.000Z')",
      )
      .run(JSON.stringify(storedSource));
  });

  afterEach(() => {
    database.sqlite.close();
    process.env.DATABASE_URL = originalUrl;
    process.env.PULSE_TEST_NOW = originalNow;
    delete process.env.JWT_SECRET;
    rmSync(directory, { recursive: true, force: true });
    vi.resetModules();
  });

  it('persists follow-up, unknown, skipped, and correction audit state across a true reopen', async () => {
    let { buildServer } = await import('../../index.js');
    let app = buildServer();
    await app.ready();
    const reference = { kind: 'body_concern', id: 'concern', revisionId: 'concern-r1' };
    const create = (payload: Record<string, unknown>, token = 'a-secret') =>
      app.inject({
        method: 'POST',
        url: '/api/v1/check-in/questions',
        headers: { authorization: `AgentToken ${token}` },
        payload,
      });
    const parentPayload = {
      localDate: '2026-09-20',
      semanticTopic: 'shoulder status',
      prompt: 'What is known about the fictional shoulder status?',
      sourceReferences: [reference],
      followUpQuestionId: null,
      idempotencyKey: 'lifecycle-parent-question',
    };
    const parent = await create(parentPayload);
    expect(parent.statusCode).toBe(201);
    const parentId = parent.json().data.question.questionId as string;
    const earlyFollowUpPayload = {
      ...parentPayload,
      semanticTopic: 'shoulder detail',
      prompt: 'What fictional detail is available?',
      followUpQuestionId: parentId,
      idempotencyKey: 'lifecycle-followup-too-early',
    };
    const earlyFollowUp = await create(earlyFollowUpPayload);
    expect(earlyFollowUp.statusCode).toBe(409);
    expect(earlyFollowUp.json().error.code).toBe('FOLLOW_UP_PARENT_NOT_ANSWERED');

    const parentAnswer = await app.inject({
      method: 'POST',
      url: `/api/v1/check-in/questions/${parentId}/answers`,
      headers: { authorization: 'AgentToken a-secret' },
      payload: {
        expectedQuestionRevisionId: parent.json().data.question.id,
        expectedAnswerRevision: 0,
        state: 'unknown',
        source: inputSource,
        idempotencyKey: 'lifecycle-parent-unknown',
      },
    });
    expect(parentAnswer.statusCode).toBe(201);
    expect(parentAnswer.json().data.currentAnswer).toMatchObject({ state: 'unknown' });
    expect(parentAnswer.json().data.currentAnswer).not.toHaveProperty('value');

    const followUpPayload = {
      ...earlyFollowUpPayload,
      idempotencyKey: 'lifecycle-followup-a',
    };
    const followUp = await create(followUpPayload);
    expect(followUp.statusCode).toBe(201);
    const duplicateFollowUp = await create(
      {
        ...followUpPayload,
        prompt: 'Is any fictional detail available?',
        idempotencyKey: 'lifecycle-followup-b',
      },
      'b-secret',
    );
    expect(duplicateFollowUp.statusCode).toBe(201);
    expect(duplicateFollowUp.json().data.question.questionId).toBe(
      followUp.json().data.question.questionId,
    );
    const followUpId = followUp.json().data.question.questionId as string;
    const skipped = await app.inject({
      method: 'POST',
      url: `/api/v1/check-in/questions/${followUpId}/answers`,
      headers: { authorization: 'AgentToken b-secret' },
      payload: {
        expectedQuestionRevisionId: followUp.json().data.question.id,
        expectedAnswerRevision: 0,
        state: 'skipped',
        source: inputSource,
        idempotencyKey: 'lifecycle-followup-skipped',
      },
    });
    expect(skipped.statusCode).toBe(201);
    expect(skipped.json().data.currentAnswer).toMatchObject({ state: 'skipped' });
    expect(skipped.json().data.currentAnswer).not.toHaveProperty('value');

    database.sqlite
      .prepare(
        "update body_context_concerns set revision=2,current_revision_id='concern-r2',updated_at='2026-09-20T13:00:00.000Z' where id='concern'",
      )
      .run();
    const staleFollowUp = await create({
      ...followUpPayload,
      idempotencyKey: 'lifecycle-followup-stale',
    });
    expect(staleFollowUp.statusCode).toBe(404);
    expect(staleFollowUp.json().error.code).toBe('OWNED_LINK_NOT_FOUND');
    const changedFollowUp = await create({
      ...followUpPayload,
      sourceReferences: [{ ...reference, revisionId: 'concern-r2' }],
      idempotencyKey: 'lifecycle-followup-changed-source',
    });
    expect(changedFollowUp.statusCode).toBe(201);
    const changedFollowUpId = changedFollowUp.json().data.question.questionId as string;
    expect(changedFollowUpId).not.toBe(followUpId);
    const answered = await app.inject({
      method: 'POST',
      url: `/api/v1/check-in/questions/${changedFollowUpId}/answers`,
      headers: { authorization: 'AgentToken a-secret' },
      payload: {
        expectedQuestionRevisionId: changedFollowUp.json().data.question.id,
        expectedAnswerRevision: 0,
        state: 'answered',
        value: 'Fictional first answer.',
        source: inputSource,
        idempotencyKey: 'lifecycle-changed-answer',
      },
    });
    expect(answered.statusCode).toBe(201);
    const corrected = await app.inject({
      method: 'POST',
      url: `/api/v1/check-in/answers/${answered.json().data.currentAnswer.answerId}/corrections`,
      headers: { authorization: 'AgentToken b-secret' },
      payload: {
        expectedQuestionRevisionId: answered.json().data.question.id,
        expectedAnswerRevision: 1,
        state: 'answered',
        value: 'Fictional corrected answer.',
        reason: 'Fictional clarification after the first answer.',
        source: inputSource,
        idempotencyKey: 'lifecycle-changed-correction',
      },
    });
    expect(corrected.statusCode).toBe(200);

    await app.close();
    database.sqlite.close();
    vi.resetModules();
    database = await import('../../db/index.js');
    ({ buildServer } = await import('../../index.js'));
    app = buildServer();
    await app.ready();
    const read = async (id: string) => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/check-in/questions/${id}`,
        headers: { authorization: 'AgentToken a-secret' },
      });
      expect(response.statusCode, response.body).toBe(200);
      return response.json().data;
    };
    expect(await read(parentId)).toMatchObject({
      currentAnswer: { state: 'unknown', recordedBy: { id: 'agent-a' } },
      answerHistory: [{ state: 'unknown' }],
    });
    expect(await read(followUpId)).toMatchObject({
      followUpQuestionId: parentId,
      currentAnswer: { state: 'skipped', recordedBy: { id: 'agent-b' } },
      answerHistory: [{ state: 'skipped' }],
    });
    const reopenedCorrection = await read(changedFollowUpId);
    expect(reopenedCorrection.questionHistory).toHaveLength(2);
    expect(reopenedCorrection.answerHistory).toMatchObject([
      {
        revision: 1,
        correctionReason: null,
        priorRevisionId: null,
        recordedBy: { id: 'agent-a' },
        source: { sourceId: 'fictional-lifecycle-source' },
      },
      {
        revision: 2,
        correctionReason: 'Fictional clarification after the first answer.',
        recordedBy: { id: 'agent-b' },
        source: { sourceId: 'fictional-lifecycle-source' },
      },
    ]);
    expect(reopenedCorrection.answerHistory[1].priorRevisionId).toBe(
      reopenedCorrection.answerHistory[0].id,
    );
    await app.close();
  });

  it('preserves root creation time while exposing immutable transition times after restart', async () => {
    let { buildServer } = await import('../../index.js');
    let app = buildServer();
    await app.ready();
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/check-in/questions',
      headers: { authorization: 'AgentToken a-secret' },
      payload: {
        localDate: '2026-09-20',
        semanticTopic: 'question audit timing',
        prompt: 'What fictional timing detail is available?',
        sourceReferences: [{ kind: 'body_concern', id: 'concern', revisionId: 'concern-r1' }],
        followUpQuestionId: null,
        idempotencyKey: 'audit-time-question',
      },
    });
    expect(created.statusCode, created.body).toBe(201);
    const questionId = created.json().data.question.questionId as string;
    expect(created.json().data).toMatchObject({
      question: { createdAt: '2026-09-20T16:00:00.000Z' },
      questionHistory: [
        {
          revision: { revision: 1, createdAt: '2026-09-20T16:00:00.000Z' },
          recordedAt: '2026-09-20T16:00:00.000Z',
        },
      ],
    });

    process.env.PULSE_TEST_NOW = '2026-09-20T17:00:00.000Z';
    const answered = await app.inject({
      method: 'POST',
      url: `/api/v1/check-in/questions/${questionId}/answers`,
      headers: { authorization: 'AgentToken a-secret' },
      payload: {
        expectedQuestionRevisionId: created.json().data.question.id,
        expectedAnswerRevision: 0,
        state: 'answered',
        value: 'Fictional answer at the second clock instant.',
        source: inputSource,
        idempotencyKey: 'audit-time-answer',
      },
    });
    expect(answered.statusCode, answered.body).toBe(201);
    const answerId = answered.json().data.currentAnswer.answerId as string;

    process.env.PULSE_TEST_NOW = '2026-09-20T18:00:00.000Z';
    const corrected = await app.inject({
      method: 'POST',
      url: `/api/v1/check-in/answers/${answerId}/corrections`,
      headers: { authorization: 'AgentToken b-secret' },
      payload: {
        expectedQuestionRevisionId: answered.json().data.question.id,
        expectedAnswerRevision: 1,
        state: 'answered',
        value: 'Fictional corrected answer at the third clock instant.',
        reason: 'Fictional timing clarification.',
        source: inputSource,
        idempotencyKey: 'audit-time-correction',
      },
    });
    expect(corrected.statusCode, corrected.body).toBe(200);
    expect(corrected.json().data).toMatchObject({
      question: { createdAt: '2026-09-20T16:00:00.000Z' },
      questionHistory: [
        {
          revision: { revision: 1, createdAt: '2026-09-20T16:00:00.000Z' },
          recordedAt: '2026-09-20T16:00:00.000Z',
        },
        {
          revision: { revision: 2, createdAt: '2026-09-20T16:00:00.000Z' },
          recordedAt: '2026-09-20T17:00:00.000Z',
        },
      ],
      answerHistory: [
        { revision: 1, answeredAt: '2026-09-20T17:00:00.000Z' },
        { revision: 2, answeredAt: '2026-09-20T18:00:00.000Z' },
      ],
    });

    await app.close();
    database.sqlite.close();
    vi.resetModules();
    database = await import('../../db/index.js');
    ({ buildServer } = await import('../../index.js'));
    app = buildServer();
    await app.ready();
    const reopened = await app.inject({
      method: 'GET',
      url: `/api/v1/check-in/questions/${questionId}`,
      headers: { authorization: 'AgentToken a-secret' },
    });
    expect(reopened.statusCode, reopened.body).toBe(200);
    expect(reopened.json().data).toEqual(corrected.json().data);
    await app.close();
  });

  it('projects consumed, active, completed, paused, deleted, and cross-date workouts factually with DST observations', async () => {
    database.sqlite.exec(`
      insert into scheduled_workouts (id,user_id,template_id,template_version,date,session_id,created_at,updated_at) values
        ('plan','owner',null,'v1','2026-03-08',null,1000,1000),
        ('consumed','owner',null,'v1','2026-03-08',null,1000,1000),
        ('active-plan','owner',null,'v1','2026-03-08',null,1000,1000),
        ('deleted-plan','owner',null,'v1','2026-03-08',null,1000,1000),
        ('foreign-plan','foreign',null,'v1','2026-03-08',null,1000,1000);
      insert into workout_sessions (id,user_id,template_id,scheduled_workout_id,name,date,status,started_at,completed_at,duration,time_segments,deleted_at,created_at,updated_at) values
        ('completed-session','owner',null,'consumed','Completed after planned day','2026-03-09','completed',1000,2000,60,'[]',null,1000,2000),
        ('active-session','owner',null,'active-plan','Active workout','2026-03-08','in-progress',1000,null,null,'[]',null,1000,1000),
        ('paused-session','owner',null,null,'Paused workout','2026-03-08','paused',1000,null,null,'[]',null,1000,1000),
        ('deleted-session','owner',null,'deleted-plan','Deleted workout','2026-03-08','in-progress',1000,null,null,'[]','2026-03-08T12:00:00.000Z',1000,1000),
        ('foreign-session','foreign',null,'foreign-plan','Foreign workout','2026-03-08','in-progress',1000,null,null,'[]',null,1000,1000);
      update scheduled_workouts set session_id='completed-session' where id='consumed';
      update scheduled_workouts set session_id='active-session' where id='active-plan';
      update scheduled_workouts set session_id='deleted-session' where id='deleted-plan';
      update scheduled_workouts set session_id='foreign-session' where id='foreign-plan';
    `);
    const insertFlare = database.sqlite.prepare(
      'insert into body_context_flares (id,concern_id,user_id,occurred_at,local_date,time_zone,observation,source_json,created_at) values (?,?,?,?,?,?,?,?,?)',
    );
    for (const [id, occurredAt, localDate] of [
      ['spring-before', '2026-03-08T04:59:59.000Z', '2026-03-07'],
      ['spring-day', '2026-03-08T05:00:00.000Z', '2026-03-08'],
      ['fall-before', '2026-11-01T03:59:59.000Z', '2026-10-31'],
      ['fall-first-hour', '2026-11-01T05:30:00.000Z', '2026-11-01'],
      ['fall-second-hour', '2026-11-01T06:30:00.000Z', '2026-11-01'],
    ])
      insertFlare.run(
        id,
        'concern',
        'owner',
        occurredAt,
        localDate,
        'America/Detroit',
        `Fictional observation ${id}`,
        JSON.stringify(storedSource),
        occurredAt,
      );

    const { buildServer } = await import('../../index.js');
    const app = buildServer();
    await app.ready();
    const context = async (date: string) => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/daily-context?date=${date}`,
        headers: { authorization: 'AgentToken a-secret' },
      });
      expect(response.statusCode).toBe(200);
      return response.json().data;
    };
    const spring = await context('2026-03-08');
    expect(spring.workouts).toMatchObject([
      {
        id: 'plan',
        kind: 'planned',
        plannedLocalDate: '2026-03-08',
        actualLocalDate: null,
        status: 'scheduled',
      },
      {
        id: 'active-session',
        kind: 'in_progress',
        plannedLocalDate: '2026-03-08',
        actualLocalDate: '2026-03-08',
        status: 'in-progress',
      },
      {
        id: 'completed-session',
        kind: 'completed',
        plannedLocalDate: '2026-03-08',
        actualLocalDate: '2026-03-09',
        status: 'completed',
      },
      {
        id: 'paused-session',
        kind: 'paused',
        plannedLocalDate: null,
        actualLocalDate: '2026-03-08',
        status: 'paused',
      },
    ]);
    expect(spring.workouts.map((workout: { id: string }) => workout.id)).not.toContain('consumed');
    expect(spring.workouts.map((workout: { id: string }) => workout.id)).not.toContain(
      'deleted-session',
    );
    expect(spring.workouts.map((workout: { id: string }) => workout.id)).not.toContain(
      'foreign-session',
    );
    expect(spring.workoutSessionIds).toEqual([
      'active-session',
      'completed-session',
      'paused-session',
    ]);
    expect(spring.observations.map((item: { id: string }) => item.id)).toEqual(['spring-day']);
    expect((await context('2026-03-07')).observations[0]).toMatchObject({
      id: 'spring-before',
      occurredAt: '2026-03-08T04:59:59.000Z',
      localDate: '2026-03-07',
      timeZone: 'America/Detroit',
    });
    expect((await context('2026-03-09')).workouts).toMatchObject([
      {
        id: 'completed-session',
        plannedLocalDate: '2026-03-08',
        actualLocalDate: '2026-03-09',
      },
    ]);
    expect(
      (await context('2026-10-31')).observations.map((item: { id: string }) => item.id),
    ).toEqual(['fall-before']);
    expect(
      (await context('2026-11-01')).observations.map((item: { id: string }) => item.id),
    ).toEqual(['fall-first-hour', 'fall-second-hour']);
    await app.close();
  });
});
