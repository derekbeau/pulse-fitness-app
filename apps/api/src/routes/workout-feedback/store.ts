import { randomUUID } from 'node:crypto';

import {
  createSystemWorkoutFeedbackQuestions,
  validateWorkoutFeedbackAnswer,
  workoutFeedbackAnswerRevisionSchema,
  workoutFeedbackQuestionDefinitionSchema,
  workoutFeedbackQuestionInputSchema,
  type WorkoutFeedbackAnswerInput,
  type WorkoutFeedbackAnswerRevision,
  type WorkoutFeedbackAnswerSnapshot,
  type WorkoutFeedbackQuestionDefinition,
  type WorkoutFeedbackQuestionInput,
  type WorkoutFeedbackQuestionList,
} from '@pulse/shared';
import { and, asc, eq } from 'drizzle-orm';

import {
  workoutFeedbackAnswerCurrent,
  workoutFeedbackAnswerRevisions,
  workoutFeedbackAnswerSets,
  workoutFeedbackQuestionDefinitions,
  workoutFeedbackQuestionListRevisions,
  workoutFeedbackQuestionLists,
  type WorkoutFeedbackQuestionsSource,
  type WorkoutFeedbackScopeKind,
} from '../../db/schema/index.js';

type PulseDb = typeof import('../../db/index.js').db;
type PulseTx = Parameters<Parameters<PulseDb['transaction']>[0]>[0];
type FeedbackDatabase = PulseDb | PulseTx;

export type FeedbackMutationActor = {
  kind: 'system' | 'user' | 'agent_token' | 'legacy_import';
  id: string | null;
  name: string | null;
};

export class WorkoutFeedbackRevisionConflictError extends Error {
  readonly currentRevision: number;

  constructor(currentRevision: number) {
    super('Workout feedback was changed by another writer. Refresh and retry.');
    this.name = 'WorkoutFeedbackRevisionConflictError';
    this.currentRevision = currentRevision;
  }
}

export class WorkoutFeedbackValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WorkoutFeedbackValidationError';
  }
}

const emptyQuestionList = (
  source: WorkoutFeedbackQuestionsSource,
): WorkoutFeedbackQuestionList => ({
  revision: 0,
  source,
  questions: [],
});

const defaultSourceForScope = (
  scopeKind: WorkoutFeedbackScopeKind,
): WorkoutFeedbackQuestionsSource =>
  scopeKind === 'template'
    ? 'template_defaults'
    : scopeKind === 'scheduled'
      ? 'template_snapshot'
      : 'ad_hoc';

export function readQuestionList(
  database: FeedbackDatabase,
  userId: string,
  scopeKind: WorkoutFeedbackScopeKind,
  scopeId: string,
): WorkoutFeedbackQuestionList {
  const list = database
    .select()
    .from(workoutFeedbackQuestionLists)
    .where(
      and(
        eq(workoutFeedbackQuestionLists.userId, userId),
        eq(workoutFeedbackQuestionLists.scopeKind, scopeKind),
        eq(workoutFeedbackQuestionLists.scopeId, scopeId),
      ),
    )
    .limit(1)
    .get();
  if (!list || list.currentRevision === 0)
    return emptyQuestionList(defaultSourceForScope(scopeKind));

  const listRevision = database
    .select({ id: workoutFeedbackQuestionListRevisions.id })
    .from(workoutFeedbackQuestionListRevisions)
    .where(
      and(
        eq(workoutFeedbackQuestionListRevisions.listId, list.id),
        eq(workoutFeedbackQuestionListRevisions.revision, list.currentRevision),
      ),
    )
    .limit(1)
    .get();
  if (!listRevision)
    throw new Error('Workout feedback question projection is missing its revision.');

  const questions = database
    .select({ definition: workoutFeedbackQuestionDefinitions.definition })
    .from(workoutFeedbackQuestionDefinitions)
    .where(eq(workoutFeedbackQuestionDefinitions.listRevisionId, listRevision.id))
    .orderBy(asc(workoutFeedbackQuestionDefinitions.orderIndex))
    .all()
    .map(({ definition }) => workoutFeedbackQuestionDefinitionSchema.parse(definition));

  return { revision: list.currentRevision, source: list.source, questions };
}

