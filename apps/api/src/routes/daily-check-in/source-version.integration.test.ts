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
const source = {
  class: 'user_observation',
  sourceId: 'fictional-source-version',
  sourceLabel: 'Fictional source version fixture',
  sourceOccurredAt: '2026-09-20T12:00:00.000Z',
  capturedAt: '2026-09-20T12:01:00.000Z',
  capturedBy: actor,
  uncertainty: 'known',
  freshness: { state: 'current', asOf: '2026-09-20T12:00:00.000Z', reasons: [] },
};

describe('daily check-in source version authority', () => {
  beforeEach(async () => {
    directory = mkdtempSync(join(tmpdir(), 'pulse-daily-source-version-'));
    process.env.DATABASE_URL = join(directory, 'test.db');
    process.env.JWT_SECRET = 'fictional-source-version-secret';
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
        'agent-foreign',
        'foreign',
        'foreign',
        createHash('sha256').update('foreign-secret').digest('hex'),
      );
    database.sqlite
      .prepare(
        "insert into canonical_activities (id,user_id,kind,name,structured_workout_session_id,source_json,actor_json,revision,current_revision_id,created_at,updated_at) values ('activity','owner','walking','Fictional walk',null,?,?,1,'activity-r1','2026-09-20T12:00:00.000Z','2026-09-20T12:00:00.000Z')",
      )
      .run(JSON.stringify(source), JSON.stringify(actor));
    database.sqlite.exec(`
      insert into activity_goals (id,user_id,kind,label,state,revision,created_at,updated_at)
        values ('goal','owner','conditioning','Initial goal','active',1,'2026-09-20T12:00:00.000Z','2026-09-20T12:00:00.000Z');
      insert into activity_goal_links (activity_id,goal_id,user_id,created_at)
        values ('activity','goal','owner','2026-09-20T12:00:00.000Z');
      insert into activity_recurrences (id,activity_id,user_id,current_revision_id,created_at)
        values ('recurrence','activity','owner','recurrence-r1','2026-09-20T12:00:00.000Z');
      insert into activity_recurrence_revisions (id,recurrence_id,user_id,sequence,prior_revision_id,effective_from_local_date,time_zone,frequency,interval,weekdays_json,assignment_policy,actor_json,created_at)
        values ('recurrence-r1','recurrence','owner',1,null,'2026-09-20','America/Detroit','weekly',1,'[0]','unassigned_on_or_after_effective_date','{"kind":"agent_token","id":"agent-a","label":"a"}','2026-09-20T12:00:00.000Z');
      insert into activity_assignments (id,user_id,activity_id,recurrence_id,planned_local_date,time_zone,recurrence_revision_id,revision,current_revision_id,state,created_at,updated_at)
        values ('assignment','owner','activity','recurrence','2026-09-20','America/Detroit','recurrence-r1',1,'assignment-r1','planned','2026-09-20T12:00:00.000Z','2026-09-20T12:00:00.000Z');
      insert into activity_assignment_revisions (id,assignment_id,user_id,revision,prior_revision_id,planned_local_date,time_zone,recurrence_revision_id,state,reason,actor_json,created_at)
        values ('assignment-r1','assignment','owner',1,null,'2026-09-20','America/Detroit','recurrence-r1','planned',null,'{"kind":"agent_token","id":"agent-a","label":"a"}','2026-09-20T12:00:00.000Z');
      insert into activity_executions (id,user_id,activity_id,assignment_id,actual_occurred_at,actual_local_date,time_zone,duration_minutes,outcome,structured_workout_session_id,source_json,revision,current_revision_id,created_at,updated_at)
        values ('execution','owner','activity','assignment','2026-09-20T12:00:00.000Z','2026-09-20','America/Detroit',30,'completed',null,'{"class":"user_observation","sourceId":"execution-source","sourceLabel":"Fictional execution","sourceOccurredAt":"2026-09-20T12:00:00.000Z","capturedAt":"2026-09-20T12:01:00.000Z","capturedBy":{"kind":"agent_token","id":"agent-a","label":"a"},"uncertainty":"known","freshness":{"state":"current","asOf":"2026-09-20T12:00:00.000Z","reasons":[]}}',1,'execution-r1','2026-09-20T12:01:00.000Z','2026-09-20T12:01:00.000Z');
      insert into body_context_concerns (id,user_id,label,body_region,symptom_state,management_state,source_json,revision,current_revision_id,created_at,updated_at)
        values ('concern','owner','Fictional concern',null,'unknown','monitoring','{"class":"user_observation","sourceId":"body-source","sourceLabel":"Fictional body source","sourceOccurredAt":"2026-09-20T12:00:00.000Z","capturedAt":"2026-09-20T12:01:00.000Z","capturedBy":{"kind":"agent_token","id":"agent-a","label":"a"},"uncertainty":"known","freshness":{"state":"current","asOf":"2026-09-20T12:00:00.000Z","reasons":[]}}',1,'concern-r1','2026-09-20T12:00:00.000Z','2026-09-20T12:00:00.000Z');
      insert into body_context_capabilities (id,user_id,label,state,source_json,revision,current_revision_id,created_at,updated_at)
        values ('capability','owner','Fictional capability','unknown','{"class":"user_observation","sourceId":"body-source","sourceLabel":"Fictional body source","sourceOccurredAt":"2026-09-20T12:00:00.000Z","capturedAt":"2026-09-20T12:01:00.000Z","capturedBy":{"kind":"agent_token","id":"agent-a","label":"a"},"uncertainty":"known","freshness":{"state":"current","asOf":"2026-09-20T12:00:00.000Z","reasons":[]}}',1,'capability-r1','2026-09-20T12:00:00.000Z','2026-09-20T12:00:00.000Z');
      insert into body_context_guidance (id,user_id,concern_id,capability_id,text,source_json,state,revision,current_revision_id,created_at,updated_at)
        values ('guidance','owner','concern','capability','Fictional guidance','{"class":"user_observation","sourceId":"body-source","sourceLabel":"Fictional body source","sourceOccurredAt":"2026-09-20T12:00:00.000Z","capturedAt":"2026-09-20T12:01:00.000Z","capturedBy":{"kind":"agent_token","id":"agent-a","label":"a"},"uncertainty":"known","freshness":{"state":"current","asOf":"2026-09-20T12:00:00.000Z","reasons":[]}}','current',1,'guidance-r1','2026-09-20T12:00:00.000Z','2026-09-20T12:00:00.000Z');
      insert into body_context_flares (id,concern_id,user_id,occurred_at,local_date,time_zone,observation,source_json,created_at)
        values ('observation','concern','owner','2026-09-20T12:00:00.000Z','2026-09-20','America/Detroit','Fictional observation','{"class":"user_observation","sourceId":"body-source","sourceLabel":"Fictional body source","sourceOccurredAt":"2026-09-20T12:00:00.000Z","capturedAt":"2026-09-20T12:01:00.000Z","capturedBy":{"kind":"agent_token","id":"agent-a","label":"a"},"uncertainty":"known","freshness":{"state":"current","asOf":"2026-09-20T12:00:00.000Z","reasons":[]}}','2026-09-20T12:01:00.000Z');
      insert into plan_change_proposals (id,user_id,state,revision,current_revision_id,summary,targets_json,effects_json,source_references_json,target_revision_fingerprint,proposed_by_json,proposed_at,approval_json,execution_json,created_at,updated_at)
        values ('proposal','owner','proposed',1,'proposal-r1','Fictional proposal','[]','[]','[]','fingerprint','{"kind":"agent_token","id":"agent-a","label":"a"}','2026-09-20T12:00:00.000Z',null,null,'2026-09-20T12:00:00.000Z','2026-09-20T12:00:00.000Z');
      insert into nutrition_logs (id,user_id,date,notes,status,created_at,updated_at)
        values ('nutrition','owner','2026-09-20',null,'partial',1000,1000);
      insert into meals (id,nutrition_log_id,name,summary,time,notes,created_at,updated_at)
        values ('meal','nutrition','Breakfast',null,'08:00',null,1000,1000);
      insert into meal_items (id,meal_id,food_id,name,amount,unit,calories,protein,carbs,fat,created_at)
        values ('item-1','meal',null,'Oats',1,'serving',300,10,50,6,1000);
      insert into workout_sessions (id,user_id,template_id,scheduled_workout_id,name,date,status,started_at,completed_at,duration,time_segments,deleted_at,created_at,updated_at)
        values
          ('session','owner',null,null,'Active workout','2026-09-20','in-progress',1000,null,null,'[]',null,1000,1000),
          ('deleted-session','owner',null,null,'Deleted workout','2026-09-20','in-progress',1000,null,null,'[]','2026-09-20T12:00:00.000Z',1000,1000),
          ('foreign-session','foreign',null,null,'Foreign workout','2026-09-20','in-progress',1000,null,null,'[]',null,1000,1000);
      insert into scheduled_workouts (id,user_id,template_id,template_version,date,session_id,created_at,updated_at)
        values ('schedule','owner',null,'v1','2026-09-20',null,1000,1000);
    `);
  });

  afterEach(() => {
    database.sqlite.close();
    process.env.DATABASE_URL = originalUrl;
    process.env.PULSE_TEST_NOW = originalNow;
    delete process.env.JWT_SECRET;
    rmSync(directory, { recursive: true, force: true });
    vi.resetModules();
  });

  it('changes canonical identity for relevant mutable facts and rejects stale, missing, wrong-kind, foreign, and deleted sources', async () => {
    const { buildServer } = await import('../../index.js');
    const app = buildServer();
    await app.ready();
    const readReferences = async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/daily-context?date=2026-09-20',
        headers: { authorization: 'AgentToken a-secret' },
      });
      expect(response.statusCode).toBe(200);
      return response.json().data.sourceReferences as Array<{
        kind: string;
        id: string;
        revisionId: string;
      }>;
    };
    const findReference = (
      references: Array<{ kind: string; id: string; revisionId: string }>,
      kind: string,
      id: string,
    ) => references.find((reference) => reference.kind === kind && reference.id === id);
    const requireReference = (
      references: Array<{ kind: string; id: string; revisionId: string }>,
      kind: string,
      id: string,
    ) => {
      const reference = findReference(references, kind, id);
      if (!reference) throw new Error(`Missing ${kind}:${id} source reference`);
      return reference;
    };
    const create = (
      semanticTopic: string,
      reference: { kind: string; id: string; revisionId: string },
      idempotencyKey: string,
    ) =>
      app.inject({
        method: 'POST',
        url: '/api/v1/check-in/questions',
        headers: { authorization: 'AgentToken a-secret' },
        payload: {
          localDate: '2026-09-20',
          semanticTopic,
          prompt: `Fictional question about ${semanticTopic}?`,
          sourceReferences: [
            { kind: reference.kind, id: reference.id, revisionId: reference.revisionId },
          ],
          followUpQuestionId: null,
          idempotencyKey,
        },
      });

    const firstReferences = await readReferences();
    const goalV1 = requireReference(firstReferences, 'activity_goal', 'goal');
    const nutritionV1 = requireReference(firstReferences, 'nutrition_log', 'nutrition');
    const mealV1 = requireReference(firstReferences, 'meal', 'meal');
    const sessionV1 = requireReference(firstReferences, 'workout_session', 'session');
    const scheduleV1 = requireReference(firstReferences, 'scheduled_workout', 'schedule');
    const initialGoalQuestion = await create('goal state', goalV1, 'goal-v1-question');
    const initialNutritionQuestion = await create(
      'nutrition completeness',
      nutritionV1,
      'nutrition-v1-question',
    );
    const initialMealQuestion = await create('meal completeness', mealV1, 'meal-v1-question');
    const initialSessionQuestion = await create(
      'workout progress',
      sessionV1,
      'session-v1-question',
    );
    const initialScheduleQuestion = await create(
      'workout plan',
      scheduleV1,
      'schedule-v1-question',
    );
    expect(initialGoalQuestion.statusCode).toBe(201);
    expect(initialNutritionQuestion.statusCode).toBe(201);
    expect(initialMealQuestion.statusCode).toBe(201);
    expect(initialSessionQuestion.statusCode).toBe(201);
    expect(initialScheduleQuestion.statusCode).toBe(201);
    const unchangedGoalQuestion = await create('goal state', goalV1, 'goal-v1-question-again');
    expect(unchangedGoalQuestion.statusCode).toBe(201);
    expect(unchangedGoalQuestion.json().data.question.questionId).toBe(
      initialGoalQuestion.json().data.question.questionId,
    );

    database.sqlite.exec(`
      update activity_goals set label='Changed goal',revision=2,updated_at='2026-09-20T13:00:00.000Z' where id='goal';
      insert into meal_items (id,meal_id,food_id,name,amount,unit,calories,protein,carbs,fat,created_at)
        values ('item-2','meal',null,'Berries',1,'serving',80,1,20,0,2000);
      insert into session_sets (id,session_id,exercise_id,order_index,set_number,completed,skipped,section,created_at)
        values ('set-1','session',null,0,1,0,0,'main',2000);
      update scheduled_workouts set template_version='v2',updated_at=2000 where id='schedule';
    `);
    const secondReferences = await readReferences();
    const goalV2 = requireReference(secondReferences, 'activity_goal', 'goal');
    const nutritionV2 = requireReference(secondReferences, 'nutrition_log', 'nutrition');
    const mealV2 = requireReference(secondReferences, 'meal', 'meal');
    const sessionV2 = requireReference(secondReferences, 'workout_session', 'session');
    const scheduleV2 = requireReference(secondReferences, 'scheduled_workout', 'schedule');
    expect(goalV2.revisionId).not.toBe(goalV1.revisionId);
    expect(nutritionV2.revisionId).not.toBe(nutritionV1.revisionId);
    expect(mealV2.revisionId).not.toBe(mealV1.revisionId);
    expect(sessionV2.revisionId).not.toBe(sessionV1.revisionId);
    expect(scheduleV2.revisionId).not.toBe(scheduleV1.revisionId);

    for (const [name, stale] of [
      ['goal', goalV1],
      ['nutrition', nutritionV1],
      ['meal', mealV1],
      ['session', sessionV1],
      ['schedule', scheduleV1],
    ] as const) {
      const response = await create(`${name} stale`, stale, `${name}-stale-question`);
      expect(response.statusCode, name).toBe(404);
      expect(response.json().error.code, name).toBe('OWNED_LINK_NOT_FOUND');
    }
    const changedGoalQuestion = await create('goal state', goalV2, 'goal-v2-question');
    const changedNutritionQuestion = await create(
      'nutrition completeness',
      nutritionV2,
      'nutrition-v2-question',
    );
    const changedMealQuestion = await create('meal completeness', mealV2, 'meal-v2-question');
    const changedSessionQuestion = await create(
      'workout progress',
      sessionV2,
      'session-v2-question',
    );
    const changedScheduleQuestion = await create(
      'workout plan',
      scheduleV2,
      'schedule-v2-question',
    );
    expect(changedGoalQuestion.statusCode).toBe(201);
    expect(changedGoalQuestion.json().data.question.questionId).not.toBe(
      initialGoalQuestion.json().data.question.questionId,
    );
    expect(changedNutritionQuestion.statusCode).toBe(201);
    expect(changedNutritionQuestion.json().data.question.questionId).not.toBe(
      initialNutritionQuestion.json().data.question.questionId,
    );
    expect(changedMealQuestion.statusCode).toBe(201);
    expect(changedMealQuestion.json().data.question.questionId).not.toBe(
      initialMealQuestion.json().data.question.questionId,
    );
    expect(changedSessionQuestion.statusCode).toBe(201);
    expect(changedSessionQuestion.json().data.question.questionId).not.toBe(
      initialSessionQuestion.json().data.question.questionId,
    );
    expect(changedScheduleQuestion.statusCode).toBe(201);
    expect(changedScheduleQuestion.json().data.question.questionId).not.toBe(
      initialScheduleQuestion.json().data.question.questionId,
    );

    for (const [name, reference] of [
      ['missing', { kind: 'activity_goal', id: 'missing', revisionId: 'missing-r1' }],
      ['wrong-kind', { kind: 'nutrition_log', id: 'session', revisionId: sessionV2.revisionId }],
      [
        'foreign',
        { kind: 'workout_session', id: 'foreign-session', revisionId: `sha256:${'a'.repeat(64)}` },
      ],
      [
        'deleted',
        { kind: 'workout_session', id: 'deleted-session', revisionId: `sha256:${'b'.repeat(64)}` },
      ],
    ] as const) {
      const response = await create(`${name} source`, reference, `${name}-source-question`);
      expect(response.statusCode, name).toBe(404);
      expect(response.json().error.code, name).toBe('OWNED_LINK_NOT_FOUND');
    }
    await app.close();
  });

  it('validates a non-null current token for every accepted source kind', async () => {
    const { buildServer } = await import('../../index.js');
    const app = buildServer();
    await app.ready();
    const context = await app.inject({
      method: 'GET',
      url: '/api/v1/daily-context?date=2026-09-20',
      headers: { authorization: 'AgentToken a-secret' },
    });
    expect(context.statusCode).toBe(200);
    const references = context.json().data.sourceReferences as Array<{
      kind: string;
      id: string;
      revisionId: string;
    }>;
    const expectedFromContext = [
      'activity',
      'activity_assignment',
      'activity_execution',
      'activity_goal',
      'activity_recurrence_revision',
      'workout_session',
      'scheduled_workout',
      'body_concern',
      'capability',
      'guidance',
      'observation',
      'nutrition_log',
      'meal',
    ];
    expect(new Set(references.map((reference) => reference.kind))).toEqual(
      new Set(expectedFromContext),
    );
    expect(references.every((reference) => reference.revisionId.length > 0)).toBe(true);
    const create = (
      semanticTopic: string,
      reference: { kind: string; id: string; revisionId: string },
      idempotencyKey: string,
    ) =>
      app.inject({
        method: 'POST',
        url: '/api/v1/check-in/questions',
        headers: { authorization: 'AgentToken a-secret' },
        payload: {
          localDate: '2026-09-20',
          semanticTopic,
          prompt: `Fictional ${semanticTopic} question?`,
          sourceReferences: [
            { kind: reference.kind, id: reference.id, revisionId: reference.revisionId },
          ],
          followUpQuestionId: null,
          idempotencyKey,
        },
      });
    for (const reference of references) {
      const response = await create(
        `${reference.kind} source validation`,
        reference,
        `kind-${reference.kind}-validation`,
      );
      expect(response.statusCode, reference.kind).toBe(201);
    }
    const proposal = await create(
      'proposal source validation',
      { kind: 'proposal', id: 'proposal', revisionId: 'proposal-r1' },
      'kind-proposal-validation',
    );
    expect(proposal.statusCode).toBe(201);

    const concern = references.find((reference) => reference.kind === 'body_concern');
    if (!concern) throw new Error('Missing body concern source reference');
    const bootstrap = await create(
      'question answer source bootstrap',
      concern,
      'kind-question-answer-bootstrap',
    );
    expect(bootstrap.statusCode).toBe(201);
    const answered = await app.inject({
      method: 'POST',
      url: `/api/v1/check-in/questions/${bootstrap.json().data.question.questionId}/answers`,
      headers: { authorization: 'AgentToken a-secret' },
      payload: {
        expectedQuestionRevisionId: bootstrap.json().data.question.id,
        expectedAnswerRevision: 0,
        state: 'answered',
        value: 'Fictional answer.',
        source: {
          class: 'user_observation',
          sourceId: 'kind-audit-source',
          sourceLabel: 'Fictional kind audit',
          sourceOccurredAt: '2026-09-20T12:00:00.000Z',
          uncertainty: 'known',
          freshness: {
            state: 'current',
            asOf: '2026-09-20T12:00:00.000Z',
            reasons: [],
          },
        },
        idempotencyKey: 'kind-question-answer-bootstrap-answer',
      },
    });
    expect(answered.statusCode).toBe(201);
    const questionSource = await create(
      'question source validation',
      {
        kind: 'check_in_question',
        id: answered.json().data.question.questionId,
        revisionId: answered.json().data.question.id,
      },
      'kind-question-validation',
    );
    expect(questionSource.statusCode).toBe(201);
    const answerSource = await create(
      'answer source validation',
      {
        kind: 'check_in_answer',
        id: answered.json().data.currentAnswer.answerId,
        revisionId: answered.json().data.currentAnswer.id,
      },
      'kind-answer-validation',
    );
    expect(answerSource.statusCode).toBe(201);
    await app.close();
  });
});
