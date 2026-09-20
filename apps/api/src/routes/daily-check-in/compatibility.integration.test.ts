import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DailyCheckInDetail } from '@pulse/shared';

const migrationsFolder = fileURLToPath(new URL('../../../drizzle', import.meta.url));
const originalUrl = process.env.DATABASE_URL;
const originalNow = process.env.PULSE_TEST_NOW;
let directory = '';
let database: typeof import('../../db/index.js');
const inputSource = {
  class: 'user_observation',
  sourceId: 'fictional-compatibility-source',
  sourceLabel: 'Fictional compatibility source',
  sourceOccurredAt: '2026-09-20T15:00:00.000Z',
  uncertainty: 'known',
  freshness: { state: 'current', asOf: '2026-09-20T15:00:00.000Z', reasons: [] },
};
const storedSource = {
  ...inputSource,
  capturedAt: '2026-09-20T15:01:00.000Z',
  capturedBy: { kind: 'agent_token', id: 'agent-a', label: 'a' },
};

const stable = (value: unknown): unknown =>
  Array.isArray(value)
    ? value.map(stable)
    : value && typeof value === 'object'
      ? Object.fromEntries(
          Object.entries(value as Record<string, unknown>)
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([key, item]) => [key, stable(item)]),
        )
      : value;
const sha256 = (value: unknown) =>
  createHash('sha256')
    .update(JSON.stringify(stable(value)))
    .digest('hex');

type SourceReference = { kind: 'body_concern'; id: string; revisionId: string };
type QuestionHistoryEntry = DailyCheckInDetail['questionHistory'][number];
type ReceiptDetail = Omit<DailyCheckInDetail, 'questionHistory'> & {
  questionHistory: Array<
    Omit<QuestionHistoryEntry, 'recordedAt'> & { recordedAt?: QuestionHistoryEntry['recordedAt'] }
  >;
};
type AnswerSnapshot = NonNullable<ReceiptDetail['currentAnswer']>;

const withoutRecordedAt = (value: ReceiptDetail): ReceiptDetail => {
  const copy = structuredClone(value);
  for (const revision of copy.questionHistory) delete revision.recordedAt;
  return copy;
};
const mutateCurrentAnswer = (
  value: ReceiptDetail,
  mutate: (answer: AnswerSnapshot) => void,
): ReceiptDetail => {
  const copy = structuredClone(value);
  const current = copy.currentAnswer;
  const historical = copy.answerHistory.at(-1);
  if (!current || !historical) throw new Error('Expected a receipt with an answer.');
  mutate(current);
  mutate(historical);
  return copy;
};