function findOrCreateList(
  database: FeedbackDatabase,
  input: {
    userId: string;
    scopeKind: WorkoutFeedbackScopeKind;
    scopeId: string;
    source: WorkoutFeedbackQuestionsSource;
    now: number;
  },
) {
  const existing = database
    .select()
    .from(workoutFeedbackQuestionLists)
    .where(
      and(
        eq(workoutFeedbackQuestionLists.userId, input.userId),
        eq(workoutFeedbackQuestionLists.scopeKind, input.scopeKind),
        eq(workoutFeedbackQuestionLists.scopeId, input.scopeId),
      ),
    )
    .limit(1)
    .get();
  if (existing) return existing;

  const list = {
    id: randomUUID(),
    userId: input.userId,
    scopeKind: input.scopeKind,
    scopeId: input.scopeId,
    currentRevision: 0,
    source: input.source,
    updatedAt: input.now,
  };
  database.insert(workoutFeedbackQuestionLists).values(list).run();
  return list;
}

function appendQuestionListRevision(
  database: FeedbackDatabase,
  input: {
    userId: string;
    scopeKind: WorkoutFeedbackScopeKind;
    scopeId: string;
    source: WorkoutFeedbackQuestionsSource;
    expectedRevision: number;
    definitions: WorkoutFeedbackQuestionDefinition[];
    actor: FeedbackMutationActor;
    now: number;
  },
): WorkoutFeedbackQuestionList {
  const list = findOrCreateList(database, input);
  if (list.currentRevision !== input.expectedRevision) {
    throw new WorkoutFeedbackRevisionConflictError(list.currentRevision);
  }

  const prior =
    list.currentRevision === 0
      ? undefined
      : database
          .select({ id: workoutFeedbackQuestionListRevisions.id })
          .from(workoutFeedbackQuestionListRevisions)
          .where(
            and(
              eq(workoutFeedbackQuestionListRevisions.listId, list.id),
              eq(workoutFeedbackQuestionListRevisions.revision, list.currentRevision),
            ),
          )
          .limit(1)
          .get();
  const nextRevision = list.currentRevision + 1;
  const listRevisionId = randomUUID();
  database
    .insert(workoutFeedbackQuestionListRevisions)
    .values({
      id: listRevisionId,
      listId: list.id,
      userId: input.userId,
      revision: nextRevision,
      priorRevisionId: prior?.id ?? null,
      source: input.source,
      actorKind: input.actor.kind,
      actorId: input.actor.id,
      actorName: input.actor.name,
      createdAt: input.now,
    })
    .run();
  if (input.definitions.length > 0) {
    database
      .insert(workoutFeedbackQuestionDefinitions)
      .values(
        input.definitions.map((definition, orderIndex) => ({
          id: randomUUID(),
          listRevisionId,
          userId: input.userId,
          questionId: definition.id,
          definitionVersion: definition.version,
          orderIndex,
          prompt: definition.prompt,
          type: definition.type,
          timing: definition.timing,
          definition,
        })),
      )
      .run();
  }
  database
    .update(workoutFeedbackQuestionLists)
    .set({ currentRevision: nextRevision, source: input.source, updatedAt: input.now })
    .where(eq(workoutFeedbackQuestionLists.id, list.id))
    .run();
  return { revision: nextRevision, source: input.source, questions: input.definitions };
}

