import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const migrationsFolder = fileURLToPath(new URL('../../../drizzle', import.meta.url));
const originalDatabaseUrl = process.env.DATABASE_URL;
const originalNow = process.env.PULSE_TEST_NOW;
let tempDir = '';
let dbModule: typeof import('../../db/index.js');

const agentHeaders = { authorization: 'AgentToken body-context-secret' };
const alternateAgentHeaders = { authorization: 'AgentToken body-context-alternate-secret' };
const foreignAgentHeaders = { authorization: 'AgentToken body-context-foreign-secret' };
const provenance = (
  kind:
    | 'clinician_authored'
    | 'user_relayed_clinician'
    | 'user_observation'
    | 'agent_suggestion' = 'user_observation',
) => ({
  class: kind,
  sourceId: `${kind}-source`,
  sourceLabel: `${kind.replaceAll('_', ' ')} fixture`,
  sourceOccurredAt: '2026-09-19T08:15:00.000-04:00',
  uncertainty: kind === 'agent_suggestion' ? ('uncertain' as const) : ('known' as const),
  freshness: {
    state: 'current' as const,
    asOf: '2026-09-19T08:15:00.000-04:00',
    reasons: [],
  },
});

describe('body-context runtime API acceptance', () => {
  beforeEach(async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'pulse-body-context-api-'));
    process.env.DATABASE_URL = join(tempDir, 'api.db');
    process.env.JWT_SECRET = 'body-context-api-secret';
    process.env.PULSE_TEST_NOW = '2026-09-19T14:00:00.000Z';
    vi.resetModules();
    dbModule = await import('../../db/index.js');
    migrate(dbModule.db, { migrationsFolder });
    const { agentTokens, users } = await import('../../db/schema/index.js');
    dbModule.db
      .insert(users)
      .values([
        {
          id: 'user-1',
          username: 'body-owner',
          passwordHash: 'hash',
          preferences: { timeZone: 'America/Detroit' },
        },
        {
          id: 'user-2',
          username: 'body-foreign',
          passwordHash: 'hash',
          preferences: { timeZone: 'America/Detroit' },
        },
      ])
      .run();
    dbModule.db
      .insert(agentTokens)
      .values([
        {
          id: 'body-agent-1',
          userId: 'user-1',
          name: 'body-context-agent',
          tokenHash: createHash('sha256').update('body-context-secret').digest('hex'),
        },
        {
          id: 'body-agent-2',
          userId: 'user-2',
          name: 'body-context-foreign-agent',
          tokenHash: createHash('sha256').update('body-context-foreign-secret').digest('hex'),
        },
        {
          id: 'body-agent-3',
          userId: 'user-1',
          name: 'body-context-alternate-agent',
          tokenHash: createHash('sha256').update('body-context-alternate-secret').digest('hex'),
        },
      ])
      .run();
  });

  afterEach(() => {
    dbModule.sqlite.close();
    process.env.DATABASE_URL = originalDatabaseUrl;
    process.env.PULSE_TEST_NOW = originalNow;
    delete process.env.JWT_SECRET;
    rmSync(tempDir, { recursive: true, force: true });
    vi.resetModules();
  });

  it('preserves provenance, corrections, explicit management authority, and partial flares', async () => {
    const { buildServer } = await import('../../index.js');
    let app = buildServer();
    await app.ready();
    const jwt = app.jwt.sign(
      { sub: 'user-1', type: 'session', iss: 'pulse-api' },
      { expiresIn: '1h' },
    );
    const jwtHeaders = { authorization: `Bearer ${jwt}` };
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/body-context/concerns',
      headers: agentHeaders,
      payload: {
        label: 'Right shoulder irritation',
        bodyRegion: 'right shoulder',
        symptomState: 'affirmed',
        managementState: 'active',
        source: provenance(),
        legacyHealthConditionId: null,
        idempotencyKey: 'concern-create-178',
      },
    });
    expect(created.statusCode).toBe(201);
    const concernId = created.json().data.concern.id as string;
    expect(created.json().data.concern.source).toMatchObject({
      class: 'user_observation',
      capturedBy: { kind: 'agent_token', id: 'body-agent-1' },
      capturedAt: '2026-09-19T14:00:00.000Z',
    });

    const replay = await app.inject({
      method: 'POST',
      url: '/api/v1/body-context/concerns',
      headers: agentHeaders,
      payload: {
        label: 'Right shoulder irritation',
        bodyRegion: 'right shoulder',
        symptomState: 'affirmed',
        managementState: 'active',
        source: provenance(),
        legacyHealthConditionId: null,
        idempotencyKey: 'concern-create-178',
      },
    });
    expect(replay.json()).toEqual(created.json());
    expect(replay.headers['idempotent-replay']).toBe('true');

    const corrected = await app.inject({
      method: 'PATCH',
      url: `/api/v1/body-context/concerns/${concernId}`,
      headers: agentHeaders,
      payload: {
        expectedRevision: 1,
        correctedFields: { label: 'Right shoulder soreness' },
        reason: 'User corrected wording without claiming a diagnosis',
        idempotencyKey: 'concern-correct-178',
      },
    });
    expect(corrected.statusCode).toBe(200);
    expect(corrected.json().data.revisions).toHaveLength(2);

    const inferredResolution = await app.inject({
      method: 'POST',
      url: `/api/v1/body-context/concerns/${concernId}/transitions`,
      headers: agentHeaders,
      payload: {
        expectedRevision: 2,
        to: 'resolved',
        reason: 'No symptoms today',
        source: provenance(),
        explicitDecision: null,
        idempotencyKey: 'inferred-resolution-178',
      },
    });
    expect(inferredResolution.statusCode).toBe(403);
    expect(inferredResolution.json().error.code).toBe('EXPLICIT_USER_APPROVAL_REQUIRED');

    const resolved = await app.inject({
      method: 'POST',
      url: `/api/v1/body-context/concerns/${concernId}/transitions`,
      headers: jwtHeaders,
      payload: {
        expectedRevision: 2,
        to: 'resolved',
        reason: 'User explicitly marks management complete',
        source: provenance(),
        explicitDecision: { kind: 'authenticated_user' },
        idempotencyKey: 'explicit-resolution-178',
      },
    });
    expect(resolved.statusCode).toBe(200);
    expect(resolved.json().data.concern).toMatchObject({
      managementState: 'resolved',
      symptomState: 'affirmed',
    });

    const flare = await app.inject({
      method: 'POST',
      url: `/api/v1/body-context/concerns/${concernId}/flares`,
      headers: agentHeaders,
      payload: {
        occurredAt: '2026-09-19T09:30:00.000-04:00',
        localDate: '2026-09-19',
        timeZone: 'America/Detroit',
        observation: 'Soreness returned during reach; other details unknown.',
        source: provenance(),
        followUpQuestions: [{ key: 'safe_to_continue', prompt: 'Did you feel safe continuing?' }],
        idempotencyKey: 'flare-partial-178',
      },
    });
    expect(flare.statusCode).toBe(201);
    expect(flare.json().data).toMatchObject({
      symptomState: 'affirmed',
      followUps: [{ state: 'pending', answer: null }],
    });
    const invalidFollowOnProposal = await app.inject({
      method: 'POST',
      url: '/api/v1/plan-change-proposals',
      headers: agentHeaders,
      payload: {
        summary: 'This must fail without affecting the recorded flare.',
        effects: [
          {
            kind: 'activity_assignment_reschedule',
            assignmentId: 'missing-assignment',
            expectedRevision: 1,
            plannedLocalDate: '2026-09-24',
            timeZone: 'America/Detroit',
            reason: 'Missing target',
          },
        ],
        sourceReferences: [],
        idempotencyKey: 'failed-follow-on-proposal-178',
      },
    });
    expect(invalidFollowOnProposal.statusCode).toBe(404);
    const invalidZoneFlare = await app.inject({
      method: 'POST',
      url: `/api/v1/body-context/concerns/${concernId}/flares`,
      headers: agentHeaders,
      payload: {
        occurredAt: '2026-09-19T09:30:00.000-04:00',
        localDate: '2026-09-19',
        timeZone: 'Not/A_Zone',
        observation: 'Invalid time zone must fail safely.',
        source: provenance(),
        followUpQuestions: [],
        idempotencyKey: 'flare-invalid-zone-178',
      },
    });
    expect(invalidZoneFlare.statusCode).toBe(400);

    const detail = await app.inject({
      method: 'GET',
      url: `/api/v1/body-context/concerns/${concernId}`,
      headers: jwtHeaders,
    });
    expect(detail.statusCode).toBe(200);
    expect(detail.json().data.concern).toMatchObject({ managementState: 'active', revision: 4 });
    expect(
      detail.json().data.revisions.map((item: { changeKind: string }) => item.changeKind),
    ).toEqual(['created', 'correction', 'transition', 'flare']);
    expect(detail.json().data.flares).toHaveLength(1);

    const capability = await app.inject({
      method: 'POST',
      url: '/api/v1/body-context/capabilities',
      headers: agentHeaders,
      payload: {
        label: 'Comfortable overhead reach',
        state: 'limited',
        source: provenance(),
        idempotencyKey: 'capability-create-178',
      },
    });
    expect(capability.statusCode).toBe(201);
    const capabilityId = capability.json().data.capability.id as string;
    for (const kind of [
      'clinician_authored',
      'user_relayed_clinician',
      'user_observation',
      'agent_suggestion',
    ] as const) {
      const guidance = await app.inject({
        method: 'POST',
        url: '/api/v1/body-context/guidance',
        headers: agentHeaders,
        payload: {
          concernId,
          capabilityId,
          text:
            kind === 'agent_suggestion'
              ? 'Suggestion: consider reducing range pending user choice.'
              : `${kind} guidance`,
          source: provenance(kind),
          idempotencyKey: `guidance-${kind}-178`,
        },
      });
      expect(guidance.statusCode).toBe(201);
      expect(guidance.json().data.guidance.source.class).toBe(kind);
    }
    const guidanceList = await app.inject({
      method: 'GET',
      url: `/api/v1/body-context/guidance?concernId=${concernId}`,
      headers: jwtHeaders,
    });
    expect(guidanceList.statusCode).toBe(200);
    expect(
      guidanceList.json().data.map((item: { source: { class: string } }) => item.source.class),
    ).toEqual(
      expect.arrayContaining([
        'clinician_authored',
        'user_relayed_clinician',
        'user_observation',
        'agent_suggestion',
      ]),
    );

    const foreignDetail = await app.inject({
      method: 'GET',
      url: `/api/v1/body-context/concerns/${concernId}`,
      headers: foreignAgentHeaders,
    });
    expect(foreignDetail.statusCode).toBe(404);
    const openApi = (await app.inject({ method: 'GET', url: '/api/docs/json' })).json();
    expect(openApi.paths['/api/v1/body-context/concerns'].post.security).toEqual([
      { agentToken: [] },
    ]);
    expect(openApi.paths).toMatchObject({
      '/api/v1/body-context/concerns/{id}/flares': { post: expect.any(Object) },
      '/api/v1/body-context/capabilities/{id}': {
        get: expect.any(Object),
        patch: expect.any(Object),
      },
      '/api/v1/body-context/guidance/{id}': {
        get: expect.any(Object),
        patch: expect.any(Object),
      },
      '/api/v1/plan-change-proposals/{id}/approval-statements': {
        get: expect.any(Object),
        post: expect.any(Object),
      },
      '/api/v1/plan-change-proposals/{id}/approval': { post: expect.any(Object) },
    });
    expect(
      openApi.paths['/api/v1/plan-change-proposals/{id}/approval-statements'].get.responses,
    ).toHaveProperty('422');
    const concernCreateProperties =
      openApi.paths['/api/v1/body-context/concerns'].post.requestBody.content['application/json']
        .schema.properties;
    expect(concernCreateProperties).not.toHaveProperty('subjectUserId');
    expect(concernCreateProperties).not.toHaveProperty('actor');
    expect(concernCreateProperties).not.toHaveProperty('requestFingerprint');

    await app.close();
    app = buildServer();
    await app.ready();
    const afterRestart = await app.inject({
      method: 'GET',
      url: `/api/v1/body-context/concerns/${concernId}`,
      headers: jwtHeaders,
    });
    expect(afterRestart.statusCode).toBe(200);
    expect(afterRestart.json().data.flares).toHaveLength(1);
    await app.close();
  });

  it('executes exact approved Activity and workout changes atomically and once', async () => {
    const { buildServer } = await import('../../index.js');
    let app = buildServer();
    await app.ready();
    try {
      const jwt = app.jwt.sign(
        { sub: 'user-1', type: 'session', iss: 'pulse-api' },
        { expiresIn: '1h' },
      );
      const jwtHeaders = { authorization: `Bearer ${jwt}` };
      const activity = await app.inject({
        method: 'POST',
        url: '/api/v1/activities',
        headers: agentHeaders,
        payload: {
          kind: 'walking',
          name: 'Lunch walk',
          goalIds: [],
          structuredWorkoutSessionId: null,
          source: { ...provenance(), capturedAt: '2026-09-19T14:00:00.000Z' },
          idempotencyKey: 'proposal-activity-178',
        },
      });
      expect(activity.statusCode).toBe(201);
      const assignment = await app.inject({
        method: 'POST',
        url: `/api/v1/activities/${activity.json().data.activity.id}/assignments`,
        headers: agentHeaders,
        payload: {
          plannedLocalDate: '2026-09-21',
          timeZone: 'America/Detroit',
          recurrenceRevisionId: null,
          idempotencyKey: 'proposal-assignment-178',
        },
      });
      expect(assignment.statusCode).toBe(201);
      const assignmentId = assignment.json().data.id as string;
      dbModule.sqlite
        .prepare(
          `insert into scheduled_workouts
            (id,user_id,template_id,template_version,date,session_id,created_at,updated_at)
           values ('scheduled-178','user-1',null,null,'2026-09-22',null,1000,1000)`,
        )
        .run();
      dbModule.sqlite
        .prepare(
          `insert into exercises
            (id,user_id,name,muscle_groups,equipment,category,tracking_type,tags,form_cues,
             instructions,coaching_notes,related_exercise_ids,deleted_at,created_at,updated_at)
           values ('exercise-178',null,'Fictional Row','[]','cable','compound','weight_reps',
                   '[]','[]',null,null,'[]',null,1000,1000)`,
        )
        .run();
      dbModule.sqlite
        .prepare(
          `insert into scheduled_workout_exercises
            (id,scheduled_workout_id,exercise_id,exercise_name_snapshot,tracking_type_snapshot,
             section,order_index,programming_notes,agent_notes,agent_notes_meta,template_cues,
             superset_group,tempo,rest_seconds,created_at,updated_at)
           values ('scheduled-exercise-178','scheduled-178','exercise-178','Fictional Row',
                   'weight_reps','main',0,'Preserve programming channel','Date-specific agent note',
                   ?, '[]',null,null,90,1000,1000)`,
        )
        .run(
          JSON.stringify({
            author: 'fixture-agent',
            generatedAt: '2026-09-19T14:00:00.000Z',
            scheduledDateAtGeneration: '2026-09-22',
            stale: false,
          }),
        );
      dbModule.sqlite
        .prepare(
          `insert into scheduled_workouts
            (id,user_id,template_id,template_version,date,session_id,created_at,updated_at)
           values ('completed-scheduled-178','user-1',null,null,'2026-09-20',null,2000,2000)`,
        )
        .run();
      dbModule.sqlite
        .prepare(
          `insert into workout_sessions
            (id,user_id,template_id,scheduled_workout_id,name,date,status,started_at,completed_at,
             duration,time_segments,feedback,exercise_programming_notes,exercise_agent_notes,
             exercise_agent_notes_meta,exercise_prescriptions,notes,deleted_at,created_at,updated_at)
           values ('completed-session-178','user-1',null,'completed-scheduled-178','Completed fixture',
                   '2026-09-20','completed',1000,2000,1000,'[]',null,null,null,null,null,null,null,1000,2000)`,
        )
        .run();
      dbModule.sqlite
        .prepare(
          `update scheduled_workouts set session_id='completed-session-178'
            where id='completed-scheduled-178'`,
        )
        .run();
      const completedTargetProposal = await app.inject({
        method: 'POST',
        url: '/api/v1/plan-change-proposals',
        headers: agentHeaders,
        payload: {
          summary: 'Completed workout history must remain immutable.',
          effects: [
            {
              kind: 'scheduled_workout_reschedule',
              scheduledWorkoutId: 'completed-scheduled-178',
              expectedUpdatedAt: 2000,
              plannedLocalDate: '2026-09-27',
              reason: 'This request must be rejected',
            },
          ],
          sourceReferences: [],
          idempotencyKey: 'completed-target-proposal-178',
        },
      });
      expect(completedTargetProposal.statusCode).toBe(409);
      expect(completedTargetProposal.json().error.code).toBe('TARGET_NOT_ELIGIBLE');
      expect(
        dbModule.sqlite
          .prepare('select date,session_id as sessionId from scheduled_workouts where id=?')
          .get('completed-scheduled-178'),
      ).toEqual({ date: '2026-09-20', sessionId: 'completed-session-178' });

      const proposal = await app.inject({
        method: 'POST',
        url: '/api/v1/plan-change-proposals',
        headers: agentHeaders,
        payload: {
          summary: 'Move two upcoming items after the flare.',
          effects: [
            {
              kind: 'activity_assignment_reschedule',
              assignmentId,
              expectedRevision: 1,
              plannedLocalDate: '2026-09-23',
              timeZone: 'America/Detroit',
              reason: 'User-requested prospective adjustment',
            },
            {
              kind: 'scheduled_workout_reschedule',
              scheduledWorkoutId: 'scheduled-178',
              expectedUpdatedAt: 1000,
              plannedLocalDate: '2026-09-25',
              reason: 'User-requested prospective adjustment',
            },
          ],
          sourceReferences: [],
          idempotencyKey: 'proposal-create-178',
        },
      });
      expect(proposal.statusCode, proposal.body).toBe(201);
      const proposalId = proposal.json().data.id as string;
      expect(
        dbModule.sqlite
          .prepare('select planned_local_date from activity_assignments where id=?')
          .get(assignmentId),
      ).toEqual({ planned_local_date: '2026-09-21' });

      const approvalPayload = {
        proposalRevisionId: proposal.json().data.currentRevisionId,
        targetRevisionFingerprint: proposal.json().data.targetRevisionFingerprint,
        idempotencyKey: 'proposal-approve-178',
      };
      const approved = await app.inject({
        method: 'POST',
        url: `/api/v1/plan-change-proposals/${proposalId}/approval`,
        headers: jwtHeaders,
        payload: approvalPayload,
      });
      expect(approved.statusCode).toBe(200);
      expect(approved.json().data).toMatchObject({
        state: 'approved',
        approval: {
          approvedBy: { kind: 'user', id: 'user-1' },
          relayedBy: null,
          approvalStatementId: null,
          approvalStatement: null,
        },
      });
      expect(
        dbModule.sqlite
          .prepare('select planned_local_date,revision from activity_assignments where id=?')
          .get(assignmentId),
      ).toEqual({ planned_local_date: '2026-09-23', revision: 2 });
      expect(
        dbModule.sqlite
          .prepare('select date from scheduled_workouts where id=?')
          .get('scheduled-178'),
      ).toEqual({ date: '2026-09-25' });
      const preservedNotes = dbModule.sqlite
        .prepare(
          `select programming_notes as programmingNotes,agent_notes as agentNotes,
                  agent_notes_meta as agentNotesMeta
             from scheduled_workout_exercises where id='scheduled-exercise-178'`,
        )
        .get() as { agentNotes: string; agentNotesMeta: string; programmingNotes: string };
      expect(preservedNotes).toMatchObject({
        programmingNotes: 'Preserve programming channel',
        agentNotes: 'Date-specific agent note',
      });
      expect(JSON.parse(preservedNotes.agentNotesMeta)).toMatchObject({ stale: true });

      const replay = await app.inject({
        method: 'POST',
        url: `/api/v1/plan-change-proposals/${proposalId}/approval`,
        headers: jwtHeaders,
        payload: approvalPayload,
      });
      expect(replay.statusCode).toBe(200);
      expect(replay.headers['idempotent-replay']).toBe('true');
      expect(
        dbModule.sqlite
          .prepare(
            'select count(*) as count from activity_assignment_revisions where assignment_id=?',
          )
          .get(assignmentId),
      ).toEqual({ count: 2 });

      const relayProposal = await app.inject({
        method: 'POST',
        url: '/api/v1/plan-change-proposals',
        headers: agentHeaders,
        payload: {
          summary: 'Move the walk after an explicit user statement.',
          effects: [
            {
              kind: 'activity_assignment_reschedule',
              assignmentId,
              expectedRevision: 2,
              plannedLocalDate: '2026-09-24',
              timeZone: 'America/Detroit',
              reason: 'User explicitly approved this exact move',
            },
          ],
          sourceReferences: [],
          idempotencyKey: 'relay-proposal-create-178',
        },
      });
      expect(relayProposal.statusCode, relayProposal.body).toBe(201);
      const relayId = relayProposal.json().data.id as string;
      const relayBinding = {
        proposalRevisionId: relayProposal.json().data.currentRevisionId,
        targetRevisionFingerprint: relayProposal.json().data.targetRevisionFingerprint,
      };
      const agentSelfApproval = await app.inject({
        method: 'POST',
        url: `/api/v1/plan-change-proposals/${relayId}/approval`,
        headers: agentHeaders,
        payload: { ...relayBinding, idempotencyKey: 'agent-self-approval-178' },
      });
      expect(agentSelfApproval.statusCode).toBe(403);
      expect(agentSelfApproval.json().error.code).toBe('EXPLICIT_USER_APPROVAL_REQUIRED');
      const statement = await app.inject({
        method: 'POST',
        url: `/api/v1/plan-change-proposals/${relayId}/approval-statements`,
        headers: agentHeaders,
        payload: {
          ...relayBinding,
          statement: 'Yes, move that exact walk to September 24.',
          sourceId: 'conversation-message-approval-178',
          sourceOccurredAt: '2026-09-19T10:00:00.000-04:00',
          idempotencyKey: 'approval-statement-178',
        },
      });
      expect(statement.statusCode).toBe(201);
      expect(statement.json().data).toMatchObject({
        subjectUserId: 'user-1',
        proposalId: relayId,
        ...relayBinding,
        statement: 'Yes, move that exact walk to September 24.',
        sourceId: 'conversation-message-approval-178',
        sourceOccurredAt: '2026-09-19T10:00:00.000-04:00',
        recordedBy: { kind: 'agent_token', id: 'body-agent-1' },
      });
      const capturedOnly = await app.inject({
        method: 'GET',
        url: `/api/v1/plan-change-proposals/${relayId}`,
        headers: jwtHeaders,
      });
      expect(capturedOnly.statusCode, capturedOnly.body).toBe(200);
      expect(capturedOnly.json().data).toMatchObject({ state: 'proposed', approval: null });
      const receiptsBeforeRead = dbModule.sqlite
        .prepare('select count(*) as count from body_context_idempotency_receipts')
        .get();
      const statementRead = await app.inject({
        method: 'GET',
        url: `/api/v1/plan-change-proposals/${relayId}/approval-statements`,
        headers: jwtHeaders,
      });
      expect(statementRead.statusCode, statementRead.body).toBe(200);
      expect(statementRead.json().data.statements).toEqual([statement.json().data]);
      const foreignStatementRead = await app.inject({
        method: 'GET',
        url: `/api/v1/plan-change-proposals/${relayId}/approval-statements`,
        headers: foreignAgentHeaders,
      });
      expect(foreignStatementRead.statusCode).toBe(404);
      expect(foreignStatementRead.json().error.code).toBe('BODY_CONTEXT_NOT_FOUND');
      const absentStatementRead = await app.inject({
        method: 'GET',
        url: '/api/v1/plan-change-proposals/absent/approval-statements',
        headers: jwtHeaders,
      });
      expect(absentStatementRead.statusCode).toBe(404);
      expect(absentStatementRead.json().error.code).toBe('BODY_CONTEXT_NOT_FOUND');
      expect(
        dbModule.sqlite
          .prepare('select count(*) as count from body_context_idempotency_receipts')
          .get(),
      ).toEqual(receiptsBeforeRead);
      expect(
        dbModule.sqlite
          .prepare('select planned_local_date,revision from activity_assignments where id=?')
          .get(assignmentId),
      ).toEqual({ planned_local_date: '2026-09-23', revision: 2 });
      const relayedApprovalPayload = {
        ...relayBinding,
        relayApprovalStatementId: statement.json().data.id,
        idempotencyKey: 'relay-approval-178',
      };
      const wrongRelay = await app.inject({
        method: 'POST',
        url: `/api/v1/plan-change-proposals/${relayId}/approval`,
        headers: alternateAgentHeaders,
        payload: { ...relayedApprovalPayload, idempotencyKey: 'wrong-relay-approval-178' },
      });
      expect(wrongRelay.statusCode).toBe(403);
      expect(wrongRelay.json().error.code).toBe('EXPLICIT_USER_APPROVAL_REQUIRED');
      expect(
        dbModule.sqlite
          .prepare('select planned_local_date,revision from activity_assignments where id=?')
          .get(assignmentId),
      ).toEqual({ planned_local_date: '2026-09-23', revision: 2 });
      const relayedApproval = await app.inject({
        method: 'POST',
        url: `/api/v1/plan-change-proposals/${relayId}/approval`,
        headers: agentHeaders,
        payload: relayedApprovalPayload,
      });
      expect(relayedApproval.statusCode, relayedApproval.body).toBe(200);
      expect(relayedApproval.json().data.approval).toMatchObject({
        approvedBy: { kind: 'user', id: 'user-1' },
        relayedBy: { kind: 'agent_token', id: 'body-agent-1' },
        approvalStatementId: statement.json().data.id,
        approvalStatement: {
          id: statement.json().data.id,
          subjectUserId: 'user-1',
          proposalId: relayId,
          ...relayBinding,
          statement: 'Yes, move that exact walk to September 24.',
          sourceId: 'conversation-message-approval-178',
          sourceOccurredAt: '2026-09-19T10:00:00.000-04:00',
          recordedBy: { kind: 'agent_token', id: 'body-agent-1' },
        },
      });

      const approvalReceipt = dbModule.sqlite
        .prepare(
          `select response_json as responseJson from body_context_idempotency_receipts
            where idempotency_key='relay-approval-178'`,
        )
        .get() as { responseJson: string };
      const legacyReceiptResponse = JSON.parse(approvalReceipt.responseJson) as {
        approval: { approvalStatement?: unknown };
      };
      delete legacyReceiptResponse.approval.approvalStatement;
      dbModule.sqlite
        .prepare(
          `update body_context_idempotency_receipts set response_json=?
            where idempotency_key='relay-approval-178'`,
        )
        .run(JSON.stringify(legacyReceiptResponse));

      await app.close();
      app = buildServer();
      await app.ready();
      const relayedAfterRestart = await app.inject({
        method: 'GET',
        url: `/api/v1/plan-change-proposals/${relayId}`,
        headers: jwtHeaders,
      });
      expect(relayedAfterRestart.statusCode, relayedAfterRestart.body).toBe(200);
      expect(relayedAfterRestart.json().data.approval).toEqual(
        relayedApproval.json().data.approval,
      );
      const relayedReplayAfterRestart = await app.inject({
        method: 'POST',
        url: `/api/v1/plan-change-proposals/${relayId}/approval`,
        headers: agentHeaders,
        payload: relayedApprovalPayload,
      });
      expect(relayedReplayAfterRestart.statusCode, relayedReplayAfterRestart.body).toBe(200);
      expect(relayedReplayAfterRestart.headers['idempotent-replay']).toBe('true');
      expect(relayedReplayAfterRestart.json().data.approval).toEqual(
        relayedApproval.json().data.approval,
      );
      const foreignRelayRead = await app.inject({
        method: 'GET',
        url: `/api/v1/plan-change-proposals/${relayId}`,
        headers: foreignAgentHeaders,
      });
      expect(foreignRelayRead.statusCode).toBe(404);

      const historicalProposal = await app.inject({
        method: 'POST',
        url: '/api/v1/plan-change-proposals',
        headers: agentHeaders,
        payload: {
          summary: 'Fictional revision-bound statement',
          effects: [
            {
              kind: 'activity_assignment_reschedule',
              assignmentId,
              expectedRevision: 3,
              plannedLocalDate: '2026-09-25',
              timeZone: 'America/Detroit',
              reason: 'Fictional future option',
            },
          ],
          sourceReferences: [],
          idempotencyKey: 'historical-proposal-183',
        },
      });
      expect(historicalProposal.statusCode, historicalProposal.body).toBe(201);
      const historicalId = historicalProposal.json().data.id as string;
      const oldBinding = {
        proposalRevisionId: historicalProposal.json().data.currentRevisionId,
        targetRevisionFingerprint: historicalProposal.json().data.targetRevisionFingerprint,
      };
      const oldClaim = await app.inject({
        method: 'POST',
        url: `/api/v1/plan-change-proposals/${historicalId}/approval-statements`,
        headers: agentHeaders,
        payload: {
          ...oldBinding,
          statement: 'A claim for the first draft only.',
          sourceId: 'fictional-message-183',
          sourceOccurredAt: '2026-09-19T10:00:00.000-04:00',
          idempotencyKey: 'historical-claim-183',
        },
      });
      expect(oldClaim.statusCode, oldClaim.body).toBe(201);
      const revisedClaimTarget = await app.inject({
        method: 'PATCH',
        url: `/api/v1/plan-change-proposals/${historicalId}`,
        headers: agentHeaders,
        payload: {
          expectedProposalRevisionId: oldBinding.proposalRevisionId,
          summary: 'Fictional revised draft',
          effects: [
            {
              kind: 'activity_assignment_reschedule',
              assignmentId,
              expectedRevision: 3,
              plannedLocalDate: '2026-09-26',
              timeZone: 'America/Detroit',
              reason: 'Fictional revised option',
            },
          ],
          sourceReferences: [],
          idempotencyKey: 'historical-revise-183',
        },
      });
      expect(revisedClaimTarget.statusCode, revisedClaimTarget.body).toBe(200);
      expect(revisedClaimTarget.json().data.currentRevisionId).not.toBe(
        oldBinding.proposalRevisionId,
      );
      const historicalRead = await app.inject({
        method: 'GET',
        url: `/api/v1/plan-change-proposals/${historicalId}/approval-statements`,
        headers: jwtHeaders,
      });
      expect(historicalRead.statusCode, historicalRead.body).toBe(200);
      expect(historicalRead.json().data.statements).toEqual([oldClaim.json().data]);
      expect(revisedClaimTarget.json().data.approval).toBeNull();

      // Fixture-DB boundary rows exercise the read cap without 100 unrelated mutation receipts.
      const insertStatement = dbModule.sqlite.prepare(
        `insert into proposal_approval_statements
          (id,proposal_id,user_id,proposal_revision_id,target_revision_fingerprint,statement,
           source_id,source_occurred_at,recorded_by_json,created_at)
         values (?,?,?,?,?,?,?,?,?,?)`,
      );
      const addStatement = (id: string, proposalId: string, userId: string) =>
        insertStatement.run(
          id,
          proposalId,
          userId,
          oldBinding.proposalRevisionId,
          oldBinding.targetRevisionFingerprint,
          `Fictional claim ${id}`,
          `source-${id}`,
          '2026-09-19T10:00:00.000-04:00',
          JSON.stringify(oldClaim.json().data.recordedBy),
          '2026-09-19T14:00:00.000Z',
        );
      for (let index = 1; index <= 98; index += 1)
        addStatement(`bounded-own-${String(index).padStart(3, '0')}`, historicalId, 'user-1');
      for (let index = 1; index <= 3; index += 1) {
        addStatement(`bounded-other-${index}`, relayId, 'user-1');
        addStatement(`bounded-foreign-${index}`, historicalId, 'user-2');
      }
      const boundedUrl = `/api/v1/plan-change-proposals/${historicalId}/approval-statements`;
      const belowCap = await app.inject({ method: 'GET', url: boundedUrl, headers: jwtHeaders });
      expect(belowCap.statusCode, belowCap.body).toBe(200);
      expect(belowCap.json().data.statements).toHaveLength(99);
      addStatement('bounded-own-099', historicalId, 'user-1');
      const atCap = await app.inject({ method: 'GET', url: boundedUrl, headers: jwtHeaders });
      expect(atCap.statusCode, atCap.body).toBe(200);
      expect(atCap.json().data.statements).toHaveLength(100);
      expect(
        atCap
          .json()
          .data.statements.map((item: { id: string; createdAt: string }) => [
            item.createdAt,
            item.id,
          ]),
      ).toEqual(
        [...atCap.json().data.statements]
          .sort(
            (a: { id: string; createdAt: string }, b: { id: string; createdAt: string }) =>
              a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
          )
          .map((item: { id: string; createdAt: string }) => [item.createdAt, item.id]),
      );
      addStatement('bounded-own-100', historicalId, 'user-1');
      const rowsBeforeOverflow = dbModule.sqlite
        .prepare(
          'select count(*) as count from proposal_approval_statements where proposal_id=? and user_id=?',
        )
        .get(historicalId, 'user-1');
      const receiptsBeforeOverflow = dbModule.sqlite
        .prepare('select count(*) as count from body_context_idempotency_receipts')
        .get();
      const aboveCap = await app.inject({ method: 'GET', url: boundedUrl, headers: jwtHeaders });
      expect(aboveCap.statusCode, aboveCap.body).toBe(422);
      expect(aboveCap.json()).toEqual({
        error: {
          code: 'PROPOSAL_APPROVAL_STATEMENT_READ_LIMIT_EXCEEDED',
          message: 'Approval statement audit exceeds the supported read limit.',
          details: { scope: 'proposal_approval_statements', limit: 100 },
        },
      });
      expect(
        dbModule.sqlite
          .prepare(
            'select count(*) as count from proposal_approval_statements where proposal_id=? and user_id=?',
          )
          .get(historicalId, 'user-1'),
      ).toEqual(rowsBeforeOverflow);
      expect(
        dbModule.sqlite
          .prepare('select count(*) as count from body_context_idempotency_receipts')
          .get(),
      ).toEqual(receiptsBeforeOverflow);
      const foreignAboveCap = await app.inject({
        method: 'GET',
        url: boundedUrl,
        headers: foreignAgentHeaders,
      });
      expect(foreignAboveCap.statusCode).toBe(404);
      expect(foreignAboveCap.json().error.code).toBe('BODY_CONTEXT_NOT_FOUND');

      const staleProposal = await app.inject({
        method: 'POST',
        url: '/api/v1/plan-change-proposals',
        headers: agentHeaders,
        payload: {
          summary: 'A stale multi-target proposal.',
          effects: [
            {
              kind: 'activity_assignment_reschedule',
              assignmentId,
              expectedRevision: 3,
              plannedLocalDate: '2026-09-25',
              timeZone: 'America/Detroit',
              reason: 'Must remain atomic',
            },
            {
              kind: 'scheduled_workout_reschedule',
              scheduledWorkoutId: 'scheduled-178',
              expectedUpdatedAt: approved.json().data.execution.effects[1].updatedAt,
              plannedLocalDate: '2026-09-26',
              reason: 'Must remain atomic',
            },
          ],
          sourceReferences: [],
          idempotencyKey: 'stale-proposal-create-178',
        },
      });
      expect(staleProposal.statusCode).toBe(201);
      dbModule.sqlite
        .prepare('update scheduled_workouts set updated_at=updated_at+1 where id=?')
        .run('scheduled-178');
      const staleApproval = await app.inject({
        method: 'POST',
        url: `/api/v1/plan-change-proposals/${staleProposal.json().data.id}/approval`,
        headers: jwtHeaders,
        payload: {
          proposalRevisionId: staleProposal.json().data.currentRevisionId,
          targetRevisionFingerprint: staleProposal.json().data.targetRevisionFingerprint,
          idempotencyKey: 'stale-proposal-approve-178',
        },
      });
      expect(staleApproval.statusCode).toBe(409);
      expect(staleApproval.json().error.code).toBe('STALE_TARGET');
      expect(
        dbModule.sqlite
          .prepare('select planned_local_date,revision from activity_assignments where id=?')
          .get(assignmentId),
      ).toEqual({ planned_local_date: '2026-09-24', revision: 3 });
      expect(
        dbModule.sqlite
          .prepare(
            'select count(*) as count from body_context_idempotency_receipts where idempotency_key=?',
          )
          .get('stale-proposal-approve-178'),
      ).toEqual({ count: 0 });
      dbModule.sqlite.prepare('delete from users where id=?').run('user-1');
      for (const table of [
        'body_context_concerns',
        'body_context_capabilities',
        'body_context_guidance',
        'body_context_flares',
        'body_context_flare_follow_ups',
        'plan_change_proposals',
        'plan_change_proposal_revisions',
        'proposal_approval_statements',
        'body_context_idempotency_receipts',
      ]) {
        expect(dbModule.sqlite.prepare(`select count(*) as count from ${table}`).get()).toEqual({
          count: 0,
        });
      }
      expect(dbModule.sqlite.pragma('foreign_key_check')).toEqual([]);
    } finally {
      await app.close();
    }
  });
});
