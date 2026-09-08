import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  agentTokens,
  exercises,
  scheduledWorkouts,
  users,
  workoutFeedbackQuestionLists,
  workoutSessions,
  workoutTemplates,
} from '../../db/schema/index.js';

type DatabaseModule = typeof import('../../db/index.js');
let app: FastifyInstance;
let database: DatabaseModule;
let temporaryDirectory: string;

const bearer = (token: string) => ({ authorization: `Bearer ${token}` });
const agent = (token: string) => ({ authorization: `AgentToken ${token}` });
const tibQuestion = {
  id: 'tib-bar-response',
  prompt: 'What did the left lower leg do during tib-bar raises?',
  type: 'multi_select' as const,
  optional: true,
  timing: 'post_session' as const,
  config: {
    options: ['No issue', 'Pain', 'Tightness', 'Could not test'],
    exclusiveOption: 'No issue',
  },
  exerciseIdSnapshot: 'tib-raise-a',
  exerciseNameSnapshot: 'Tibialis Raise',
  bodyRegion: 'lower leg',
  laterality: 'left' as const,
  concernRef: 'synthetic-tib-concern',
  contextLabel: 'Fictional acceptance case',
};

describe('workout feedback authenticated routes', () => {
  beforeAll(async () => {
    temporaryDirectory = mkdtempSync(join(tmpdir(), 'pulse-feedback-routes-'));
    process.env.JWT_SECRET = 'synthetic-feedback-route-secret';
    process.env.DATABASE_URL = join(temporaryDirectory, 'test.db');
    vi.resetModules();
    database = await import('../../db/index.js');
    const server = await import('../../index.js');
    migrate(database.db, {
      migrationsFolder: fileURLToPath(new URL('../../../drizzle', import.meta.url)),
    });
    app = server.buildServer();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    database.sqlite.close();
    rmSync(temporaryDirectory, { recursive: true, force: true });
    delete process.env.JWT_SECRET;
    delete process.env.DATABASE_URL;
    vi.resetModules();
  });

  beforeEach(() => {
    database.db.delete(agentTokens).run();
    database.db.delete(scheduledWorkouts).run();
    database.db.delete(workoutSessions).run();
    database.db.delete(workoutTemplates).run();
    database.db.delete(exercises).run();
    database.db.delete(users).run();
    database.db
      .insert(users)
      .values([
        { id: 'owner-a', username: 'fictional-a', name: 'Owner A', passwordHash: 'hash' },
        { id: 'owner-b', username: 'fictional-b', name: 'Owner B', passwordHash: 'hash' },
      ])
      .run();
    database.db
      .insert(agentTokens)
      .values([
        {
          id: 'agent-a',
          userId: 'owner-a',
          name: 'Synthetic Coach A',
          tokenHash: createHash('sha256').update('token-a').digest('hex'),
        },
        {
          id: 'agent-b',
          userId: 'owner-b',
          name: 'Synthetic Coach B',
          tokenHash: createHash('sha256').update('token-b').digest('hex'),
        },
      ])
      .run();
    database.db
      .insert(exercises)
      .values([
        {
          id: 'tib-raise-a',
          userId: 'owner-a',
          name: 'Tibialis Raise',
          trackingType: 'weight_reps',
          muscleGroups: ['tibialis'],
          equipment: 'other',
          category: 'isolation',
          formCues: [],
          coachingNotes: null,
          instructions: null,
        },
        {
          id: 'private-b',
          userId: 'owner-b',
          name: 'Private B',
          trackingType: 'weight_reps',
          muscleGroups: ['other'],
          equipment: 'other',
          category: 'isolation',
          formCues: [],
          coachingNotes: null,
          instructions: null,
        },
      ])
      .run();
  });

  it('authors template definitions with AgentToken provenance and rejects foreign/stale writes atomically', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/workout-templates',
      headers: agent('token-a'),
      payload: { name: 'Synthetic tib template', sections: [], feedbackQuestions: [tibQuestion] },
    });
    expect(created.statusCode).toBe(201);
    const template = created.json().data;
    expect(template.feedbackQuestions).toMatchObject({
      revision: 1,
      source: 'template_defaults',
      questions: [
        {
          id: 'tib-bar-response',
          version: 1,
          sourceKind: 'agent_token',
          sourceActorId: 'agent-a',
          sourceActorName: 'Synthetic Coach A',
        },
      ],
    });

    const omitted = await app.inject({
      method: 'PATCH',
      url: `/api/v1/workout-templates/${template.id}`,
      headers: agent('token-a'),
      payload: { description: 'Questions omitted and therefore preserved.' },
    });
    expect(omitted.statusCode).toBe(200);
    expect(omitted.json().data.feedbackQuestions).toEqual(template.feedbackQuestions);

    const cleared = await app.inject({
      method: 'PATCH',
      url: `/api/v1/workout-templates/${template.id}`,
      headers: agent('token-a'),
      payload: { feedbackQuestions: [], feedbackQuestionsExpectedRevision: 1 },
    });
    expect(cleared.statusCode).toBe(200);
    expect(cleared.json().data.feedbackQuestions).toMatchObject({ revision: 2, questions: [] });

    const stale = await app.inject({
      method: 'PATCH',
      url: `/api/v1/workout-templates/${template.id}`,
      headers: agent('token-a'),
      payload: { feedbackQuestions: [tibQuestion], feedbackQuestionsExpectedRevision: 1 },
    });
    expect(stale.statusCode).toBe(409);
    expect(stale.json()).toMatchObject({
      error: { code: 'WORKOUT_FEEDBACK_REVISION_CONFLICT', details: { currentRevision: 2 } },
    });
    expect(
      (
        await app.inject({
          method: 'GET',
          url: `/api/v1/workout-templates/${template.id}`,
          headers: agent('token-a'),
        })
      ).json().data.feedbackQuestions,
    ).toMatchObject({ revision: 2, questions: [] });

    const foreign = await app.inject({
      method: 'POST',
      url: '/api/v1/workout-templates',
      headers: agent('token-a'),
      payload: {
        name: 'Invalid foreign reference',
        sections: [],
        feedbackQuestions: [{ ...tibQuestion, exerciseIdSnapshot: 'private-b' }],
      },
    });
    expect(foreign.statusCode).toBe(400);
    expect(foreign.json()).toMatchObject({ error: { code: 'INVALID_TEMPLATE_EXERCISE' } });
  });

  it('closes the scheduled override through draft, pause/reload, completion, and immutable correction', async () => {
    const jwtA = app.jwt.sign(
      { sub: 'owner-a', type: 'session', iss: 'pulse-api' },
      { expiresIn: '7d' },
    );
    const templateResponse = await app.inject({
      method: 'POST',
      url: '/api/v1/workout-templates',
      headers: agent('token-a'),
      payload: {
        name: 'Synthetic scheduled tib template',
        sections: [],
        feedbackQuestions: [
          {
            id: 'morning-check',
            prompt: 'How did this feel the next morning?',
            type: 'text',
            optional: true,
            timing: 'next_check_in',
            config: {},
          },
        ],
      },
    });
    const template = templateResponse.json().data;
    const scheduledResponse = await app.inject({
      method: 'POST',
      url: '/api/v1/scheduled-workouts',
      headers: bearer(jwtA),
      payload: { templateId: template.id, date: '2026-09-08' },
    });
    expect(scheduledResponse.statusCode).toBe(201);
    const scheduled = scheduledResponse.json().data;
    expect(scheduled.feedbackQuestions).toMatchObject({ revision: 1, source: 'template_snapshot' });

    const override = await app.inject({
      method: 'PATCH',
      url: `/api/v1/scheduled-workouts/${scheduled.id}`,
      headers: agent('token-a'),
      payload: { feedbackQuestions: [tibQuestion], feedbackQuestionsExpectedRevision: 1 },
    });
    expect(override.statusCode).toBe(200);
    expect(override.json().data.feedbackQuestions).toMatchObject({
      revision: 2,
      source: 'scheduled_override',
      questions: [{ id: 'tib-bar-response', sourceActorId: 'agent-a' }],
    });

    const started = await app.inject({
      method: 'POST',
      url: '/api/v1/workout-sessions',
      headers: bearer(jwtA),
      payload: {
        scheduledWorkoutId: scheduled.id,
        date: '2026-09-08',
        status: 'in-progress',
        startedAt: 1_788_876_000_000,
      },
    });
    expect(started.statusCode).toBe(201);
    const session = started.json().data;
    expect(session.feedbackQuestions).toMatchObject({ source: 'scheduled_override' });
    expect(session.feedbackQuestions.questions.map(({ id }: { id: string }) => id)).toEqual([
      'session-rpe',
      'pain-discomfort',
      'session-context',
      'tib-bar-response',
    ]);
    const custom = session.feedbackQuestions.questions[3];

    const retry = await app.inject({
      method: 'POST',
      url: '/api/v1/workout-sessions',
      headers: bearer(jwtA),
      payload: {
        scheduledWorkoutId: scheduled.id,
        date: '2026-09-08',
        status: 'in-progress',
        startedAt: 1_788_876_000_000,
      },
    });
    expect(retry.statusCode).toBe(409);
    expect(
      database.db
        .select()
        .from(workoutFeedbackQuestionLists)
        .all()
        .filter(({ scopeKind, scopeId }) => scopeKind === 'session' && scopeId === session.id),
    ).toHaveLength(1);

    const responses = [
      { questionId: 'session-rpe', definitionVersion: 1, state: 'skipped' },
      { questionId: 'pain-discomfort', definitionVersion: 1, state: 'answered', value: false },
      { questionId: 'session-context', definitionVersion: 1, state: 'unanswered' },
      { questionId: 'tib-bar-response', definitionVersion: custom.version, state: 'unknown' },
    ];
    const draft = await app.inject({
      method: 'PATCH',
      url: `/api/v1/workout-sessions/${session.id}`,
      headers: bearer(jwtA),
      payload: { feedbackResponses: responses, feedbackExpectedRevision: 0 },
    });
    expect(draft.statusCode).toBe(200);
    expect(draft.json().data.feedbackAnswers).toMatchObject({
      revision: 1,
      current: expect.arrayContaining([
        expect.objectContaining({
          questionId: 'pain-discomfort',
          value: false,
          respondentSource: 'user',
          respondentActorId: 'owner-a',
        }),
      ]),
    });

    for (const status of ['paused', 'in-progress'] as const) {
      const transition = await app.inject({
        method: 'PATCH',
        url: `/api/v1/workout-sessions/${session.id}`,
        headers: bearer(jwtA),
        payload: { status, ...(status === 'in-progress' ? { activeSection: 'main' } : {}) },
      });
      expect(transition.statusCode, transition.body).toBe(200);
      expect(transition.json().data.feedbackAnswers.revision).toBe(1);
    }

    const completed = await app.inject({
      method: 'PATCH',
      url: `/api/v1/workout-sessions/${session.id}`,
      headers: bearer(jwtA),
      payload: { status: 'completed', completedAt: 1_788_876_600_000, duration: 10 },
    });
    expect(completed.statusCode).toBe(200);
    const corrected = await app.inject({
      method: 'PATCH',
      url: `/api/v1/workout-sessions/${session.id}/corrections`,
      headers: agent('token-a'),
      payload: {
        feedbackExpectedRevision: 1,
        feedbackResponses: [
          {
            questionId: 'tib-bar-response',
            definitionVersion: custom.version,
            state: 'answered',
            value: ['Pain', 'Tightness'],
            notes: 'Synthetic only',
          },
        ],
      },
    });
    expect(corrected.statusCode).toBe(200);
    expect(corrected.json().data.feedbackAnswers).toMatchObject({
      revision: 2,
      history: expect.arrayContaining([
        expect.objectContaining({ questionId: 'tib-bar-response', revision: 1, state: 'unknown' }),
        expect.objectContaining({
          questionId: 'tib-bar-response',
          revision: 2,
          priorRevisionId: expect.any(String),
          value: ['Pain', 'Tightness'],
          respondentSource: 'agent_token',
          respondentActorId: 'agent-a',
          exerciseNameSnapshot: 'Tibialis Raise',
          laterality: 'left',
        }),
      ]),
    });

    const foreignJwt = app.jwt.sign(
      { sub: 'owner-b', type: 'session', iss: 'pulse-api' },
      { expiresIn: '7d' },
    );
    const foreignRead = await app.inject({
      method: 'GET',
      url: `/api/v1/workout-sessions/${session.id}`,
      headers: bearer(foreignJwt),
    });
    const foreignCorrection = await app.inject({
      method: 'PATCH',
      url: `/api/v1/workout-sessions/${session.id}/corrections`,
      headers: agent('token-b'),
      payload: {
        feedbackExpectedRevision: 2,
        feedbackResponses: [
          {
            questionId: 'tib-bar-response',
            definitionVersion: custom.version,
            state: 'answered',
            value: ['No issue'],
          },
        ],
      },
    });
    expect(foreignRead.statusCode).toBe(404);
    expect(foreignCorrection.statusCode).toBe(404);
  });

  it('freezes direct-template and ad-hoc definitions while enforcing ad-hoc exercise ownership', async () => {
    const templateResponse = await app.inject({
      method: 'POST',
      url: '/api/v1/workout-templates',
      headers: agent('token-a'),
      payload: {
        name: 'Direct template',
        sections: [],
        feedbackQuestions: [
          {
            id: 'next-check',
            prompt: 'How did this feel later?',
            type: 'text',
            optional: true,
            timing: 'next_check_in',
            config: {},
          },
        ],
      },
    });
    const template = templateResponse.json().data;
    const direct = await app.inject({
      method: 'POST',
      url: '/api/v1/workout-sessions',
      headers: agent('token-a'),
      payload: {
        templateId: template.id,
        name: template.name,
        date: '2026-09-09',
        status: 'in-progress',
        startedAt: 1_788_962_400_000,
        sets: [],
      },
    });
    expect(direct.statusCode).toBe(201);
    expect(direct.json().data.feedbackQuestions.questions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'next-check', timing: 'next_check_in', version: 1 }),
      ]),
    );
    expect(direct.json().data.feedbackAnswers).toMatchObject({
      revision: 0,
      current: [],
      history: [],
    });

    const adHocQuestion = { ...tibQuestion, id: 'ad-hoc-tib' };
    const adHoc = await app.inject({
      method: 'POST',
      url: '/api/v1/workout-sessions',
      headers: agent('token-a'),
      payload: {
        name: 'Ad hoc tib session',
        date: '2026-09-10',
        status: 'in-progress',
        startedAt: 1_789_048_800_000,
        sets: [],
        feedbackQuestions: [adHocQuestion],
      },
    });
    expect(adHoc.statusCode).toBe(201);
    expect(adHoc.json().data.feedbackQuestions).toMatchObject({
      source: 'ad_hoc',
      questions: expect.arrayContaining([
        expect.objectContaining({
          id: 'ad-hoc-tib',
          sourceKind: 'agent_token',
          sourceActorId: 'agent-a',
        }),
      ]),
    });

    const foreign = await app.inject({
      method: 'POST',
      url: '/api/v1/workout-sessions',
      headers: agent('token-a'),
      payload: {
        name: 'Invalid ad hoc session',
        date: '2026-09-10',
        status: 'in-progress',
        startedAt: 1_789_048_800_000,
        sets: [],
        feedbackQuestions: [{ ...adHocQuestion, exerciseIdSnapshot: 'private-b' }],
      },
    });
    expect(foreign.statusCode).toBe(400);
    expect(foreign.json()).toMatchObject({ error: { code: 'INVALID_FEEDBACK_QUESTION_EXERCISE' } });
  });

  it('publishes concrete question, optimistic revision, answer, and conflict contracts in OpenAPI', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/docs/json' });
    expect(response.statusCode).toBe(200);
    const document = response.json();
    const serialized = JSON.stringify({
      templates: document.paths['/api/v1/workout-templates/{id}'],
      scheduled: document.paths['/api/v1/scheduled-workouts/{id}'],
      sessions: document.paths['/api/v1/workout-sessions/{id}'],
      corrections: document.paths['/api/v1/workout-sessions/{sessionId}/corrections'],
    });
    expect(serialized).toContain('feedbackQuestions');
    expect(serialized).toContain('feedbackQuestionsExpectedRevision');
    expect(serialized).toContain('feedbackResponses');
    expect(serialized).toContain('feedbackExpectedRevision');
    expect(serialized).toContain('WORKOUT_FEEDBACK_REVISION_CONFLICT');
    expect(serialized).toContain('multi_select');
    expect(serialized).toContain('next_check_in');
    expect(serialized).toContain('maxItems');
  });
});