export function writeAuthoredQuestionList(
  database: FeedbackDatabase,
  input: {
    userId: string;
    scopeKind: 'template' | 'scheduled';
    scopeId: string;
    source: 'template_defaults' | 'scheduled_override';
    expectedRevision: number;
    questions: WorkoutFeedbackQuestionInput[];
    actor: FeedbackMutationActor;
    now?: number;
  },
): WorkoutFeedbackQuestionList {
  const now = input.now ?? Date.now();
  const authoredAt = new Date(now).toISOString();
  const current = readQuestionList(database, input.userId, input.scopeKind, input.scopeId);
  if (current.revision !== input.expectedRevision) {
    throw new WorkoutFeedbackRevisionConflictError(current.revision);
  }
  const existingList = database
    .select({ id: workoutFeedbackQuestionLists.id })
    .from(workoutFeedbackQuestionLists)
    .where(
      and(
        eq(workoutFeedbackQuestionLists.userId, input.userId),
        eq(workoutFeedbackQuestionLists.scopeKind, input.scopeKind),
        eq(workoutFeedbackQuestionLists.scopeId, input.scopeId),
      ),
    )
    .limit(1)
    .get();
  const historicalDefinitions = existingList
    ? database
        .select({ definition: workoutFeedbackQuestionDefinitions.definition })
        .from(workoutFeedbackQuestionDefinitions)
        .innerJoin(
          workoutFeedbackQuestionListRevisions,
          eq(
            workoutFeedbackQuestionListRevisions.id,
            workoutFeedbackQuestionDefinitions.listRevisionId,
          ),
        )
        .where(eq(workoutFeedbackQuestionListRevisions.listId, existingList.id))
        .all()
        .map(({ definition }) => workoutFeedbackQuestionDefinitionSchema.parse(definition))
    : [];
  const priorById = new Map<string, WorkoutFeedbackQuestionDefinition>();
  for (const definition of historicalDefinitions) {
    const prior = priorById.get(definition.id);
    if (!prior || definition.version > prior.version) priorById.set(definition.id, definition);
  }
  const definitions = input.questions.map((rawQuestion) => {
    const question = workoutFeedbackQuestionInputSchema.parse(rawQuestion);
    const prior = priorById.get(question.id);
    return workoutFeedbackQuestionDefinitionSchema.parse({
      ...question,
      version: (prior?.version ?? 0) + 1,
      revisionId: randomUUID(),
      priorRevisionId: prior?.revisionId ?? null,
      sourceKind: input.actor.kind,
      sourceActorId: input.actor.id,
      sourceActorName: input.actor.name,
      authoredAt,
    });
  });
  return appendQuestionListRevision(database, { ...input, definitions, now });
}

export function materializeAuthoredQuestionDefinitions(
  questions: WorkoutFeedbackQuestionInput[],
  actor: FeedbackMutationActor,
  now = Date.now(),
): WorkoutFeedbackQuestionDefinition[] {
  const authoredAt = new Date(now).toISOString();
  return questions.map((rawQuestion) =>
    workoutFeedbackQuestionDefinitionSchema.parse({
      ...workoutFeedbackQuestionInputSchema.parse(rawQuestion),
      version: 1,
      revisionId: randomUUID(),
      priorRevisionId: null,
      sourceKind: actor.kind,
      sourceActorId: actor.id,
      sourceActorName: actor.name,
      authoredAt,
    }),
  );
}

export function writeFrozenQuestionList(
  database: FeedbackDatabase,
  input: {
    userId: string;
    scopeKind: 'scheduled' | 'session';
    scopeId: string;
    source: WorkoutFeedbackQuestionsSource;
    expectedRevision: number;
    definitions: WorkoutFeedbackQuestionDefinition[];
    actor: FeedbackMutationActor;
    now?: number;
  },
) {
  const definitions = input.definitions.map((definition) =>
    workoutFeedbackQuestionDefinitionSchema.parse(definition),
  );
  return appendQuestionListRevision(database, {
    ...input,
    definitions,
    now: input.now ?? Date.now(),
  });
}

