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
const source = {
  class: 'user_observation',
  sourceId: 'fictional-conversation-179',
  sourceLabel: 'Fictional conversation',
  sourceOccurredAt: '2026-09-20T00:15:00.000Z',
  uncertainty: 'known',
  freshness: { state: 'current', asOf: '2026-09-20T00:15:00.000Z', reasons: [] },
};

describe('daily check-in runtime API', () => {
  beforeEach(async () => {
    directory = mkdtempSync(join(tmpdir(), 'pulse-daily-check-in-'));
    process.env.DATABASE_URL = join(directory, 'test.db');
    process.env.JWT_SECRET = 'fictional-179-secret';
    process.env.PULSE_TEST_NOW = '2026-09-20T04:30:00.000Z';
    vi.resetModules();
    database = await import('../../db/index.js');
    migrate(database.db, { migrationsFolder });
    const { agentTokens, users } = await import('../../db/schema/index.js');
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
      .values([
        {
          id: 'agent-a',
          userId: 'owner',
          name: 'a',
          tokenHash: createHash('sha256').update('a-secret').digest('hex'),
        },
        {
          id: 'agent-b',
          userId: 'owner',
          name: 'b',
          tokenHash: createHash('sha256').update('b-secret').digest('hex'),
        },
        {
          id: 'agent-foreign',
          userId: 'foreign',
          name: 'foreign',
          tokenHash: createHash('sha256').update('foreign-secret').digest('hex'),
        },
      ])
      .run();
    database.sqlite
      .prepare(
        "insert into body_context_concerns (id,user_id,label,body_region,symptom_state,management_state,source_json,revision,current_revision_id,created_at,updated_at) values ('concern','owner','Fictional shoulder','shoulder','affirmed','active',?,1,'concern-revision','2026-09-20T00:00:00.000Z','2026-09-20T00:00:00.000Z')",
      )
      .run(
        JSON.stringify({
          ...source,
          capturedAt: '2026-09-20T00:00:00.000Z',
          capturedBy: { kind: 'agent_token', id: 'agent-a', label: 'a' },
        }),
      );
  });
  afterEach(() => {
    database.sqlite.close();
    process.env.DATABASE_URL = originalUrl;
    process.env.PULSE_TEST_NOW = originalNow;
    delete process.env.JWT_SECRET;
    rmSync(directory, { recursive: true, force: true });
    vi.resetModules();
  });
  it('deduplicates canonical questions across agents and preserves immutable answers', async () => {
    const { buildServer } = await import('../../index.js');
    const app = buildServer();
    await app.ready();
    const payload = {
      localDate: '2026-09-20',
      semanticTopic: 'shoulder status after activity',
      prompt: 'How is your shoulder after activity?',
      sourceReferences: [{ kind: 'body_concern', id: 'concern', revisionId: 'concern-revision' }],
      followUpQuestionId: null,
      idempotencyKey: 'question-agent-a-179',
    };
    const first = await app.inject({
      method: 'POST',
      url: '/api/v1/check-in/questions',
      headers: { authorization: 'AgentToken a-secret' },
      payload,
    });
    expect(first.statusCode).toBe(201);
    const id = first.json().data.question.questionId as string;
    const createReplay = await app.inject({
      method: 'POST',
      url: '/api/v1/check-in/questions',
      headers: { authorization: 'AgentToken a-secret' },
      payload,
    });
    expect(createReplay.statusCode).toBe(201);
    expect(createReplay.headers['idempotent-replay']).toBe('true');
    expect(createReplay.json()).toEqual(first.json());
    const createConflict = await app.inject({
      method: 'POST',
      url: '/api/v1/check-in/questions',
      headers: { authorization: 'AgentToken a-secret' },
      payload: { ...payload, prompt: 'Changed payload under the same key.' },
    });
    expect(createConflict.statusCode).toBe(409);
    expect(createConflict.json().error.code).toBe('IDEMPOTENCY_KEY_REUSE');
    const second = await app.inject({
      method: 'POST',
      url: '/api/v1/check-in/questions',
      headers: { authorization: 'AgentToken b-secret' },
      payload: {
        ...payload,
        prompt: 'Shoulder status after activity?',
        idempotencyKey: 'question-agent-b-179',
      },
    });
    expect(second.statusCode).toBe(201);
    expect(second.json().data.question.questionId).toBe(id);
    const staleQuestion = await app.inject({
      method: 'POST',
      url: `/api/v1/check-in/questions/${id}/answers`,
      headers: { authorization: 'AgentToken a-secret' },
      payload: {
        expectedQuestionRevisionId: '00000000-0000-4000-8000-000000000000',
        expectedAnswerRevision: 0,
        state: 'answered',
        value: 'Fictional answer that must not write.',
        source,
        idempotencyKey: 'stale-question-179',
      },
    });
    expect(staleQuestion.statusCode).toBe(409);
    expect(staleQuestion.json().error).toMatchObject({
      code: 'STALE_QUESTION_REVISION',
      details: {
        currentQuestionRevisionId: first.json().data.question.id,
        expectedQuestionRevisionId: '00000000-0000-4000-8000-000000000000',
      },
    });
    const answer = {
      expectedQuestionRevisionId: first.json().data.question.id,
      expectedAnswerRevision: 0,
      state: 'answered',
      value: 'Sore but manageable.',
      source,
      idempotencyKey: 'answer-a-179',
    };
    const answered = await app.inject({
      method: 'POST',
      url: `/api/v1/check-in/questions/${id}/answers`,
      headers: { authorization: 'AgentToken a-secret' },
      payload: answer,
    });
    expect(answered.statusCode).toBe(201);
    const answerId = answered.json().data.currentAnswer.answerId as string;
    expect(answered.json().data.question).toMatchObject({
      revision: 2,
      priorRevisionId: first.json().data.question.id,
      state: 'answered',
    });
    expect(answered.json().data.currentAnswer.questionRevisionId).toBe(
      answered.json().data.question.id,
    );
    const answerReplay = await app.inject({
      method: 'POST',
      url: `/api/v1/check-in/questions/${id}/answers`,
      headers: { authorization: 'AgentToken a-secret' },
      payload: answer,
    });
    expect(answerReplay.statusCode).toBe(201);
    expect(answerReplay.headers['idempotent-replay']).toBe('true');
    expect(answerReplay.json()).toEqual(answered.json());
    const answerConflict = await app.inject({
      method: 'POST',
      url: `/api/v1/check-in/questions/${id}/answers`,
      headers: { authorization: 'AgentToken a-secret' },
      payload: { ...answer, value: 'Changed payload under the same key.' },
    });
    expect(answerConflict.statusCode).toBe(409);
    expect(answerConflict.json().error.code).toBe('IDEMPOTENCY_KEY_REUSE');
    const stale = await app.inject({
      method: 'POST',
      url: `/api/v1/check-in/questions/${id}/answers`,
      headers: { authorization: 'AgentToken b-secret' },
      payload: { ...answer, idempotencyKey: 'stale-answer-b-179' },
    });
    expect(stale.statusCode).toBe(409);
    expect(stale.json().error.code).toBe('STALE_QUESTION_REVISION');
    const corrected = await app.inject({
      method: 'POST',
      url: `/api/v1/check-in/answers/${answerId}/corrections`,
      headers: { authorization: 'AgentToken b-secret' },
      payload: {
        ...answer,
        expectedQuestionRevisionId: answered.json().data.question.id,
        expectedAnswerRevision: 1,
        value: 'Sore during overhead reach.',
        reason: 'User clarified exact movement.',
        idempotencyKey: 'correct-b-179',
      },
    });
    expect(corrected.statusCode).toBe(200);
    expect(corrected.json().data.answerHistory).toHaveLength(2);
    expect(corrected.json().data).toMatchObject({
      questionHistory: [
        { revision: { revision: 1, state: 'pending' }, recordedBy: { id: 'agent-a' } },
        { revision: { revision: 2, state: 'answered' }, recordedBy: { id: 'agent-a' } },
      ],
      answerHistory: [
        { revision: 1, correctionReason: null, recordedBy: { id: 'agent-a' } },
        {
          revision: 2,
          correctionReason: 'User clarified exact movement.',
          recordedBy: { id: 'agent-b' },
        },
      ],
    });
    const correctionReplay = await app.inject({
      method: 'POST',
      url: `/api/v1/check-in/answers/${answerId}/corrections`,
      headers: { authorization: 'AgentToken b-secret' },
      payload: {
        ...answer,
        expectedQuestionRevisionId: answered.json().data.question.id,
        expectedAnswerRevision: 1,
        value: 'Sore during overhead reach.',
        reason: 'User clarified exact movement.',
        idempotencyKey: 'correct-b-179',
      },
    });
    expect(correctionReplay.statusCode).toBe(200);
    expect(correctionReplay.headers['idempotent-replay']).toBe('true');
    const correctionConflict = await app.inject({
      method: 'POST',
      url: `/api/v1/check-in/answers/${answerId}/corrections`,
      headers: { authorization: 'AgentToken b-secret' },
      payload: {
        ...answer,
        expectedQuestionRevisionId: answered.json().data.question.id,
        expectedAnswerRevision: 1,
        value: 'Different correction under reused key.',
        reason: 'Different reason.',
        idempotencyKey: 'correct-b-179',
      },
    });
    expect(correctionConflict.statusCode).toBe(409);
    expect(correctionConflict.json().error.code).toBe('IDEMPOTENCY_KEY_REUSE');
    const answeredCanonical = await app.inject({
      method: 'POST',
      url: '/api/v1/check-in/questions',
      headers: { authorization: 'AgentToken b-secret' },
      payload: {
        ...payload,
        prompt: 'Could you rephrase the fictional shoulder check?',
        idempotencyKey: 'answered-canonical-fresh-key',
      },
    });
    expect(answeredCanonical.statusCode).toBe(201);
    expect(answeredCanonical.json().data).toMatchObject({
      question: { questionId: id, state: 'answered' },
      currentAnswer: { revision: 2, value: 'Sore during overhead reach.' },
    });
    const distinctTopic = await app.inject({
      method: 'POST',
      url: '/api/v1/check-in/questions',
      headers: { authorization: 'AgentToken a-secret' },
      payload: {
        ...payload,
        semanticTopic: 'shoulder recovery confidence',
        prompt: 'How confident are you about the fictional recovery?',
        idempotencyKey: 'distinct-topic-fresh-key',
      },
    });
    expect(distinctTopic.statusCode).toBe(201);
    expect(distinctTopic.json().data.question.questionId).not.toBe(id);
    database.sqlite
      .prepare(
        "insert into canonical_activities (id,user_id,kind,name,structured_workout_session_id,source_json,actor_json,revision,current_revision_id,created_at,updated_at) values ('activity','owner','walking','Fictional walk',null,?,?,1,'activity-r1','2026-09-20T00:00:00.000Z','2026-09-20T00:00:00.000Z')",
      )
      .run(
        JSON.stringify({
          ...source,
          capturedAt: '2026-09-20T00:00:00.000Z',
          capturedBy: { kind: 'agent_token', id: 'agent-a', label: 'a' },
        }),
        JSON.stringify({ kind: 'agent_token', id: 'agent-a', label: 'a' }),
      );
    database.sqlite
      .prepare(
        "insert into activity_assignments (id,user_id,activity_id,recurrence_id,planned_local_date,time_zone,recurrence_revision_id,revision,current_revision_id,state,created_at,updated_at) values ('assignment','owner','activity',null,'2026-09-20','America/Detroit',null,1,'assignment-r1','planned','2026-09-20T00:00:00.000Z','2026-09-20T00:00:00.000Z')",
      )
      .run();
    database.sqlite
      .prepare(
        "insert into activity_assignment_revisions (id,assignment_id,user_id,revision,prior_revision_id,planned_local_date,time_zone,recurrence_revision_id,state,reason,actor_json,created_at) values ('assignment-r1','assignment','owner',1,null,'2026-09-20','America/Detroit',null,'planned',null,?,'2026-09-20T00:00:00.000Z')",
      )
      .run(JSON.stringify({ kind: 'agent_token', id: 'agent-a', label: 'a' }));
    database.sqlite
      .prepare(
        "insert into activity_executions (id,user_id,activity_id,assignment_id,actual_occurred_at,actual_local_date,time_zone,duration_minutes,outcome,structured_workout_session_id,source_json,revision,current_revision_id,created_at,updated_at) values ('execution','owner','activity','assignment','2026-09-20T08:00:00.000-04:00','2026-09-20','America/Detroit',30,'completed',null,?,1,'execution-r1','2026-09-20T12:00:00.000Z','2026-09-20T12:00:00.000Z')",
      )
      .run(
        JSON.stringify({
          ...source,
          capturedAt: '2026-09-20T12:00:00.000Z',
          capturedBy: { kind: 'agent_token', id: 'agent-a', label: 'a' },
        }),
      );
    database.sqlite
      .prepare(
        "insert into workout_sessions (id,user_id,template_id,scheduled_workout_id,name,date,status,started_at,completed_at,duration,time_segments,deleted_at,created_at,updated_at) values ('session','owner',null,null,'Fictional completed workout','2026-09-20','completed',1000,2000,60,'[]',null,1000,2000)",
      )
      .run();
    database.sqlite
      .prepare(
        "insert into scheduled_workouts (id,user_id,template_id,template_version,date,session_id,created_at,updated_at) values ('scheduled','owner',null,null,'2026-09-20',null,1000,1000)",
      )
      .run();
    database.sqlite
      .prepare(
        "insert into nutrition_logs (id,user_id,date,notes,status,created_at,updated_at) values ('nutrition','owner','2026-09-20',null,'partial',1000,1000)",
      )
      .run();
    database.sqlite
      .prepare(
        "insert into meals (id,nutrition_log_id,name,summary,time,notes,created_at,updated_at) values ('meal','nutrition','Fictional breakfast','Fictional food summary','08:00',null,1000,1000)",
      )
      .run();
    database.sqlite
      .prepare(
        "insert into meal_items (id,meal_id,food_id,name,amount,unit,calories,protein,carbs,fat,created_at) values ('item','meal',null,'Fictional oats',1,'serving',400,20,60,10,1000)",
      )
      .run();
    const context = await app.inject({
      method: 'GET',
      url: '/api/v1/daily-context?date=2026-09-20',
      headers: { authorization: 'AgentToken a-secret' },
    });
    expect(context.statusCode, context.body).toBe(200);
    expect(context.json().data).toMatchObject({
      localDate: '2026-09-20',
      pendingQuestions: [
        {
          questionId: distinctTopic.json().data.question.questionId,
          state: 'pending',
          prompt: 'How confident are you about the fictional recovery?',
        },
      ],
      currentAnswers: [{ answerId, revision: 2, value: 'Sore during overhead reach.' }],
      assignments: [{ id: 'assignment', plannedLocalDate: '2026-09-20' }],
      executions: [{ id: 'execution', outcome: 'completed' }],
      activities: [
        {
          id: 'activity',
          name: 'Fictional walk',
          kind: 'walking',
          currentRevisionId: 'activity-r1',
          assignmentIds: ['assignment'],
          executionIds: ['execution'],
          sourceReference: { revisionId: 'activity-r1' },
        },
      ],
      concerns: [{ id: 'concern', source: { sourceId: 'fictional-conversation-179' } }],
      nutrition: { status: 'partial', meals: [{ id: 'meal' }], totals: { calories: 400 } },
      workouts: [
        { id: 'scheduled', kind: 'planned', status: 'scheduled' },
        { id: 'session', kind: 'completed', status: 'completed' },
      ],
    });
    const empty = await app.inject({
      method: 'GET',
      url: '/api/v1/daily-context?date=2026-03-08',
      headers: { authorization: 'AgentToken a-secret' },
    });
    expect(empty.statusCode).toBe(200);
    expect(empty.json().data).toMatchObject({
      localDate: '2026-03-08',
      nutrition: null,
      assignments: [],
      executions: [],
      workouts: [],
    });
    const foreign = await app.inject({
      method: 'GET',
      url: `/api/v1/check-in/questions/${id}`,
      headers: { authorization: 'AgentToken foreign-secret' },
    });
    expect(foreign.statusCode).toBe(404);
    expect(foreign.json().error.code).toBe('CHECK_IN_NOT_FOUND');
    const jwt = app.jwt.sign(
      { sub: 'owner', type: 'session', iss: 'pulse-api' },
      { expiresIn: '1h' },
    );
    const rejected = await app.inject({
      method: 'POST',
      url: '/api/v1/check-in/questions',
      headers: { authorization: `Bearer ${jwt}` },
      payload: { ...payload, idempotencyKey: 'jwt-rejected-179' },
    });
    expect(rejected.statusCode).toBe(403);
    const openapi = (await app.inject({ method: 'GET', url: '/api/docs/json' })).json();
    expect(openapi.paths).toMatchObject({
      '/api/v1/daily-context': { get: expect.any(Object) },
      '/api/v1/check-in/questions': { post: expect.any(Object) },
      '/api/v1/check-in/questions/{id}': { get: expect.any(Object) },
      '/api/v1/check-in/questions/{id}/answers': { post: expect.any(Object) },
      '/api/v1/check-in/answers/{id}/corrections': { post: expect.any(Object) },
    });
    expect(
      openapi.paths['/api/v1/check-in/questions'].post.requestBody.content['application/json']
        .schema.additionalProperties,
    ).toBe(false);
    await app.close();
  });

  it('binds canonical question identity to the hydrated current source revision', async () => {
    const { buildServer } = await import('../../index.js');
    const app = buildServer();
    await app.ready();
    const base = {
      localDate: '2026-09-20',
      semanticTopic: 'shoulder status after activity',
      prompt: 'How is your shoulder after activity?',
      sourceReferences: [{ kind: 'body_concern', id: 'concern', revisionId: 'concern-revision' }],
      followUpQuestionId: null,
    };
    const first = await app.inject({
      method: 'POST',
      url: '/api/v1/check-in/questions',
      headers: { authorization: 'AgentToken a-secret' },
      payload: { ...base, idempotencyKey: 'source-r1-179' },
    });
    expect(first.statusCode).toBe(201);
    database.sqlite
      .prepare(
        "update body_context_concerns set revision=2,current_revision_id='concern-revision-2',updated_at=? where id='concern'",
      )
      .run('2026-09-20T01:00:00.000Z');
    const second = await app.inject({
      method: 'POST',
      url: '/api/v1/check-in/questions',
      headers: { authorization: 'AgentToken b-secret' },
      payload: {
        ...base,
        sourceReferences: [
          { kind: 'body_concern', id: 'concern', revisionId: 'concern-revision-2' },
        ],
        idempotencyKey: 'source-r2-179',
      },
    });
    expect(second.statusCode).toBe(201);
    expect(second.json().data.question.questionId).not.toBe(first.json().data.question.questionId);
    expect(second.json().data.question.sourceReferences).toMatchObject([
      { id: 'concern', revisionId: 'concern-revision-2' },
    ]);
    await app.close();
  });

  it('rejects #180 journal sources at validation and returns a 400 when the server has no user time zone', async () => {
    const { buildServer } = await import('../../index.js');
    const app = buildServer();
    await app.ready();
    const base = {
      localDate: '2026-09-20',
      semanticTopic: 'shoulder status after activity',
      prompt: 'How is your shoulder after activity?',
      followUpQuestionId: null,
    };
    const journal = await app.inject({
      method: 'POST',
      url: '/api/v1/check-in/questions',
      headers: { authorization: 'AgentToken a-secret' },
      payload: {
        ...base,
        sourceReferences: [
          { kind: 'journal_entry', id: 'reserved-for-180', revisionId: 'not-applicable' },
        ],
        idempotencyKey: 'journal-source-179',
      },
    });
    expect(journal.statusCode).toBe(400);
    const missingRevision = await app.inject({
      method: 'POST',
      url: '/api/v1/check-in/questions',
      headers: { authorization: 'AgentToken a-secret' },
      payload: {
        ...base,
        sourceReferences: [{ kind: 'body_concern', id: 'concern' }],
        idempotencyKey: 'missing-source-revision-179',
      },
    });
    expect(missingRevision.statusCode).toBe(400);
    const spoofedIdentity = await app.inject({
      method: 'POST',
      url: '/api/v1/check-in/questions',
      headers: { authorization: 'AgentToken a-secret' },
      payload: {
        ...base,
        subjectUserId: 'foreign',
        actor: { kind: 'agent_token', id: 'agent-foreign', label: 'foreign' },
        sourceReferences: [{ kind: 'body_concern', id: 'concern', revisionId: 'concern-revision' }],
        idempotencyKey: 'spoofed-identity-179',
      },
    });
    expect(spoofedIdentity.statusCode).toBe(400);
    database.sqlite.prepare("update users set preferences='{}' where id='owner'").run();
    const missingZone = await app.inject({
      method: 'POST',
      url: '/api/v1/check-in/questions',
      headers: { authorization: 'AgentToken a-secret' },
      payload: {
        ...base,
        sourceReferences: [{ kind: 'body_concern', id: 'concern', revisionId: 'concern-revision' }],
        idempotencyKey: 'no-zone-179',
      },
    });
    expect(missingZone.statusCode).toBe(400);
    expect(missingZone.json().error.code).toBe('TIME_ZONE_REQUIRED');
    await app.close();
  });
});