describe('daily check-in canonical and receipt compatibility', () => {
  beforeEach(async () => {
    directory = mkdtempSync(join(tmpdir(), 'pulse-daily-compatibility-'));
    process.env.DATABASE_URL = join(directory, 'test.db');
    process.env.JWT_SECRET = 'fictional-compatibility-secret';
    process.env.PULSE_TEST_NOW = '2026-09-20T16:00:00.000Z';
    vi.resetModules();
    database = await import('../../db/index.js');
    migrate(database.db, { migrationsFolder });
    database.sqlite.exec(`
      insert into users (id,username,password_hash,preferences)
        values ('owner','owner','x','{"timeZone":"America/Detroit"}');
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
    const insertConcern = database.sqlite.prepare(
      'insert into body_context_concerns (id,user_id,label,body_region,symptom_state,management_state,source_json,revision,current_revision_id,created_at,updated_at) values (?,?,?,?,?,?,?,?,?,?,?)',
    );
    for (const [id, revisionId, label] of [
      ['a:b', 'c', 'Fictional colon source A'],
      ['a', 'b:c', 'Fictional colon source B'],
      ['quote:"slash\\id', 'rev:"\\one', 'Fictional escaped source'],
    ])
      insertConcern.run(
        id,
        'owner',
        label,
        'other',
        'unknown',
        'monitoring',
        JSON.stringify(storedSource),
        1,
        revisionId,
        '2026-09-20T15:00:00.000Z',
        '2026-09-20T15:00:00.000Z',
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

  it('uses structured source tuples while resuming exact predecessor identities without collision', async () => {
    const { buildServer } = await import('../../index.js');
    const app = buildServer();
    await app.ready();
    const referenceA: SourceReference = { kind: 'body_concern', id: 'a:b', revisionId: 'c' };
    const referenceB: SourceReference = { kind: 'body_concern', id: 'a', revisionId: 'b:c' };
    const escapedReference: SourceReference = {
      kind: 'body_concern',
      id: 'quote:"slash\\id',
      revisionId: 'rev:"\\one',
    };
    expect(`${referenceA.kind}:${referenceA.id}:${referenceA.revisionId}`).toBe(
      `${referenceB.kind}:${referenceB.id}:${referenceB.revisionId}`,
    );
    const base = {
      localDate: '2026-09-20',
      semanticTopic: 'delimiter compatibility',
      prompt: 'What does the fictional delimiter source say?',
      followUpQuestionId: null,
    };
    const create = (sourceReferences: SourceReference[], idempotencyKey: string) =>
      app.inject({
        method: 'POST',
        url: '/api/v1/check-in/questions',
        headers: { authorization: 'AgentToken a-secret' },
        payload: { ...base, sourceReferences, idempotencyKey },
      });

    const predecessor = await create([referenceA], 'compatibility-predecessor-create');
    expect(predecessor.statusCode, predecessor.body).toBe(201);
    const predecessorId = predecessor.json().data.question.questionId as string;
    const oldDeduplicationKey = sha256({
      localDate: base.localDate,
      timeZone: 'America/Detroit',
      semanticTopic: base.semanticTopic,
      sourceReferences: [`${referenceA.kind}:${referenceA.id}:${referenceA.revisionId}`],
      followUpQuestionId: null,
    });
    database.sqlite
      .prepare('update daily_check_in_questions set deduplication_key=? where id=?')
      .run(oldDeduplicationKey, predecessorId);
    const predecessorRevision = database.sqlite
      .prepare(
        'select id,snapshot_json as snapshotJson from daily_check_in_question_revisions where question_id=?',
      )
      .get(predecessorId) as { id: string; snapshotJson: string };
    const predecessorSnapshot = JSON.parse(predecessorRevision.snapshotJson) as Record<
      string,
      unknown
    >;
    predecessorSnapshot.deduplicationKey = oldDeduplicationKey;
    database.sqlite
      .prepare('update daily_check_in_question_revisions set snapshot_json=? where id=?')
      .run(JSON.stringify(predecessorSnapshot), predecessorRevision.id);

    const collisionPeer = await create([referenceB], 'compatibility-collision-peer');
    expect(collisionPeer.statusCode, collisionPeer.body).toBe(201);
    const collisionPeerId = collisionPeer.json().data.question.questionId as string;
    expect(collisionPeerId).not.toBe(predecessorId);

    const resumedPredecessor = await create(
      [referenceA, referenceA],
      'compatibility-predecessor-fresh-key',
    );
    expect(resumedPredecessor.statusCode, resumedPredecessor.body).toBe(201);
    expect(resumedPredecessor.json().data.question).toMatchObject({
      questionId: predecessorId,
      deduplicationKey: oldDeduplicationKey,
      sourceReferences: [{ id: 'a:b', revisionId: 'c' }],
    });

    const escapedSet = await create(
      [escapedReference, referenceA, referenceA],
      'compatibility-escaped-set',
    );
    expect(escapedSet.statusCode, escapedSet.body).toBe(201);
    const escapedSetId = escapedSet.json().data.question.questionId as string;
    const reorderedEscapedSet = await create(
      [referenceA, escapedReference],
      'compatibility-escaped-set-reordered',
    );
    expect(reorderedEscapedSet.statusCode, reorderedEscapedSet.body).toBe(201);
    expect(reorderedEscapedSet.json().data.question.questionId).toBe(escapedSetId);
    expect(reorderedEscapedSet.json().data.question.sourceReferences).toEqual(
      escapedSet.json().data.question.sourceReferences,
    );
    const escapedOnly = await create([escapedReference], 'compatibility-escaped-only');
    expect(escapedOnly.statusCode, escapedOnly.body).toBe(201);
    expect(escapedOnly.json().data.question.questionId).not.toBe(escapedSetId);

    const staleAlternate = await create(
      [referenceA, { ...referenceA, revisionId: 'stale:c' }],
      'compatibility-stale-alternate',
    );
    expect(staleAlternate.statusCode).toBe(404);
    expect(staleAlternate.json().error.code).toBe('OWNED_LINK_NOT_FOUND');

    const exactPayload = await create(
      [referenceA, escapedReference],
      'compatibility-exact-payload',
    );
    expect(exactPayload.statusCode, exactPayload.body).toBe(201);
    const alteredPayload = await create(
      [escapedReference, referenceA],
      'compatibility-exact-payload',
    );
    expect(alteredPayload.statusCode).toBe(409);
    expect(alteredPayload.json().error.code).toBe('IDEMPOTENCY_KEY_REUSE');

    expect(
      database.sqlite
        .prepare(
          'select count(*) as count from daily_check_in_question_revisions where question_id=?',
        )
        .get(predecessorId),
    ).toEqual({ count: 1 });
    expect(
      database.sqlite.prepare('select count(*) as count from daily_check_in_questions').get(),
    ).toEqual({ count: 4 });
    await app.close();
  });

  it('hydrates old create, answer, and correction receipts without replacing their snapshots', async () => {
    let { buildServer } = await import('../../index.js');
    let app = buildServer();
    await app.ready();
    const reference: SourceReference = { kind: 'body_concern', id: 'a:b', revisionId: 'c' };
    const createPayload = {
      localDate: '2026-09-20',
      semanticTopic: 'legacy receipt compatibility',
      prompt: 'What fictional legacy receipt should be preserved?',
      sourceReferences: [reference],
      followUpQuestionId: null,
      idempotencyKey: 'legacy-create-receipt',
    };
    const create = await app.inject({
      method: 'POST',
      url: '/api/v1/check-in/questions',
      headers: { authorization: 'AgentToken a-secret' },
      payload: createPayload,
    });
    expect(create.statusCode, create.body).toBe(201);
    const questionId = create.json().data.question.questionId as string;
    const createOldShape = withoutRecordedAt(create.json().data as ReceiptDetail);

    process.env.PULSE_TEST_NOW = '2026-09-20T17:00:00.000Z';
    const answerPayload = {
      expectedQuestionRevisionId: create.json().data.question.id,
      expectedAnswerRevision: 0,
      state: 'answered',
      value: 'Fictional original answer.',
      source: inputSource,
      idempotencyKey: 'legacy-answer-receipt',
    };
    const answer = await app.inject({
      method: 'POST',
      url: `/api/v1/check-in/questions/${questionId}/answers`,
      headers: { authorization: 'AgentToken a-secret' },
      payload: answerPayload,
    });
    expect(answer.statusCode, answer.body).toBe(201);
    const answerId = answer.json().data.currentAnswer.answerId as string;
    const answerOldShape = withoutRecordedAt(answer.json().data as ReceiptDetail);

    process.env.PULSE_TEST_NOW = '2026-09-20T18:00:00.000Z';
    const correctionPayload = {
      expectedQuestionRevisionId: answer.json().data.question.id,
      expectedAnswerRevision: 1,
      state: 'answered',
      value: 'Fictional first correction.',
      reason: 'First fictional clarification.',
      source: inputSource,
      idempotencyKey: 'legacy-correction-receipt',
    };
    const correction = await app.inject({
      method: 'POST',
      url: `/api/v1/check-in/answers/${answerId}/corrections`,
      headers: { authorization: 'AgentToken b-secret' },
      payload: correctionPayload,
    });
    expect(correction.statusCode, correction.body).toBe(200);
    const correctionOldShape = withoutRecordedAt(correction.json().data as ReceiptDetail);

    const writeReceipt = (key: string, response: ReceiptDetail) =>
      database.sqlite
        .prepare(
          'update daily_check_in_idempotency_receipts set response_json=? where idempotency_key=?',
        )
        .run(JSON.stringify(response), key);
    writeReceipt(createPayload.idempotencyKey, createOldShape);
    writeReceipt(answerPayload.idempotencyKey, answerOldShape);
    writeReceipt(correctionPayload.idempotencyKey, correctionOldShape);

    process.env.PULSE_TEST_NOW = '2026-09-20T19:00:00.000Z';
    const laterCorrection = await app.inject({
      method: 'POST',
      url: `/api/v1/check-in/answers/${answerId}/corrections`,
      headers: { authorization: 'AgentToken a-secret' },
      payload: {
        ...correctionPayload,
        expectedAnswerRevision: 2,
        value: 'Fictional later correction that old receipts must not expose.',
        reason: 'Later fictional clarification.',
        idempotencyKey: 'later-correction-receipt',
      },
    });
    expect(laterCorrection.statusCode, laterCorrection.body).toBe(200);
    expect(laterCorrection.json().data.currentAnswer.revision).toBe(3);

    await app.close();
    database.sqlite.close();
    vi.resetModules();
    database = await import('../../db/index.js');
    ({ buildServer } = await import('../../index.js'));
    app = buildServer();
    await app.ready();

    const replayCreate = await app.inject({
      method: 'POST',
      url: '/api/v1/check-in/questions',
      headers: { authorization: 'AgentToken a-secret' },
      payload: createPayload,
    });
    expect(replayCreate.statusCode, replayCreate.body).toBe(201);
    expect(replayCreate.headers['idempotent-replay']).toBe('true');
    expect(withoutRecordedAt(replayCreate.json().data as ReceiptDetail)).toEqual(createOldShape);
    expect(replayCreate.json().data).toMatchObject({
      question: { state: 'pending' },
      questionHistory: [{ recordedAt: '2026-09-20T16:00:00.000Z' }],
      currentAnswer: null,
      answerHistory: [],
    });

    const replayAnswer = await app.inject({
      method: 'POST',
      url: `/api/v1/check-in/questions/${questionId}/answers`,
      headers: { authorization: 'AgentToken a-secret' },
      payload: answerPayload,
    });
    expect(replayAnswer.statusCode, replayAnswer.body).toBe(201);
    expect(replayAnswer.headers['idempotent-replay']).toBe('true');
    expect(withoutRecordedAt(replayAnswer.json().data as ReceiptDetail)).toEqual(answerOldShape);
    expect(replayAnswer.json().data).toMatchObject({
      currentAnswer: { revision: 1 },
      answerHistory: [{ revision: 1 }],
      questionHistory: [
        { recordedAt: '2026-09-20T16:00:00.000Z' },
        { recordedAt: '2026-09-20T17:00:00.000Z' },
      ],
    });

    const replayCorrection = await app.inject({
      method: 'POST',
      url: `/api/v1/check-in/answers/${answerId}/corrections`,
      headers: { authorization: 'AgentToken b-secret' },
      payload: correctionPayload,
    });
    expect(replayCorrection.statusCode, replayCorrection.body).toBe(200);
    expect(replayCorrection.headers['idempotent-replay']).toBe('true');
    expect(withoutRecordedAt(replayCorrection.json().data as ReceiptDetail)).toEqual(
      correctionOldShape,
    );
    expect(replayCorrection.json().data).toMatchObject({
      currentAnswer: { revision: 2 },
      answerHistory: [{ revision: 1 }, { revision: 2 }],
    });

    for (const [url, payload] of [
      ['/api/v1/check-in/questions', { ...createPayload, prompt: 'Changed exact payload.' }],
      [
        `/api/v1/check-in/questions/${questionId}/answers`,
        { ...answerPayload, value: 'Changed exact payload.' },
      ],
      [
        `/api/v1/check-in/answers/${answerId}/corrections`,
        { ...correctionPayload, reason: 'Changed exact payload.' },
      ],
    ] as const) {
      const conflict = await app.inject({
        method: 'POST',
        url,
        headers: { authorization: 'AgentToken a-secret' },
        payload,
      });
      expect(conflict.statusCode).toBe(409);
      expect(conflict.json().error.code).toBe('IDEMPOTENCY_KEY_REUSE');
    }

    const current = await app.inject({
      method: 'GET',
      url: `/api/v1/check-in/questions/${questionId}`,
      headers: { authorization: 'AgentToken a-secret' },
    });
    expect(current.statusCode, current.body).toBe(200);
    expect(current.json().data.currentAnswer.revision).toBe(3);

    const rejectAnswerReceipt = async (response: ReceiptDetail) => {
      writeReceipt(answerPayload.idempotencyKey, response);
      const rejected = await app.inject({
        method: 'POST',
        url: `/api/v1/check-in/questions/${questionId}/answers`,
        headers: { authorization: 'AgentToken a-secret' },
        payload: answerPayload,
      });
      expect(rejected.statusCode, rejected.body).toBe(400);
      expect(rejected.json()).toEqual({
        error: {
          code: 'CHECK_IN_RECEIPT_INVALID',
          message: 'The stored check-in receipt could not be verified.',
        },
      });
    };
    const answerCorruptions: Array<[string, (answer: AnswerSnapshot) => void]> = [
      ['foreign subject', (answer) => (answer.subjectUserId = 'foreign-owner')],
      ['foreign answer', (answer) => (answer.answerId = 'foreign-answer')],
      ['foreign question', (answer) => (answer.questionId = 'foreign-question')],
      ['foreign answer revision', (answer) => (answer.id = 'foreign-answer-revision')],
      [
        'wrong question revision association',
        (answer) => (answer.questionRevisionId = createOldShape.question.id),
      ],
      ['forged value', (answer) => (answer.value = 'Schema-valid forged value.')],
      [
        'forged state',
        (answer) => {
          answer.state = 'unknown';
          delete answer.value;
        },
      ],
      ['forged source', (answer) => (answer.source.sourceId = 'forged-source')],
      ['forged actor', (answer) => (answer.recordedBy.id = 'forged-actor')],
      ['forged reason', (answer) => (answer.correctionReason = 'Forged reason.')],
      ['forged time', (answer) => (answer.answeredAt = '2026-09-20T17:00:01.000Z')],
    ];
    for (const [, mutate] of answerCorruptions)
      await rejectAnswerReceipt(mutateCurrentAnswer(answerOldShape, mutate));

    const strictShapeCorruption = mutateCurrentAnswer(
      answer.json().data as ReceiptDetail,
      (snapshot) => (snapshot.value = 'Strict-shape forged value.'),
    );
    await rejectAnswerReceipt(strictShapeCorruption);

    const reorderedQuestionHistory = structuredClone(answerOldShape);
    reorderedQuestionHistory.questionHistory.reverse();
    const reorderedCurrentQuestion = reorderedQuestionHistory.questionHistory.at(-1);
    if (!reorderedCurrentQuestion) throw new Error('Expected question history.');
    reorderedQuestionHistory.question = structuredClone(reorderedCurrentQuestion.revision);
    await rejectAnswerReceipt(reorderedQuestionHistory);

    const missingQuestionHistory = structuredClone(answerOldShape);
    missingQuestionHistory.questionHistory = missingQuestionHistory.questionHistory.slice(1);
    await rejectAnswerReceipt(missingQuestionHistory);

    const duplicateQuestionHistory = structuredClone(answerOldShape);
    duplicateQuestionHistory.questionHistory = [
      duplicateQuestionHistory.questionHistory[0],
      structuredClone(duplicateQuestionHistory.questionHistory[0]),
    ];
    duplicateQuestionHistory.question = structuredClone(
      duplicateQuestionHistory.questionHistory[1].revision,
    );
    await rejectAnswerReceipt(duplicateQuestionHistory);

    const rejectCorrectionReceipt = async (response: ReceiptDetail) => {
      writeReceipt(correctionPayload.idempotencyKey, response);
      const rejected = await app.inject({
        method: 'POST',
        url: `/api/v1/check-in/answers/${answerId}/corrections`,
        headers: { authorization: 'AgentToken b-secret' },
        payload: correctionPayload,
      });
      expect(rejected.statusCode, rejected.body).toBe(400);
      expect(rejected.json().error.code).toBe('CHECK_IN_RECEIPT_INVALID');
    };
    const reorderedHistory = structuredClone(correctionOldShape);
    reorderedHistory.answerHistory.reverse();
    const reorderedCurrentAnswer = reorderedHistory.answerHistory.at(-1);
    if (!reorderedCurrentAnswer) throw new Error('Expected answer history.');
    reorderedHistory.currentAnswer = structuredClone(reorderedCurrentAnswer);
    await rejectCorrectionReceipt(reorderedHistory);

    const missingLeadingHistory = structuredClone(correctionOldShape);
    missingLeadingHistory.answerHistory = missingLeadingHistory.answerHistory.slice(1);
    await rejectCorrectionReceipt(missingLeadingHistory);

    const missingLatestHistory = structuredClone(correctionOldShape);
    missingLatestHistory.answerHistory = missingLatestHistory.answerHistory.slice(0, 1);
    missingLatestHistory.currentAnswer = structuredClone(missingLatestHistory.answerHistory[0]);
    await rejectCorrectionReceipt(missingLatestHistory);

    const duplicateHistory = structuredClone(correctionOldShape);
    duplicateHistory.answerHistory = [
      duplicateHistory.answerHistory[0],
      structuredClone(duplicateHistory.answerHistory[0]),
    ];
    duplicateHistory.currentAnswer = structuredClone(duplicateHistory.answerHistory[1]);
    await rejectCorrectionReceipt(duplicateHistory);

    const inconsistentCurrent = structuredClone(correctionOldShape);
    inconsistentCurrent.currentAnswer = structuredClone(inconsistentCurrent.answerHistory[0]);
    await rejectCorrectionReceipt(inconsistentCurrent);

    const missingCurrent = structuredClone(correctionOldShape);
    missingCurrent.currentAnswer = null;
    await rejectCorrectionReceipt(missingCurrent);

    const foreignQuestionRevision = structuredClone(createOldShape);
    foreignQuestionRevision.questionHistory[0].revision.id = 'missing-owned-revision';
    writeReceipt(createPayload.idempotencyKey, foreignQuestionRevision);
    const rejectedInvalidReceipt = await app.inject({
      method: 'POST',
      url: '/api/v1/check-in/questions',
      headers: { authorization: 'AgentToken a-secret' },
      payload: createPayload,
    });
    expect(rejectedInvalidReceipt.statusCode).toBe(400);
    expect(rejectedInvalidReceipt.json().error.code).toBe('CHECK_IN_RECEIPT_INVALID');
    await app.close();
  });
});