export function freezeSessionQuestionList(
  database: FeedbackDatabase,
  input: {
    userId: string;
    sessionId: string;
    source: 'template_snapshot' | 'scheduled_override' | 'ad_hoc';
    additionalDefinitions: WorkoutFeedbackQuestionDefinition[];
    startedAt: number;
  },
) {
  const system = createSystemWorkoutFeedbackQuestions(new Date(input.startedAt).toISOString());
  return writeFrozenQuestionList(database, {
    userId: input.userId,
    scopeKind: 'session',
    scopeId: input.sessionId,
    source: input.source,
    expectedRevision: 0,
    definitions: [...system, ...input.additionalDefinitions],
    actor: { kind: 'system', id: null, name: null },
    now: input.startedAt,
  });
}

export function readAnswerSnapshot(
  database: FeedbackDatabase,
  userId: string,
  sessionId: string,
): WorkoutFeedbackAnswerSnapshot {
  const set = database
    .select()
    .from(workoutFeedbackAnswerSets)
    .where(
      and(
        eq(workoutFeedbackAnswerSets.userId, userId),
        eq(workoutFeedbackAnswerSets.sessionId, sessionId),
      ),
    )
    .limit(1)
    .get();
  if (!set) return { revision: 0, current: [], history: [] };
  const history = database
    .select({ answer: workoutFeedbackAnswerRevisions.answer })
    .from(workoutFeedbackAnswerRevisions)
    .where(eq(workoutFeedbackAnswerRevisions.answerSetId, set.id))
    .orderBy(
      asc(workoutFeedbackAnswerRevisions.questionId),
      asc(workoutFeedbackAnswerRevisions.definitionVersion),
      asc(workoutFeedbackAnswerRevisions.revision),
    )
    .all()
    .map(({ answer }) => workoutFeedbackAnswerRevisionSchema.parse(answer));
  const current = database
    .select({ answer: workoutFeedbackAnswerRevisions.answer })
    .from(workoutFeedbackAnswerCurrent)
    .innerJoin(
      workoutFeedbackAnswerRevisions,
      eq(workoutFeedbackAnswerRevisions.id, workoutFeedbackAnswerCurrent.responseRevisionId),
    )
    .where(eq(workoutFeedbackAnswerCurrent.answerSetId, set.id))
    .orderBy(asc(workoutFeedbackAnswerCurrent.questionId))
    .all()
    .map(({ answer }) => workoutFeedbackAnswerRevisionSchema.parse(answer));
  return {
    revision: set.currentRevision,
    current,
    history,
  };
}

