import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import type { WorkoutFeedbackQuestionInput } from '@pulse/shared';

type DatabaseModule = typeof import('../../db/index.js');
type StoreModule = typeof import('./store.js');

let database: DatabaseModule;
let store: StoreModule;
let temporaryDirectory: string;

const tibQuestion: WorkoutFeedbackQuestionInput = {
  id: 'tib-bar-response',
  prompt: 'What did the left lower leg do during tib-bar raises?',
  type: 'multi_select',
  optional: true,
  timing: 'post_session',
  config: {
    options: ['No issue', 'Pain', 'Tightness', 'Could not test'],
    exclusiveOption: 'No issue',
  },
  exerciseIdSnapshot: 'exercise-tib',
  exerciseNameSnapshot: 'Tibialis Raise',
  bodyRegion: 'lower leg',
  laterality: 'left',
  concernRef: 'synthetic-tib-concern',
  contextLabel: 'Fictional scheduled tib-bar check',
};

const zeroScaleQuestion: WorkoutFeedbackQuestionInput = {
  id: 'confidence-zero-scale',
  prompt: 'Synthetic zero-capable scale?',
  type: 'scale',
  optional: true,
  timing: 'post_session',
  config: { min: 0, max: 4, step: 1 },
};

describe('workout feedback revision store', () => {
  beforeAll(async () => {
    temporaryDirectory = mkdtempSync(join(tmpdir(), 'pulse-feedback-store-'));
    process.env.DATABASE_URL = join(temporaryDirectory, 'test.db');
    vi.resetModules();
    database = await import('../../db/index.js');
    migrate(database.db, {
      migrationsFolder: fileURLToPath(new URL('../../../drizzle', import.meta.url)),
    });
    store = await import('./store.js');
    const { users, exercises, workoutTemplates, scheduledWorkouts, workoutSessions, sessionSets } =
      await import('../../db/schema/index.js');
    database.db
      .insert(users)
      .values([
        { id: 'owner-a', username: 'fictional-a', name: 'A', passwordHash: 'hash' },
        { id: 'owner-b', username: 'fictional-b', name: 'B', passwordHash: 'hash' },
      ])
      .run();
    database.db
      .insert(exercises)
      .values({
        id: 'exercise-tib',
        userId: 'owner-a',
        name: 'Tibialis Raise',
        trackingType: 'weight_reps',
        muscleGroups: ['tibialis'],
        equipment: 'other',
        category: 'isolation',
        formCues: [],
        coachingNotes: null,
        instructions: null,
      })
      .run();
    database.db
      .insert(workoutTemplates)
      .values([
        { id: 'template-a', userId: 'owner-a', name: 'Tib bar', tags: [] },
        { id: 'template-next', userId: 'owner-a', name: 'Next tib bar', tags: [] },
      ])
      .run();
    database.db
      .insert(scheduledWorkouts)
      .values({
        id: 'schedule-a',
        userId: 'owner-a',
        templateId: 'template-a',
        date: '2026-09-08',
      })
      .run();
    database.db
      .insert(workoutSessions)
      .values([
        {
          id: 'session-a',
          userId: 'owner-a',
          templateId: 'template-a',
          scheduledWorkoutId: 'schedule-a',
          name: 'Synthetic tib bar',
          date: '2026-09-08',
          status: 'completed',
          startedAt: 100,
          completedAt: 200,
          duration: 10,
          timeSegments: '[]',
          feedback: null,
        },
        {
          id: 'session-next',
          userId: 'owner-a',
          templateId: 'template-next',
          name: 'Next tib bar',
          date: '2026-09-09',
          status: 'in-progress',
          startedAt: 300,
          timeSegments: '[]',
          feedback: null,
        },
      ])
      .run();
    database.db
      .insert(sessionSets)
      .values({
        id: 'set-a',
        sessionId: 'session-a',
        exerciseId: 'exercise-tib',
        exerciseIdSnapshot: 'exercise-tib',
        exerciseNameSnapshot: 'Tibialis Raise',
        trackingTypeSnapshot: 'weight_reps',
        orderIndex: 0,
        setNumber: 1,
        weight: 10,
        reps: 12,
        rpe: null,
        rir: 3,
        completed: true,
        skipped: false,
        section: 'main',
        notes: 'unchanged synthetic set',
      })
      .run();
  });

  afterAll(() => {
    database.sqlite.close();
    rmSync(temporaryDirectory, { recursive: true, force: true });
    delete process.env.DATABASE_URL;
    vi.resetModules();
  });

  it('freezes exact template and scheduled revisions without recurring a one-off override', () => {
    const actor = { kind: 'agent_token' as const, id: 'agent-token-a', name: 'Synthetic Agent' };
    const templateV1 = database.db.transaction((tx) =>
      store.writeAuthoredQuestionList(tx, {
        userId: 'owner-a',
        scopeKind: 'template',
        scopeId: 'template-a',
        source: 'template_defaults',
        expectedRevision: 0,
        questions: [zeroScaleQuestion],
        actor,
        now: 1_000,
      }),
    );
    const scheduledSnapshot = database.db.transaction((tx) =>
      store.writeFrozenQuestionList(tx, {
        userId: 'owner-a',
        scopeKind: 'scheduled',
        scopeId: 'schedule-a',
        source: 'template_snapshot',
        expectedRevision: 0,
        definitions: templateV1.questions,
        actor: { kind: 'system', id: null, name: null },
        now: 1_100,
      }),
    );
    const templateV2 = database.db.transaction((tx) =>
      store.writeAuthoredQuestionList(tx, {
        userId: 'owner-a',
        scopeKind: 'template',
        scopeId: 'template-a',
        source: 'template_defaults',
        expectedRevision: 1,
        questions: [
          { ...zeroScaleQuestion, prompt: 'Edited template wording that must not leak backward' },
        ],
        actor,
        now: 1_200,
      }),
    );
    expect(templateV2.questions[0]?.version).toBe(2);
    expect(store.readQuestionList(database.db, 'owner-a', 'scheduled', 'schedule-a')).toEqual(
      scheduledSnapshot,
    );

    const override = database.db.transaction((tx) =>
      store.writeAuthoredQuestionList(tx, {
        userId: 'owner-a',
        scopeKind: 'scheduled',
        scopeId: 'schedule-a',
        source: 'scheduled_override',
        expectedRevision: 1,
        questions: [tibQuestion, zeroScaleQuestion],
        actor,
        now: 1_300,
      }),
    );
    expect(override.source).toBe('scheduled_override');
    database.db.transaction((tx) =>
      store.freezeSessionQuestionList(tx, {
        userId: 'owner-a',
        sessionId: 'session-a',
        source: 'scheduled_override',
        additionalDefinitions: override.questions,
        startedAt: 100,
      }),
    );
    database.db.transaction((tx) =>
      store.freezeSessionQuestionList(tx, {
        userId: 'owner-a',
        sessionId: 'session-next',
        source: 'template_snapshot',
        additionalDefinitions: templateV2.questions,
        startedAt: 300,
      }),
    );
    const frozen = store.readQuestionList(database.db, 'owner-a', 'session', 'session-a');
    expect(frozen.questions.map((question) => question.id)).toEqual([
      'session-rpe',
      'pain-discomfort',
      'session-context',
      'tib-bar-response',
      'confidence-zero-scale',
    ]);
    expect(frozen.questions[3]).toMatchObject({
      prompt: tibQuestion.prompt,
      version: 1,
      exerciseNameSnapshot: 'Tibialis Raise',
      laterality: 'left',
    });
    expect(
      store
        .readQuestionList(database.db, 'owner-a', 'session', 'session-next')
        .questions.map(({ id }) => id),
    ).not.toContain('tib-bar-response');
    expect(
      store.readQuestionList(database.db, 'owner-b', 'session', 'session-a').questions,
    ).toEqual([]);
  });

  it('appends durable answer drafts and completed corrections without changing workout facts', async () => {
    const { sessionSets, workoutSessions } = await import('../../db/schema/index.js');
    const beforeSet = database.db.select().from(sessionSets).all();
    const beforeSession = database.db
      .select()
      .from(workoutSessions)
      .all()
      .find(({ id }) => id === 'session-a');
    const frozen = store.readQuestionList(database.db, 'owner-a', 'session', 'session-a');
    const version = frozen.questions.find(({ id }) => id === 'tib-bar-response')?.version ?? 0;

    const draft = database.db.transaction((tx) =>
      store.writeAnswerRevisions(tx, {
        userId: 'owner-a',
        sessionId: 'session-a',
        expectedRevision: 0,
        responses: [
          { questionId: 'session-rpe', definitionVersion: 1, state: 'answered', value: 1 },
          { questionId: 'pain-discomfort', definitionVersion: 1, state: 'answered', value: false },
          { questionId: 'session-context', definitionVersion: 1, state: 'unanswered' },
          { questionId: 'tib-bar-response', definitionVersion: version, state: 'skipped' },
          {
            questionId: 'confidence-zero-scale',
            definitionVersion: 2,
            state: 'answered',
            value: 0,
          },
        ],
        actor: { kind: 'user', id: 'owner-a', name: null },
        now: 2_000,
      }),
    );
    expect(draft.revision).toBe(1);
    expect(
      draft.current.find(({ questionId }) => questionId === 'confidence-zero-scale')?.value,
    ).toBe(0);
    expect(draft.current.find(({ questionId }) => questionId === 'pain-discomfort')?.value).toBe(
      false,
    );

    expect(() =>
      database.db.transaction((tx) =>
        store.writeAnswerRevisions(tx, {
          userId: 'owner-a',
          sessionId: 'session-a',
          expectedRevision: 0,
          responses: [
            {
              questionId: 'tib-bar-response',
              definitionVersion: version,
              state: 'answered',
              value: ['Pain'],
            },
          ],
          actor: { kind: 'agent_token', id: 'agent-token-a', name: 'Synthetic Agent' },
          now: 2_100,
        }),
      ),
    ).toThrow(store.WorkoutFeedbackRevisionConflictError);

    const corrected = database.db.transaction((tx) =>
      store.writeAnswerRevisions(tx, {
        userId: 'owner-a',
        sessionId: 'session-a',
        expectedRevision: 1,
        responses: [
          {
            questionId: 'tib-bar-response',
            definitionVersion: version,
            state: 'answered',
            value: ['Pain', 'Tightness'],
            notes: 'Synthetic result only',
          },
        ],
        actor: { kind: 'agent_token', id: 'agent-token-a', name: 'Synthetic Agent' },
        now: 2_200,
      }),
    );
    const customHistory = corrected.history.filter(
      ({ questionId }) => questionId === 'tib-bar-response',
    );
    expect(customHistory).toHaveLength(2);
    expect(customHistory[1]).toMatchObject({
      revision: 2,
      priorRevisionId: expect.any(String),
      respondentSource: 'agent_token',
      respondentActorId: 'agent-token-a',
      value: ['Pain', 'Tightness'],
      timing: 'post_session',
      exerciseNameSnapshot: 'Tibialis Raise',
      laterality: 'left',
    });
    expect(database.db.select().from(sessionSets).all()).toEqual(beforeSet);
    expect(
      database.db
        .select()
        .from(workoutSessions)
        .all()
        .find(({ id }) => id === 'session-a'),
    ).toMatchObject({
      status: beforeSession?.status,
      startedAt: beforeSession?.startedAt,
      completedAt: beforeSession?.completedAt,
      duration: beforeSession?.duration,
    });
  });

  it('keeps explicit empty scheduled overrides and rejects stale list writers atomically', () => {
    const actor = { kind: 'agent_token' as const, id: 'agent-token-a', name: 'Synthetic Agent' };
    const current = store.readQuestionList(database.db, 'owner-a', 'scheduled', 'schedule-a');
    const empty = database.db.transaction((tx) =>
      store.writeAuthoredQuestionList(tx, {
        userId: 'owner-a',
        scopeKind: 'scheduled',
        scopeId: 'schedule-a',
        source: 'scheduled_override',
        expectedRevision: current.revision,
        questions: [],
        actor,
        now: 3_000,
      }),
    );
    expect(empty).toMatchObject({ source: 'scheduled_override', questions: [] });
    expect(() =>
      database.db.transaction((tx) =>
        store.writeAuthoredQuestionList(tx, {
          userId: 'owner-a',
          scopeKind: 'scheduled',
          scopeId: 'schedule-a',
          source: 'scheduled_override',
          expectedRevision: current.revision,
          questions: [tibQuestion],
          actor,
          now: 3_100,
        }),
      ),
    ).toThrow(store.WorkoutFeedbackRevisionConflictError);
    expect(store.readQuestionList(database.db, 'owner-a', 'scheduled', 'schedule-a')).toEqual(
      empty,
    );

    const readded = database.db.transaction((tx) =>
      store.writeAuthoredQuestionList(tx, {
        userId: 'owner-a',
        scopeKind: 'scheduled',
        scopeId: 'schedule-a',
        source: 'scheduled_override',
        expectedRevision: empty.revision,
        questions: [tibQuestion],
        actor,
        now: 3_200,
      }),
    );
    expect(readded.questions[0]).toMatchObject({ id: 'tib-bar-response', version: 2 });
  });
});
