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
  sourceId: 'fictional-conversation-180',
  sourceLabel: 'Fictional conversation',
  sourceOccurredAt: '2026-09-20T00:15:00.000Z',
  uncertainty: 'unknown',
  freshness: { state: 'current', asOf: '2026-09-20T00:15:00.000Z', reasons: [] },
};
const auth = { authorization: 'AgentToken a-secret' };
const input = (key = 'journal-create-180') => ({
  localDate: '2026-09-19',
  title: 'Shoulder response to movement',
  content:
    'The shoulder felt tighter for an hour after the walk, then returned to its usual range.',
  category: 'health',
  sourceReferences: [{ kind: 'body_concern', id: 'concern', revisionId: 'concern-r1' }],
  source,
  idempotencyKey: key,
});

describe('registered Journal runtime', () => {
  beforeEach(async () => {
    directory = mkdtempSync(join(tmpdir(), 'pulse-journal-180-'));
    process.env.DATABASE_URL = join(directory, 'test.db');
    process.env.JWT_SECRET = 'fictional-180-secret';
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
      ])
      .run();
    for (const [id, userId] of [
      ['concern', 'owner'],
      ['foreign-concern', 'foreign'],
    ]) {
      database.sqlite
        .prepare(
          "insert into body_context_concerns (id,user_id,label,body_region,symptom_state,management_state,source_json,revision,current_revision_id,created_at,updated_at) values (?,?,?,'shoulder','affirmed','active',?,1,'concern-r1','2026-09-19T00:00:00.000Z','2026-09-19T00:00:00.000Z')",
        )
        .run(
          id,
          userId,
          id === 'concern' ? 'Fictional shoulder' : 'Foreign shoulder',
          JSON.stringify({
            ...source,
            capturedAt: '2026-09-19T00:00:00.000Z',
            capturedBy: { kind: 'agent_token', id: 'agent-a', label: 'a' },
          }),
        );
    }
  });
  afterEach(() => {
    database.sqlite.close();
    process.env.DATABASE_URL = originalUrl;
    process.env.PULSE_TEST_NOW = originalNow;
    delete process.env.JWT_SECRET;
    rmSync(directory, { recursive: true, force: true });
    vi.resetModules();
  });
  it('captures provenance, replays historical receipts after source advancement, and appends immutable corrections', async () => {
    const { buildServer } = await import('../../index.js');
    const app = buildServer();
    await app.ready();
    try {
      for (const provenanceClass of [
        'clinician_authored',
        'user_relayed_clinician',
        'user_observation',
        'agent_suggestion',
      ]) {
        const payload = {
          ...input(`journal-${provenanceClass}-180`),
          source: { ...source, class: provenanceClass },
        };
        const created = await app.inject({
          method: 'POST',
          url: '/api/v1/journal',
          headers: auth,
          payload,
        });
        expect(created.statusCode).toBe(201);
        expect(created.json().data.observation.source).toMatchObject({
          class: provenanceClass,
          uncertainty: 'unknown',
          capturedBy: { id: 'agent-a' },
          sourceOccurredAt: source.sourceOccurredAt,
        });
      }
      const payload = input();
      const created = await app.inject({
        method: 'POST',
        url: '/api/v1/journal',
        headers: auth,
        payload,
      });
      expect(created.statusCode).toBe(201);
      const first = created.json().data;
      const id = first.observation.id as string;
      expect(first.observation.sourceReferences).toEqual([
        { kind: 'body_concern', id: 'concern', subjectUserId: 'owner', revisionId: 'concern-r1' },
      ]);
      const afterCreate = database.sqlite
        .prepare('select count(*) count from journal_observations')
        .get() as { count: number };
      database.sqlite
        .prepare(
          "update body_context_concerns set current_revision_id='concern-r2' where id='concern'",
        )
        .run(); // fixture-DB source advancement, not an API bypass
      const replay = await app.inject({
        method: 'POST',
        url: '/api/v1/journal',
        headers: auth,
        payload: {
          ...payload,
          sourceReferences: [payload.sourceReferences[0], payload.sourceReferences[0]],
        },
      });
      expect(replay.statusCode).toBe(201);
      expect(replay.headers['idempotent-replay']).toBe('true');
      expect(replay.json().data).toEqual(first);
      expect(
        database.sqlite.prepare('select count(*) count from journal_observations').get(),
      ).toEqual(afterCreate);
      const staleSource = await app.inject({
        method: 'POST',
        url: '/api/v1/journal',
        headers: auth,
        payload: { ...payload, idempotencyKey: 'new-stale-180' },
      });
      expect(staleSource.json().error.code).toBe('OWNED_LINK_NOT_FOUND');
      const staleLinkedCorrection = await app.inject({
        method: 'POST',
        url: `/api/v1/journal/${id}/corrections`,
        headers: auth,
        payload: {
          expectedRevisionId: first.observation.currentRevisionId,
          correctedFields: { content: 'A new clarification without a refreshed source.' },
          reason: 'Fictional clarification',
          idempotencyKey: 'stale-link-correction-180',
        },
      });
      expect(staleLinkedCorrection.statusCode).toBe(404);
      expect(staleLinkedCorrection.json().error.code).toBe('OWNED_LINK_NOT_FOUND');
      process.env.PULSE_TEST_NOW = '2026-09-20T05:30:00.000Z';
      const correction = {
        expectedRevisionId: first.observation.currentRevisionId,
        correctedFields: {
          content: 'Tightness lasted about thirty minutes after the walk.',
          sourceReferences: [{ kind: 'body_concern', id: 'concern', revisionId: 'concern-r2' }],
        },
        reason: 'User corrected the duration.',
        idempotencyKey: 'correct-180',
      };
      const corrected = await app.inject({
        method: 'POST',
        url: `/api/v1/journal/${id}/corrections`,
        headers: { authorization: 'AgentToken b-secret' },
        payload: correction,
      });
      expect(corrected.statusCode).toBe(200);
      expect(corrected.json().data.history).toHaveLength(2);
      expect(corrected.json().data.history[0].observation).toEqual(first.observation);
      expect(corrected.json().data.observation.createdAt).toBe(first.observation.createdAt);
      expect(corrected.json().data.history[0].recordedAt).toBe('2026-09-20T04:30:00.000Z');
      expect(corrected.json().data.history[1].recordedAt).toBe('2026-09-20T05:30:00.000Z');
      expect(corrected.json().data.observation.source.capturedAt).toBe(
        first.observation.source.capturedAt,
      );
      expect(corrected.json().data.history[1].recordedBy.id).toBe('agent-b');
      const correctionReplay = await app.inject({
        method: 'POST',
        url: `/api/v1/journal/${id}/corrections`,
        headers: auth,
        payload: correction,
      });
      expect(correctionReplay.statusCode).toBe(200);
      expect(correctionReplay.headers['idempotent-replay']).toBe('true');
      const staleCorrection = await app.inject({
        method: 'POST',
        url: `/api/v1/journal/${id}/corrections`,
        headers: auth,
        payload: { ...correction, idempotencyKey: 'stale-correct-180' },
      });
      expect(staleCorrection.json().error.code).toBe('STALE_REVISION');
      const detail = await app.inject({
        method: 'GET',
        url: `/api/v1/journal/${id}`,
        headers: auth,
      });
      expect(detail.statusCode).toBe(200);
      expect(detail.json().data).toEqual(corrected.json().data);
      const conflict = await app.inject({
        method: 'POST',
        url: '/api/v1/journal',
        headers: auth,
        payload: { ...payload, content: 'Changed content' },
      });
      expect(conflict.json().error.code).toBe('IDEMPOTENCY_KEY_REUSE');
    } finally {
      await app.close();
    }
  });
  it('rejects copied logs and invalid sources, keeps check-in separate, and derives repeatable weekly facts and gaps', async () => {
    const { buildServer } = await import('../../index.js');
    const app = buildServer();
    await app.ready();
    try {
      const invalid = [
        { kind: 'body_concern', id: 'missing', revisionId: 'concern-r1' },
        { kind: 'body_concern', id: 'foreign-concern', revisionId: 'concern-r1' },
        { kind: 'body_concern', id: 'concern', revisionId: 'stale' },
        { kind: 'activity', id: 'concern', revisionId: 'concern-r1' },
        { kind: 'body_concern', id: 'concern', revisionId: 'concern-r1', subjectUserId: 'foreign' },
      ];
      for (const reference of invalid) {
        const result = await app.inject({
          method: 'POST',
          url: '/api/v1/journal',
          headers: auth,
          payload: {
            ...input(`invalid-${reference.id}-${reference.revisionId}`),
            sourceReferences: [input().sourceReferences[0], reference],
          },
        });
        expect(result.statusCode).toBe(404);
        expect(result.json().error.code).toBe('OWNED_LINK_NOT_FOUND');
        expect(result.body).not.toContain('foreign-concern');
      }
      const copied = await app.inject({
        method: 'POST',
        url: '/api/v1/journal',
        headers: auth,
        payload: { ...input('copy-180'), content: 'Fictional shoulder' },
      });
      expect(copied.json().error.code).toBe('ROUTINE_LOG_COPY');
      const weeklyWrite = await app.inject({
        method: 'POST',
        url: '/api/v1/journal',
        headers: auth,
        payload: { ...input('weekly-write-180'), category: 'weekly_reflection' },
      });
      expect(weeklyWrite.statusCode).toBe(400);
      const created = await app.inject({
        method: 'POST',
        url: '/api/v1/journal',
        headers: auth,
        payload: input(),
      });
      expect(created.statusCode).toBe(201);
      const context = await app.inject({
        method: 'GET',
        url: '/api/v1/daily-context?date=2026-09-19',
        headers: auth,
      });
      expect(context.statusCode).toBe(200);
      expect(context.json().data.journalObservations).toHaveLength(1);
      expect(context.json().data.observations).toEqual([]);
      expect(context.json().data.pendingQuestions).toEqual([]);
      database.sqlite
        .prepare(
          "insert into journal_entries (id,user_id,date,title,type,content,created_by,created_at,updated_at) values ('legacy','owner','2026-09-19','Old note','observation','Old text','agent',1,1)",
        )
        .run();
      const list = await app.inject({
        method: 'GET',
        url: '/api/v1/journal?from=2026-09-19&to=2026-09-19',
        headers: auth,
      });
      expect(list.statusCode).toBe(200);
      expect(list.json().data.items.map((item: { kind: string }) => item.kind)).toEqual([
        'canonical',
        'legacy_date_only',
      ]);
      const legacyCorrection = await app.inject({
        method: 'POST',
        url: '/api/v1/journal/legacy/corrections',
        headers: auth,
        payload: {
          expectedRevisionId: 'none',
          correctedFields: { content: 'Changed' },
          reason: 'Test',
          idempotencyKey: 'legacy-correct-180',
        },
      });
      expect(legacyCorrection.statusCode).toBe(404);
      const weekly = await app.inject({
        method: 'GET',
        url: '/api/v1/journal/weekly-reflection?start=2026-09-19&end=2026-09-20',
        headers: auth,
      });
      expect(weekly.statusCode).toBe(200);
      expect(weekly.json().data.facts).toHaveLength(1);
      expect(weekly.json().data.facts[0]).toMatchObject({
        summary: input().content,
        sourceReferences: [{ kind: 'body_concern' }, { kind: 'journal_entry' }],
      });
      expect(weekly.json().data.gaps).toContain('2026-09-20: nutrition missing');
      const again = await app.inject({
        method: 'GET',
        url: '/api/v1/journal/weekly-reflection?start=2026-09-19&end=2026-09-20',
        headers: auth,
      });
      expect(again.json().data.facts).toEqual(weekly.json().data.facts);
      expect(again.json().data.gaps).toEqual(weekly.json().data.gaps);
      const question = await app.inject({
        method: 'POST',
        url: '/api/v1/check-in/questions',
        headers: auth,
        payload: {
          localDate: '2026-09-20',
          semanticTopic: 'uncertain shoulder report',
          prompt: 'Was there discomfort?',
          sourceReferences: [{ kind: 'body_concern', id: 'concern', revisionId: 'concern-r1' }],
          followUpQuestionId: null,
          idempotencyKey: 'unknown-question-180',
        },
      });
      expect(question.statusCode).toBe(201);
      const unknown = await app.inject({
        method: 'POST',
        url: `/api/v1/check-in/questions/${question.json().data.question.questionId}/answers`,
        headers: auth,
        payload: {
          expectedQuestionRevisionId: question.json().data.question.id,
          expectedAnswerRevision: 0,
          state: 'unknown',
          source,
          idempotencyKey: 'unknown-answer-180',
        },
      });
      expect(unknown.statusCode).toBe(201);
      const withUnknown = await app.inject({
        method: 'GET',
        url: '/api/v1/journal/weekly-reflection?start=2026-09-19&end=2026-09-20',
        headers: auth,
      });
      expect(withUnknown.json().data.gaps).toContain(
        `2026-09-20: check-in answer ${unknown.json().data.currentAnswer.answerId} is unknown`,
      );
      expect(withUnknown.json().data.facts).toHaveLength(1);
      for (const range of ['start=2026-09-21&end=2026-09-20', 'start=2026-09-01&end=2026-09-20']) {
        const invalidRange = await app.inject({
          method: 'GET',
          url: `/api/v1/journal/weekly-reflection?${range}`,
          headers: auth,
        });
        expect(invalidRange.statusCode).toBe(400);
      }
      expect(
        database.sqlite.prepare('select count(*) count from daily_check_in_questions').get(),
      ).toEqual({ count: 1 });
    } finally {
      await app.close();
    }
  });
  it('enforces AgentToken writes, rejects spoofing, and publishes exact OpenAPI paths', async () => {
    const { buildServer } = await import('../../index.js');
    const app = buildServer();
    await app.ready();
    try {
      const token = app.jwt.sign(
        { sub: 'owner', type: 'session', iss: 'pulse-api' },
        { expiresIn: '1h' },
      );
      const jwtWrite = await app.inject({
        method: 'POST',
        url: '/api/v1/journal',
        headers: { authorization: `Bearer ${token}` },
        payload: input('jwt-write-180'),
      });
      expect([401, 403]).toContain(jwtWrite.statusCode);
      const jwtRead = await app.inject({
        method: 'GET',
        url: '/api/v1/journal?from=2026-09-19&to=2026-09-19',
        headers: { authorization: `Bearer ${token}` },
      });
      expect(jwtRead.statusCode).toBe(200);
      for (const extra of [
        { subjectUserId: 'foreign' },
        { actor: { kind: 'user', id: 'owner', label: null } },
        { scope: { subjectUserId: 'foreign' } },
      ]) {
        const spoof = await app.inject({
          method: 'POST',
          url: '/api/v1/journal',
          headers: auth,
          payload: { ...input('spoof-180'), ...extra },
        });
        expect(spoof.statusCode).toBe(400);
      }
      const spec = (await app.inject({ method: 'GET', url: '/api/docs/json' })).json();
      for (const path of [
        '/api/v1/journal',
        '/api/v1/journal/weekly-reflection',
        '/api/v1/journal/{id}',
        '/api/v1/journal/{id}/corrections',
      ])
        expect(spec.paths[path]).toBeDefined();
    } finally {
      await app.close();
    }
  });
  it('rejects verbatim workout, answer, and flare copies while keeping additional observations', async () => {
    database.sqlite
      .prepare(
        "insert into workout_sessions (id,user_id,name,date,status,started_at,completed_at) values ('workout','owner','Fictional strength','2026-09-19','completed',1790000000000,1790003600000)",
      )
      .run();
    database.sqlite
      .prepare(
        "insert into body_context_flares (id,concern_id,user_id,occurred_at,local_date,time_zone,observation,source_json,created_at) values ('flare','concern','owner','2026-09-19T16:00:00.000Z','2026-09-19','America/Detroit','Shoulder felt sore.',?,'2026-09-19T16:00:00.000Z')",
      )
      .run(
        JSON.stringify({
          ...source,
          capturedAt: '2026-09-19T16:00:00.000Z',
          capturedBy: { kind: 'agent_token', id: 'agent-a', label: 'a' },
        }),
      );
    const { readCurrentSourceRevision } = await import('../daily-check-in/source-authority.js');
    const { buildServer } = await import('../../index.js');
    const app = buildServer();
    await app.ready();
    try {
      const question = await app.inject({
        method: 'POST',
        url: '/api/v1/check-in/questions',
        headers: auth,
        payload: {
          localDate: '2026-09-19',
          semanticTopic: 'shoulder state',
          prompt: 'How was the shoulder?',
          sourceReferences: [{ kind: 'body_concern', id: 'concern', revisionId: 'concern-r1' }],
          followUpQuestionId: null,
          idempotencyKey: 'journal-question-180',
        },
      });
      expect(question.statusCode).toBe(201);
      const questionData = question.json().data.question;
      const answer = await app.inject({
        method: 'POST',
        url: `/api/v1/check-in/questions/${questionData.questionId}/answers`,
        headers: auth,
        payload: {
          expectedQuestionRevisionId: questionData.id,
          expectedAnswerRevision: 0,
          state: 'answered',
          value: 'Sore during reach.',
          source,
          idempotencyKey: 'journal-answer-180',
        },
      });
      expect(answer.statusCode).toBe(201);
      const links = [
        {
          kind: 'workout_session',
          id: 'workout',
          revisionId: readCurrentSourceRevision(
            database.sqlite,
            'owner',
            'workout_session',
            'workout',
          ),
        },
        {
          kind: 'check_in_answer',
          id: answer.json().data.currentAnswer.answerId,
          revisionId: answer.json().data.currentAnswer.id,
        },
        {
          kind: 'observation',
          id: 'flare',
          revisionId: readCurrentSourceRevision(database.sqlite, 'owner', 'observation', 'flare'),
        },
      ];
      for (const [index, content] of [
        'Fictional strength',
        'Sore during reach.',
        'Shoulder felt sore.',
      ].entries()) {
        const result = await app.inject({
          method: 'POST',
          url: '/api/v1/journal',
          headers: auth,
          payload: {
            ...input(`copy-source-${index}-180`),
            sourceReferences: [links[index]],
            content,
          },
        });
        expect(result.json().error.code).toBe('ROUTINE_LOG_COPY');
      }
      expect(
        database.sqlite.prepare('select count(*) count from journal_observations').get(),
      ).toEqual({ count: 0 });
      const meaningful = await app.inject({
        method: 'POST',
        url: '/api/v1/journal',
        headers: auth,
        payload: {
          ...input('meaningful-linked-180'),
          sourceReferences: links,
          content: 'After the strength session, reaching overhead felt different from usual.',
        },
      });
      expect(meaningful.statusCode).toBe(201);
      const reorderedReplay = await app.inject({
        method: 'POST',
        url: '/api/v1/journal',
        headers: auth,
        payload: {
          ...input('meaningful-linked-180'),
          sourceReferences: [links[2], links[0], links[1], links[0]],
          content: 'After the strength session, reaching overhead felt different from usual.',
        },
      });
      expect(reorderedReplay.statusCode).toBe(201);
      expect(reorderedReplay.headers['idempotent-replay']).toBe('true');
      database.sqlite
        .prepare(
          "update workout_sessions set deleted_at='2026-09-20T00:00:00.000Z' where id='workout'",
        )
        .run(); // fixture-DB soft delete probe
      const deletedLink = await app.inject({
        method: 'POST',
        url: '/api/v1/journal',
        headers: auth,
        payload: { ...input('deleted-workout-180'), sourceReferences: [links[0]] },
      });
      expect(deletedLink.statusCode).toBe(404);
      expect(deletedLink.json().error.code).toBe('OWNED_LINK_NOT_FOUND');
      const reflection = await app.inject({
        method: 'GET',
        url: '/api/v1/journal/weekly-reflection?start=2026-09-19&end=2026-09-19',
        headers: auth,
      });
      expect(reflection.statusCode).toBe(200);
      expect(
        reflection
          .json()
          .data.facts.some((fact: { summary: string }) => fact.summary === 'Sore during reach.'),
      ).toBe(true);
    } finally {
      await app.close();
    }
  });
  it('reopens SQLite and replays a historical create after linked source advancement', async () => {
    const { buildServer } = await import('../../index.js');
    const app = buildServer();
    await app.ready();
    const payload = input('reopen-create-180');
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/journal',
      headers: auth,
      payload,
    });
    expect(created.statusCode).toBe(201);
    await app.close();
    database.sqlite
      .prepare(
        "update body_context_concerns set current_revision_id='concern-r2' where id='concern'",
      )
      .run(); // fixture-DB source advancement
    database.sqlite.close();
    vi.resetModules();
    database = await import('../../db/index.js');
    const reopened = (await import('../../index.js')).buildServer();
    await reopened.ready();
    try {
      const replay = await reopened.inject({
        method: 'POST',
        url: '/api/v1/journal',
        headers: auth,
        payload,
      });
      expect(replay.statusCode).toBe(201);
      expect(replay.headers['idempotent-replay']).toBe('true');
      expect(replay.json()).toEqual(created.json());
      const readback = await reopened.inject({
        method: 'GET',
        url: `/api/v1/journal/${created.json().data.observation.id}`,
        headers: auth,
      });
      expect(readback.statusCode).toBe(200);
      expect(readback.json()).toEqual(created.json());
    } finally {
      await reopened.close();
    }
  });
  it('keeps spring, fall, and UTC-boundary facts on the authoritative Detroit local date', async () => {
    const { getDateKeyInTimeZone } = await import('../../lib/user-time-zone.js');
    const { buildServer } = await import('../../index.js');
    const app = buildServer();
    await app.ready();
    try {
      for (const [date, instant, key] of [
        ['2026-03-08', '2026-03-08T07:30:00.000Z', 'spring'],
        ['2026-11-01', '2026-11-01T06:30:00.000Z', 'fall'],
        ['2026-09-19', '2026-09-20T03:30:00.000Z', 'utc-boundary'],
      ]) {
        expect(getDateKeyInTimeZone(new Date(instant), 'America/Detroit')).toBe(date);
        const content = `The shoulder felt different after a walk on ${date}.`;
        const created = await app.inject({
          method: 'POST',
          url: '/api/v1/journal',
          headers: auth,
          payload: {
            ...input(`journal-${key}-180`),
            localDate: date,
            content,
            source: { ...source, sourceOccurredAt: instant },
          },
        });
        expect(created.statusCode).toBe(201);
        expect(created.json().data.observation).toMatchObject({
          localDate: date,
          timeZone: 'America/Detroit',
          content,
        });
        const context = await app.inject({
          method: 'GET',
          url: `/api/v1/daily-context?date=${date}`,
          headers: auth,
        });
        expect(context.statusCode).toBe(200);
        expect(
          context.json().data.journalObservations.map((item: { id: string }) => item.id),
        ).toContain(created.json().data.observation.id);
        const weekly = await app.inject({
          method: 'GET',
          url: `/api/v1/journal/weekly-reflection?start=${date}&end=${date}`,
          headers: auth,
        });
        expect(weekly.statusCode).toBe(200);
        expect(weekly.json().data.facts).toContainEqual(
          expect.objectContaining({ localDate: date, summary: content }),
        );
      }
    } finally {
      await app.close();
    }
  });
});