export function writeAnswerRevisions(
  database: FeedbackDatabase,
  input: {
    userId: string;
    sessionId: string;
    expectedRevision: number;
    responses: WorkoutFeedbackAnswerInput[];
    actor: FeedbackMutationActor;
    now?: number;
  },
): WorkoutFeedbackAnswerSnapshot {
  const now = input.now ?? Date.now();
  const definitions = readQuestionList(
    database,
    input.userId,
    'session',
    input.sessionId,
  ).questions;
  const definitionByKey = new Map(
    definitions.map((definition) => [`${definition.id}\u0000${definition.version}`, definition]),
  );
  const seen = new Set<string>();
  const responses = input.responses.map((rawResponse) => {
    const key = `${rawResponse.questionId}\u0000${rawResponse.definitionVersion}`;
    if (seen.has(key))
      throw new WorkoutFeedbackValidationError('Duplicate feedback responses are not allowed.');
    seen.add(key);
    const definition = definitionByKey.get(key);
    if (!definition) {
      throw new WorkoutFeedbackValidationError(
        'Response references a question outside this frozen workout session.',
      );
    }
    return { definition, answer: validateWorkoutFeedbackAnswer(definition, rawResponse) };
  });

  const existingSet = database
    .select()
    .from(workoutFeedbackAnswerSets)
    .where(
      and(
        eq(workoutFeedbackAnswerSets.userId, input.userId),
        eq(workoutFeedbackAnswerSets.sessionId, input.sessionId),
      ),
    )
    .limit(1)
    .get();
  const currentRevision = existingSet?.currentRevision ?? 0;
  if (currentRevision !== input.expectedRevision) {
    throw new WorkoutFeedbackRevisionConflictError(currentRevision);
  }
  const answerSetId = existingSet?.id ?? randomUUID();
  if (!existingSet) {
    database
      .insert(workoutFeedbackAnswerSets)
      .values({
        id: answerSetId,
        userId: input.userId,
        sessionId: input.sessionId,
        currentRevision: 0,
        updatedAt: now,
      })
      .run();
  }

  for (const { definition, answer } of responses) {
    const current = database
      .select({
        rowId: workoutFeedbackAnswerRevisions.id,
        answer: workoutFeedbackAnswerRevisions.answer,
      })
      .from(workoutFeedbackAnswerCurrent)
      .innerJoin(
        workoutFeedbackAnswerRevisions,
        eq(workoutFeedbackAnswerRevisions.id, workoutFeedbackAnswerCurrent.responseRevisionId),
      )
      .where(
        and(
          eq(workoutFeedbackAnswerCurrent.answerSetId, answerSetId),
          eq(workoutFeedbackAnswerCurrent.questionId, definition.id),
          eq(workoutFeedbackAnswerCurrent.definitionVersion, definition.version),
        ),
      )
      .limit(1)
      .get();
    const prior = current ? workoutFeedbackAnswerRevisionSchema.parse(current.answer) : undefined;
    const rowId = randomUUID();
    const revision: WorkoutFeedbackAnswerRevision = workoutFeedbackAnswerRevisionSchema.parse({
      ...answer,
      responseId: prior?.responseId ?? randomUUID(),
      revision: (prior?.revision ?? 0) + 1,
      priorRevisionId: current?.rowId ?? null,
      answeredAt: new Date(now).toISOString(),
      timing: definition.timing,
      respondentSource:
        input.actor.kind === 'agent_token'
          ? 'agent_token'
          : input.actor.kind === 'user'
            ? 'user'
            : input.actor.kind === 'legacy_import'
              ? 'unknown'
              : 'other',
      respondentActorId: input.actor.id,
      exerciseIdSnapshot: definition.exerciseIdSnapshot,
      exerciseNameSnapshot: definition.exerciseNameSnapshot,
      bodyRegion: definition.bodyRegion,
      laterality: definition.laterality,
      concernRef: definition.concernRef,
      contextLabel: definition.contextLabel,
    });
    database
      .insert(workoutFeedbackAnswerRevisions)
      .values({
        id: rowId,
        answerSetId,
        userId: input.userId,
        sessionId: input.sessionId,
        responseId: revision.responseId,
        questionId: revision.questionId,
        definitionVersion: revision.definitionVersion,
        revision: revision.revision,
        priorRevisionId: revision.priorRevisionId,
        state: revision.state,
        timing: revision.timing,
        answer: revision,
        answeredAt: revision.answeredAt,
        createdAt: now,
      })
      .run();
    database
      .insert(workoutFeedbackAnswerCurrent)
      .values({
        answerSetId,
        userId: input.userId,
        sessionId: input.sessionId,
        questionId: revision.questionId,
        definitionVersion: revision.definitionVersion,
        responseRevisionId: rowId,
        revision: revision.revision,
      })
      .onConflictDoUpdate({
        target: [
          workoutFeedbackAnswerCurrent.answerSetId,
          workoutFeedbackAnswerCurrent.questionId,
          workoutFeedbackAnswerCurrent.definitionVersion,
        ],
        set: { responseRevisionId: rowId, revision: revision.revision },
      })
      .run();
  }
  database
    .update(workoutFeedbackAnswerSets)
    .set({ currentRevision: currentRevision + 1, updatedAt: now })
    .where(eq(workoutFeedbackAnswerSets.id, answerSetId))
    .run();
  return readAnswerSnapshot(database, input.userId, input.sessionId);
}
