import { expect, request, test, type APIRequestContext } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { setAuthenticatedSession } from './auth-session';
import { apiBaseURL } from './test-env';
import { basename, resolve } from 'node:path';
import { readFileSync, realpathSync, writeFileSync } from 'node:fs';

// All primary records are written through registered APIs into the isolated E2E SQLite.
const provenance = (classification: 'user_observation' | 'agent_suggestion') => ({
  class: classification,
  sourceId: `fictional-183-${classification}`,
  sourceLabel: 'Fictional registered browser fixture',
  sourceOccurredAt: '2026-09-22T12:00:00.000-04:00',
  capturedAt: '2026-09-22T12:00:00.000-04:00',
  uncertainty: 'unknown',
  freshness: { state: 'current', asOf: '2026-09-22T12:00:00.000-04:00', reasons: [] },
});
const sourceWithoutCapture = (classification: 'user_observation' | 'agent_suggestion') => {
  const source = provenance(classification);
  return {
    class: source.class,
    sourceId: source.sourceId,
    sourceLabel: source.sourceLabel,
    sourceOccurredAt: source.sourceOccurredAt,
    uncertainty: source.uncertainty,
    freshness: source.freshness,
  };
};

async function write<T>(api: APIRequestContext, path: string, data: object): Promise<T> {
  const response = await api.post(path, { data });
  expect(response.status(), await response.text()).toBe(201);
  return ((await response.json()) as { data: T }).data;
}
async function read<T>(api: APIRequestContext, path: string): Promise<T> {
  const response = await api.get(path);
  expect(response.ok(), await response.text()).toBeTruthy();
  return ((await response.json()) as { data: T }).data;
}
async function expandSessionContext(page: import('@playwright/test').Page) {
  const toggle = page.getByRole('button', { name: /What matters today/ });
  if ((await toggle.getAttribute('aria-expanded')) === 'false') await toggle.click();
}

test('registered Activity and Journal records survive Calendar deep links and reload', async ({
  page,
  browser,
}) => {
  test.setTimeout(120_000);
  if (process.env.PULSE_TEST_NOW !== '2026-09-24T15:00:00.000Z')
    throw new Error('Fixed API test clock required for #183 evidence');
  await page.clock.setFixedTime(new Date('2026-09-24T15:00:00.000Z'));
  const consoleErrors: string[] = [];
  page.on('pageerror', (error) => consoleErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  const database = process.env.E2E_DATABASE_URL;
  if (!database || !/^pulse-activity-183-[\w-]+\.db$/u.test(basename(database)))
    throw new Error('Isolated #183 SQLite fixture required');
  const file = resolve(database);
  if (!file.startsWith('/private/tmp/') && !file.startsWith('/tmp/'))
    throw new Error('Fixture must be in tmp');
  if (realpathSync(file) !== file) throw new Error('Fixture must not be a symlink');
  const anonymous = await request.newContext({ baseURL: apiBaseURL });
  const registration = await anonymous.post('/api/v1/auth/register', {
    data: {
      username: `activity183-${Date.now()}`,
      password: 'fictional-activity-183-password',
      timeZone: 'America/Detroit',
    },
  });
  expect(registration.ok(), await registration.text()).toBeTruthy();
  const { token, user } = (await registration.json()).data as {
    token: string;
    user: { id: string };
  };
  if (!/^[\da-f-]{36}$/u.test(user.id)) throw new Error('Unexpected fixture owner id');
  const owner = await request.newContext({
    baseURL: apiBaseURL,
    extraHTTPHeaders: { Authorization: `Bearer ${token}` },
  });
  const agentCreated = await write<{ token: string }>(owner, '/api/v1/agent-tokens', {
    name: 'Fictional browser agent',
  });
  const agent = await request.newContext({
    baseURL: apiBaseURL,
    extraHTTPHeaders: { Authorization: `AgentToken ${agentCreated.token}` },
  });
  const agentBCreated = await write<{ token: string }>(owner, '/api/v1/agent-tokens', {
    name: 'Fictional second thread',
  });
  const agentB = await request.newContext({
    baseURL: apiBaseURL,
    extraHTTPHeaders: { Authorization: `AgentToken ${agentBCreated.token}` },
  });
  try {
    const activity = await write<{ activity: { id: string } }>(agent, '/api/v1/activities', {
      kind: 'physical_therapy',
      name: 'Fictional mobility',
      goalIds: [],
      structuredWorkoutSessionId: null,
      source: provenance('user_observation'),
      idempotencyKey: 'activity-183-create',
    });
    const activityId = activity.activity.id;
    const assignment = await write<{ id: string }>(
      agent,
      `/api/v1/activities/${activityId}/assignments`,
      {
        plannedLocalDate: '2026-09-22',
        timeZone: 'America/Detroit',
        recurrenceRevisionId: null,
        idempotencyKey: 'activity-183-assignment',
      },
    );
    const execution = await write<{ id: string }>(
      agent,
      `/api/v1/activities/${activityId}/executions`,
      {
        assignmentId: assignment.id,
        actualOccurredAt: '2026-09-24T12:00:00.000-04:00',
        actualLocalDate: '2026-09-24',
        timeZone: 'America/Detroit',
        durationMinutes: 5,
        outcome: 'completed',
        structuredWorkoutSessionId: null,
        source: provenance('user_observation'),
        idempotencyKey: 'activity-183-execution',
      },
    );
    const detailResponse = await owner.get(`/api/v1/activities/${activityId}`);
    expect(detailResponse.ok(), await detailResponse.text()).toBeTruthy();
    const detail = (await detailResponse.json()).data;
    expect(detail.assignments[0].id).toBe(assignment.id);
    expect(detail.executions[0].id).toBe(execution.id);
    await setAuthenticatedSession(page, token);
    await page.goto(`/activity/${activityId}?occurrence=${assignment.id}`, {
      waitUntil: 'networkidle',
    });
    await page.reload({ waitUntil: 'networkidle' });
    await expect(page.locator(`[data-occurrence-id="${assignment.id}"]`)).toContainText(
      '2026-09-22',
    );
    await page.goto('/calendar', { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Agenda' }).click();
    await expect(
      page.locator(`[data-local-date="2026-09-22"] [data-record-id="${assignment.id}"]`),
    ).toBeVisible();

    const bodySource = sourceWithoutCapture('user_observation');
    const journalSource = sourceWithoutCapture('user_observation');
    const shoulder = await write<{ concern: { id: string; currentRevisionId: string } }>(
      agent,
      '/api/v1/body-context/concerns',
      {
        label: 'Fictional shoulder sensitivity',
        bodyRegion: 'shoulder',
        symptomState: 'affirmed',
        managementState: 'active',
        source: bodySource,
        legacyHealthConditionId: null,
        idempotencyKey: 'activity-183-shoulder',
      },
    );
    const quad = await write<{ concern: { id: string } }>(agent, '/api/v1/body-context/concerns', {
      label: 'Fictional quad tightness',
      bodyRegion: 'quad',
      symptomState: 'unknown',
      managementState: 'active',
      source: bodySource,
      legacyHealthConditionId: null,
      idempotencyKey: 'activity-183-quad',
    });
    const knee = await write<{ concern: { id: string } }>(agent, '/api/v1/body-context/concerns', {
      label: 'Fictional knee concern',
      bodyRegion: 'knee',
      symptomState: 'unknown',
      managementState: 'active',
      source: bodySource,
      legacyHealthConditionId: null,
      idempotencyKey: 'activity-183-knee',
    });
    const upperFocus = await write<{ capability: { id: string } }>(
      agent,
      '/api/v1/body-context/capabilities',
      {
        label: 'Fictional upper-body control',
        state: 'developing',
        source: bodySource,
        idempotencyKey: 'activity-183-upper-focus',
      },
    );
    const lowerFocus = await write<{ capability: { id: string } }>(
      agent,
      '/api/v1/body-context/capabilities',
      {
        label: 'Fictional lower-body control',
        state: 'stable',
        source: bodySource,
        idempotencyKey: 'activity-183-lower-focus',
      },
    );
    const shoulderGuidance = await write<{ guidance: { id: string } }>(
      agent,
      '/api/v1/body-context/guidance',
      {
        concernId: shoulder.concern.id,
        capabilityId: upperFocus.capability.id,
        text: 'Fictional clinician-relayed shoulder guidance.',
        source: { ...bodySource, class: 'user_relayed_clinician' },
        idempotencyKey: 'activity-183-shoulder-guidance',
      },
    );
    await write(agent, '/api/v1/body-context/guidance', {
      concernId: quad.concern.id,
      capabilityId: lowerFocus.capability.id,
      text: 'Fictional clinician-authored quad guidance.',
      source: { ...bodySource, class: 'clinician_authored' },
      idempotencyKey: 'activity-183-quad-guidance',
    });
    const flare = await write<{ id: string }>(
      agent,
      `/api/v1/body-context/concerns/${shoulder.concern.id}/flares`,
      {
        occurredAt: '2026-09-24T09:00:00.000-04:00',
        localDate: '2026-09-24',
        timeZone: 'America/Detroit',
        observation: 'Fictional shoulder tightness; cause unknown.',
        source: bodySource,
        followUpQuestions: [{ key: 'safe_to_continue', prompt: 'Did it feel safe to continue?' }],
        idempotencyKey: 'activity-183-flare',
      },
    );
    await page.goto(`/activity/${activityId}?occurrence=${assignment.id}`, {
      waitUntil: 'networkidle',
    });
    await page.reload({ waitUntil: 'networkidle' });
    await expect(page.locator(`[data-occurrence-id="${assignment.id}"]`)).toContainText(
      '2026-09-22',
    );
    await page.goto('/calendar', { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Agenda' }).click();
    await expect(
      page.locator(`[data-local-date="2026-09-22"] [data-record-id="${assignment.id}"]`),
    ).toBeVisible();
    await expect(
      page.locator(`[data-local-date="2026-09-24"] [data-record-id="${flare.id}"]`),
    ).toBeVisible();
    const upperExercise = await write<{ id: string }>(owner, '/api/v1/exercises', {
      category: 'compound',
      equipment: 'barbell',
      muscleGroups: ['shoulders'],
      name: 'Fictional 183 press',
    });
    const lowerExercise = await write<{ id: string }>(owner, '/api/v1/exercises', {
      category: 'compound',
      equipment: 'barbell',
      muscleGroups: ['quads'],
      name: 'Fictional 183 squat',
    });
    const upperSession = await write<{ id: string }>(owner, '/api/v1/workout-sessions', {
      name: 'Fictional upper session',
      date: '2026-09-23',
      status: 'in-progress',
      startedAt: Date.parse('2026-09-23T10:00:00.000-04:00'),
      completedAt: null,
      duration: null,
      sets: [
        {
          exerciseId: upperExercise.id,
          orderIndex: 0,
          setNumber: 1,
          reps: 8,
          weight: 50,
          completed: false,
          section: 'main',
        },
      ],
    });
    const lowerSession = await write<{ id: string }>(owner, '/api/v1/workout-sessions', {
      name: 'Fictional lower session',
      date: '2026-09-24',
      status: 'in-progress',
      startedAt: Date.parse('2026-09-24T10:00:00.000-04:00'),
      completedAt: null,
      duration: null,
      sets: [
        {
          exerciseId: lowerExercise.id,
          orderIndex: 0,
          setNumber: 1,
          reps: 8,
          weight: 50,
          completed: false,
          section: 'main',
        },
      ],
    });
    const completedSession = await write<{ id: string }>(owner, '/api/v1/workout-sessions', {
      name: 'Fictional completed session',
      date: '2026-09-22',
      status: 'completed',
      startedAt: Date.parse('2026-09-22T10:00:00.000-04:00'),
      completedAt: Date.parse('2026-09-22T10:30:00.000-04:00'),
      duration: 1800,
      sets: [],
    });
    expect(completedSession.id).toBeTruthy();
    const template = await write<{ id: string }>(owner, '/api/v1/workout-templates', {
      name: 'Fictional scheduled-only lift',
      sections: [
        {
          type: 'main',
          exercises: [
            {
              exerciseId: lowerExercise.id,
              sets: 1,
              repsMin: 6,
              repsMax: 8,
              restSeconds: 60,
              cues: [],
            },
          ],
        },
      ],
    });
    const scheduledOnly = await write<{ id: string }>(owner, '/api/v1/scheduled-workouts', {
      templateId: template.id,
      date: '2026-09-25',
    });
    expect(scheduledOnly.id).toBeTruthy();
    const upperContext = await read<{
      relevantConcerns: Array<{ id: string }>;
      trackedIrrelevantConcerns: Array<{ id: string }>;
      positiveFocus: Array<{ id: string }>;
    }>(owner, `/api/v1/workout-sessions/${upperSession.id}/session-context`);
    const lowerContext = await read<typeof upperContext>(
      owner,
      `/api/v1/workout-sessions/${lowerSession.id}/session-context`,
    );
    expect(upperContext.relevantConcerns.map((item) => item.id)).toContain(shoulder.concern.id);
    expect(lowerContext.relevantConcerns.map((item) => item.id)).toContain(quad.concern.id);
    expect(upperContext.trackedIrrelevantConcerns.map((item) => item.id)).toContain(
      knee.concern.id,
    );
    expect(lowerContext.trackedIrrelevantConcerns.map((item) => item.id)).toContain(
      knee.concern.id,
    );
    expect(upperContext.positiveFocus.map((item) => item.id)).toContain(upperFocus.capability.id);
    expect(lowerContext.positiveFocus.map((item) => item.id)).toContain(lowerFocus.capability.id);
    const pendingAssignment = await write<{ id: string }>(
      agent,
      `/api/v1/activities/${activityId}/assignments`,
      {
        plannedLocalDate: '2026-09-26',
        timeZone: 'America/Detroit',
        recurrenceRevisionId: null,
        idempotencyKey: 'activity-183-pending-assignment',
      },
    );
    const pending = await write<{
      id: string;
      currentRevisionId: string;
      targetRevisionFingerprint: string;
    }>(agent, '/api/v1/plan-change-proposals', {
      summary: 'Fictional pending move after the flare',
      effects: [
        {
          kind: 'activity_assignment_reschedule',
          assignmentId: pendingAssignment.id,
          expectedRevision: 1,
          plannedLocalDate: '2026-09-27',
          timeZone: 'America/Detroit',
          reason: 'Await user approval',
        },
      ],
      sourceReferences: [],
      idempotencyKey: 'activity-183-pending-proposal',
    });
    const capturedStatement = await write<{ id: string }>(
      agent,
      `/api/v1/plan-change-proposals/${pending.id}/approval-statements`,
      {
        proposalRevisionId: pending.currentRevisionId,
        targetRevisionFingerprint: pending.targetRevisionFingerprint,
        statement: 'Fictional statement awaiting explicit approval.',
        sourceId: 'fictional-183-pending-message',
        sourceOccurredAt: '2026-09-24T10:00:00.000-04:00',
        idempotencyKey: 'activity-183-pending-statement',
      },
    );
    await page.goto(`/activity/${activityId}?proposal=${pending.id}`, { waitUntil: 'networkidle' });
    await page.reload({ waitUntil: 'networkidle' });
    await expect(page.locator(`[data-statement-id="${capturedStatement.id}"]`)).toContainText(
      'Fictional statement awaiting explicit approval.',
    );
    await expect(page.locator(`[data-statement-id="${capturedStatement.id}"]`)).toContainText(
      'Captured for current revision; not approval',
    );
    await expect(page.locator(`[data-proposal-id="${pending.id}"]`)).toContainText(
      'Approval pending; no plan effect executed.',
    );
    await expect(page.locator(`[data-occurrence-id="${pendingAssignment.id}"]`)).toContainText(
      '2026-09-26',
    );
    // Fixture rows cross the read cap while the proposal and first claim come from registered APIs.
    execFileSync('sqlite3', [
      file,
      `with recursive seq(n) as (
      select 1 union all select n+1 from seq where n<100
    ) insert into proposal_approval_statements
      (id,proposal_id,user_id,proposal_revision_id,target_revision_fingerprint,statement,
       source_id,source_occurred_at,recorded_by_json,created_at)
      select 'browser-overflow-'||seq.n,s.proposal_id,s.user_id,s.proposal_revision_id,
        s.target_revision_fingerprint,'Fictional audit overflow '||seq.n,
        'browser-overflow-source-'||seq.n,s.source_occurred_at,s.recorded_by_json,s.created_at
      from proposal_approval_statements s cross join seq where s.id='${capturedStatement.id}'`,
    ]);
    try {
      const overflow = await owner.get(
        `/api/v1/plan-change-proposals/${pending.id}/approval-statements`,
      );
      expect(overflow.status()).toBe(422);
      expect((await overflow.json()).error.code).toBe(
        'PROPOSAL_APPROVAL_STATEMENT_READ_LIMIT_EXCEEDED',
      );
      for (const width of [320, 375, 390, 1280]) {
        await page.setViewportSize({ width, height: width === 1280 ? 900 : 844 });
        await page.reload({ waitUntil: 'networkidle' });
        const proposal = page.locator(`[data-proposal-id="${pending.id}"]`);
        await expect(proposal).toContainText('Approval pending; no plan effect executed.');
        await expect(proposal).toContainText(
          'Statement audit unavailable; no statement list was returned.',
        );
        const alert = proposal.getByRole('alert');
        await expect(alert).toContainText('422');
        await expect(alert).toContainText('PROPOSAL_APPROVAL_STATEMENT_READ_LIMIT_EXCEEDED');
        await expect(alert.getByRole('button', { name: 'Try again' })).toBeVisible();
        const geometry = await alert.locator('p').evaluate((element) => {
          const card = element.closest('[role="alert"]');
          if (!card) throw new Error('Approval error card is missing');
          return {
            clientWidth: element.clientWidth,
            scrollWidth: element.scrollWidth,
            right: element.getBoundingClientRect().right,
            cardRight: card.getBoundingClientRect().right,
          };
        });
        expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.clientWidth + 1);
        expect(geometry.right).toBeLessThan(geometry.cardRight);
        await page.screenshot({
          path: test.info().outputPath(`approval-statement-overflow-${width}.png`),
          fullPage: true,
        });
      }
      const expected422 =
        'Failed to load resource: the server responded with a status of 422 (Unprocessable Entity)';
      expect(consoleErrors.length).toBeGreaterThanOrEqual(4);
      expect(consoleErrors.every((message) => message === expected422)).toBe(true);
      consoleErrors.length = 0;
    } finally {
      execFileSync('sqlite3', [
        file,
        "delete from proposal_approval_statements where id like 'browser-overflow-%'",
      ]);
    }
    await page.reload({ waitUntil: 'networkidle' });
    await expect(page.locator(`[data-statement-id="${capturedStatement.id}"]`)).toBeVisible();
    await page.goto('/calendar', { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Agenda' }).click();
    await expect(
      page.locator(`[data-local-date="2026-09-26"] [data-record-id="${pendingAssignment.id}"]`),
    ).toBeVisible();
    await expect(
      page.locator(`[data-local-date="2026-09-27"] [data-record-id="${pendingAssignment.id}"]`),
    ).toHaveCount(0);
    const approvedAssignment = await write<{ id: string }>(
      agent,
      `/api/v1/activities/${activityId}/assignments`,
      {
        plannedLocalDate: '2026-09-28',
        timeZone: 'America/Detroit',
        recurrenceRevisionId: null,
        idempotencyKey: 'activity-183-approved-assignment',
      },
    );
    const approvedProposal = await write<{
      id: string;
      currentRevisionId: string;
      targetRevisionFingerprint: string;
    }>(agent, '/api/v1/plan-change-proposals', {
      summary: 'Fictional approved future move',
      effects: [
        {
          kind: 'activity_assignment_reschedule',
          assignmentId: approvedAssignment.id,
          expectedRevision: 1,
          plannedLocalDate: '2026-09-29',
          timeZone: 'America/Detroit',
          reason: 'Explicit user instruction',
        },
      ],
      sourceReferences: [],
      idempotencyKey: 'activity-183-approved-proposal',
    });
    await page.goto(`/activity/${activityId}?proposal=${approvedProposal.id}`, {
      waitUntil: 'networkidle',
    });
    await page.reload({ waitUntil: 'networkidle' });
    await expect(page.locator(`[data-occurrence-id="${approvedAssignment.id}"]`)).toContainText(
      '2026-09-28',
    );
    await expect(page.locator(`[data-proposal-id="${approvedProposal.id}"]`)).toContainText(
      'Approval pending; no plan effect executed.',
    );
    const approvalResponse = await owner.post(
      `/api/v1/plan-change-proposals/${approvedProposal.id}/approval`,
      {
        data: {
          proposalRevisionId: approvedProposal.currentRevisionId,
          targetRevisionFingerprint: approvedProposal.targetRevisionFingerprint,
          idempotencyKey: 'activity-183-approve',
        },
      },
    );
    expect(approvalResponse.status(), await approvalResponse.text()).toBe(200);
    const approvedReadback = (await approvalResponse.json()).data;
    expect(approvedReadback.approval.approvedBy.kind).toBe('user');
    expect(approvedReadback.approval.relayedBy).toBeNull();
    await page.reload({ waitUntil: 'networkidle' });
    await expect(page.locator(`[data-occurrence-id="${approvedAssignment.id}"]`)).toContainText(
      '2026-09-29',
    );
    await expect(page.locator(`[data-proposal-id="${approvedProposal.id}"]`)).toContainText(
      'Approved by user',
    );
    await page.goto('/calendar', { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Agenda' }).click();
    await expect(
      page.locator(`[data-local-date="2026-09-29"] [data-record-id="${approvedAssignment.id}"]`),
    ).toBeVisible();
    const committedAssignment = await read<{
      assignments: Array<{ id: string; plannedLocalDate: string }>;
    }>(owner, `/api/v1/activities/${activityId}`);
    expect(
      committedAssignment.assignments.find((item) => item.id === approvedAssignment.id)
        ?.plannedLocalDate,
    ).toBe('2026-09-29');
    const pendingReadback = await read<{ state: string; approval: null }>(
      owner,
      `/api/v1/plan-change-proposals/${pending.id}`,
    );
    expect(pendingReadback).toMatchObject({ state: 'proposed', approval: null });

    const currentShoulder = await read<{ concern: { currentRevisionId: string } }>(
      owner,
      `/api/v1/body-context/concerns/${shoulder.concern.id}`,
    );
    const questionInput = {
      localDate: '2026-09-24',
      semanticTopic: 'fictional shoulder follow-up',
      prompt: 'How did the shoulder feel later?',
      sourceReferences: [
        {
          kind: 'body_concern',
          id: shoulder.concern.id,
          revisionId: currentShoulder.concern.currentRevisionId,
        },
      ],
      followUpQuestionId: null,
    };
    const question = await write<{ question: { questionId: string; id: string } }>(
      agent,
      '/api/v1/check-in/questions',
      { ...questionInput, idempotencyKey: 'activity-183-question-a' },
    );
    const resumed = await write<{ question: { questionId: string } }>(
      agentB,
      '/api/v1/check-in/questions',
      { ...questionInput, idempotencyKey: 'activity-183-question-b' },
    );
    expect(resumed.question.questionId).toBe(question.question.questionId);
    await write(agentB, `/api/v1/check-in/questions/${question.question.questionId}/answers`, {
      expectedQuestionRevisionId: question.question.id,
      expectedAnswerRevision: 0,
      state: 'unknown',
      source: journalSource,
      idempotencyKey: 'activity-183-answer',
    });

    const calendarResponse = await owner.get('/api/v1/calendar?from=2026-09-22&to=2026-09-29');
    expect(calendarResponse.ok(), await calendarResponse.text()).toBeTruthy();
    const calendar = (await calendarResponse.json()).data as {
      items: Array<{ id: string; sourceReference?: { revisionId: string } }>;
    };
    const executionRevisionId = calendar.items.find((item) => item.id === execution.id)
      ?.sourceReference?.revisionId;
    expect(executionRevisionId).toBeTruthy();
    const journal = await write<{ observation: { id: string; currentRevisionId: string } }>(
      agent,
      '/api/v1/journal',
      {
        localDate: '2026-09-24',
        title: 'Fictional mobility observation',
        content: 'I completed the Tuesday mobility item on Thursday.',
        category: 'movement',
        sourceReferences: [
          { kind: 'activity_execution', id: execution.id, revisionId: executionRevisionId },
        ],
        source: journalSource,
        idempotencyKey: 'activity-183-journal',
      },
    );
    const journalCorrection = await agent.post(
      `/api/v1/journal/${journal.observation.id}/corrections`,
      {
        data: {
          expectedRevisionId: journal.observation.currentRevisionId,
          correctedFields: {
            content:
              'I completed the Tuesday mobility item on Thursday; shoulder tightness was also recorded.',
            sourceReferences: [
              {
                kind: 'body_concern',
                id: shoulder.concern.id,
                revisionId: currentShoulder.concern.currentRevisionId,
              },
            ],
          },
          reason: 'Fictional source clarification',
          idempotencyKey: 'activity-183-journal-correction',
        },
      },
    );
    expect(journalCorrection.status(), await journalCorrection.text()).toBe(200);
    const correctedJournal = (await journalCorrection.json()).data as {
      observation: { currentRevisionId: string };
      history: Array<{
        id: string;
        observation: { content: string; sourceReferences: Array<{ id: string }> };
      }>;
    };
    expect(correctedJournal.history[0]?.id).toBe(journal.observation.currentRevisionId);
    expect(correctedJournal.history[0]?.observation.content).toBe(
      'I completed the Tuesday mobility item on Thursday.',
    );
    expect(correctedJournal.history[0]?.observation.sourceReferences[0]?.id).toBe(execution.id);
    const suggestion = await write<{ observation: { id: string } }>(agent, '/api/v1/journal', {
      localDate: '2026-09-24',
      title: 'Fictional agent suggestion',
      content: 'Consider asking about comfort; this is an agent suggestion.',
      category: 'health',
      sourceReferences: [
        {
          kind: 'body_concern',
          id: shoulder.concern.id,
          revisionId: currentShoulder.concern.currentRevisionId,
        },
      ],
      source: { ...journalSource, class: 'agent_suggestion' },
      idempotencyKey: 'activity-183-suggestion',
    });
    expect(suggestion.observation.id).toBeTruthy();
    const dailyReadback = await read<{ currentAnswers: Array<{ state: string }> }>(
      owner,
      '/api/v1/daily-context?date=2026-09-24',
    );
    expect(dailyReadback.currentAnswers.map((item) => item.state)).toEqual(['unknown']);
    const weeklyReadback = await read<{ facts: unknown[]; gaps: string[] }>(
      owner,
      '/api/v1/journal/weekly-reflection?start=2026-09-22&end=2026-09-28',
    );
    expect(weeklyReadback.facts.length).toBeGreaterThan(0);
    expect(weeklyReadback.gaps).toContain('2026-09-25: workout missing');
    const flareReadback = await read<{ flares: Array<{ id: string }> }>(
      owner,
      `/api/v1/body-context/concerns/${shoulder.concern.id}`,
    );
    expect(flareReadback.flares.map((item) => item.id)).toContain(flare.id);
    // Fixture-DB only: legacy capture has no registered write API. Primary canonical facts above use registered writes.
    execFileSync('sqlite3', [
      file,
      `insert into activities (id,user_id,date,type,name,duration_minutes,created_at,updated_at) values ('legacy-activity-183','${user.id}','2026-09-24','walking','Fictional legacy walk',10,1000,1000); insert into journal_entries (id,user_id,date,title,type,content,created_by,created_at,updated_at) values ('legacy-journal-183','${user.id}','2026-09-24','Fictional legacy note','observation','Legacy words without source.','user',1000,1000);`,
    ]);
    const paths = {
      activities: '/api/v1/activities?page=1&limit=100',
      activity: `/api/v1/activities/${activityId}`,
      journal: '/api/v1/journal?from=2026-09-22&to=2026-09-28',
      journalDetail: `/api/v1/journal/${journal.observation.id}`,
      weekly: '/api/v1/journal/weekly-reflection?start=2026-09-22&end=2026-09-28',
      daily: '/api/v1/daily-context?date=2026-09-24',
      upperSession: `/api/v1/workout-sessions/${upperSession.id}/session-context`,
      lowerSession: `/api/v1/workout-sessions/${lowerSession.id}/session-context`,
      whatMatters: '/api/v1/planning/what-matters?date=2026-09-24',
      pendingProposal: `/api/v1/plan-change-proposals/${pending.id}`,
      pendingStatements: `/api/v1/plan-change-proposals/${pending.id}/approval-statements`,
      approvedProposal: `/api/v1/plan-change-proposals/${approvedProposal.id}`,
      calendar: '/api/v1/calendar?from=2026-09-22&to=2026-09-29',
    };
    const envelopes: Record<string, unknown> = {};
    const registeredBodies: Record<string, { path: string; body: string; sha256: string }> = {};
    for (const [name, path] of Object.entries(paths)) {
      const response = await owner.get(path);
      expect(response.ok(), await response.text()).toBeTruthy();
      const body = await response.text();
      registeredBodies[name] = {
        path,
        body,
        sha256: createHash('sha256').update(body).digest('hex'),
      };
      envelopes[name] = JSON.parse(body);
    }
    const rawPath = test.info().outputPath('registered-get-bodies.json');
    writeFileSync(rawPath, JSON.stringify(registeredBodies, null, 2));
    const embedded = JSON.stringify({ paths, envelopes }).replaceAll('<', '\\u003c');
    const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Pulse #183 registered API fixture</title><style>body{font:16px system-ui;max-width:70rem;margin:auto;padding:1.5rem;background:#101823;color:#edf3f8}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#1e2a38;padding:1rem;border-radius:.75rem}summary{cursor:pointer;padding:.7rem}</style><h1>Pulse #183 registered API fixture</h1><p>Fictional America/Detroit owner. These envelopes were copied from registered authenticated GETs; this file is supplementary evidence, not the live UI.</p><main id="records"></main><script type="application/json" id="fixtures">${embedded}</script><script>const fixture=JSON.parse(document.getElementById('fixtures').textContent);for(const [name,path] of Object.entries(fixture.paths)){const details=document.createElement('details');const summary=document.createElement('summary');summary.textContent=name+' · '+path;const pre=document.createElement('pre');pre.textContent=JSON.stringify(fixture.envelopes[name],null,2);details.append(summary,pre);document.getElementById('records').append(details)}</script></html>`;
    const htmlPath = test.info().outputPath('live-ui.html');
    writeFileSync(htmlPath, html);
    const fileOnDisk = readFileSync(htmlPath, 'utf8');
    const bodiesOnDisk = JSON.parse(readFileSync(rawPath, 'utf8')) as typeof registeredBodies;
    const match = fileOnDisk.match(
      /<script type="application\/json" id="fixtures">([\s\S]*?)<\/script>/u,
    );
    if (!match?.[1]) throw new Error('HTML fixture payload missing');
    const saved = JSON.parse(match[1]) as {
      paths: Record<string, string>;
      envelopes: Record<string, unknown>;
    };
    expect(saved.paths).toEqual(paths);
    for (const [name, capture] of Object.entries(bodiesOnDisk)) {
      expect(createHash('sha256').update(capture.body).digest('hex')).toBe(capture.sha256);
      expect(saved.paths[name]).toBe(capture.path);
      expect(saved.envelopes[name]).toEqual(JSON.parse(capture.body));
    }
    await setAuthenticatedSession(page, token);
    await page.goto('/calendar', { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Agenda' }).click();
    const planned = page.locator(`[data-record-id="${assignment.id}"]`);
    const actual = page.locator(`[data-record-id="${execution.id}"]`);
    await expect(planned).toBeVisible();
    await expect(actual).toBeVisible();
    await expect(
      page.locator(`[data-local-date="2026-09-26"] [data-record-id="${pendingAssignment.id}"]`),
    ).toBeVisible();
    await expect(
      page.locator(`[data-local-date="2026-09-29"] [data-record-id="${approvedAssignment.id}"]`),
    ).toBeVisible();
    await actual.click();
    await page.reload({ waitUntil: 'networkidle' });
    await expect(page.locator(`[data-occurrence-id="${execution.id}"]`)).toBeVisible();
    await expect(page.getByText('Actual 2026-09-24 · completed')).toBeVisible();
    await page.goto('/calendar', { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Agenda' }).click();
    await page.locator(`[data-record-id="${assignment.id}"]`).click();
    await page.reload({ waitUntil: 'networkidle' });
    await expect(page.locator(`[data-occurrence-id="${assignment.id}"]`)).toBeVisible();
    await expect(page.getByText('Planned 2026-09-22 · completed', { exact: true })).toBeVisible();
    await page.goto('/calendar', { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Agenda' }).click();
    await page.locator(`[data-record-id="${journal.observation.id}"]`).click();
    await page.reload({ waitUntil: 'networkidle' });
    await expect(
      page.locator(`[data-record-id="${journal.observation.id}"]`).first(),
    ).toBeVisible();
    await page.goto('/calendar', { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Agenda' }).click();
    await page.locator(`[data-record-id="${flare.id}"]`).click();
    await page.reload({ waitUntil: 'networkidle' });
    await expect(
      page
        .getByRole('region', { name: 'Daily check-in' })
        .locator(`[data-record-id="${flare.id}"]`),
    ).toBeVisible();
    await page.goto('/calendar', { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Agenda' }).click();
    await page.locator('[data-record-id="legacy-journal-183"]').click();
    await page.reload({ waitUntil: 'networkidle' });
    await expect(page.locator('[data-record-id="legacy-journal-183"]')).toContainText(
      'provenance missing',
    );
    await page.goto(`/activity/${activityId}?proposal=${pending.id}`, { waitUntil: 'networkidle' });
    await page.reload({ waitUntil: 'networkidle' });
    await expect(page.locator(`[data-proposal-id="${pending.id}"]`)).toContainText(
      'Approval pending; no plan effect executed.',
    );
    await page.goto(`/activity/${activityId}?proposal=${approvedProposal.id}`, {
      waitUntil: 'networkidle',
    });
    await page.reload({ waitUntil: 'networkidle' });
    await expect(page.locator(`[data-proposal-id="${approvedProposal.id}"]`)).toContainText(
      'Approved by user',
    );
    await expect(page.locator(`[data-proposal-id="${approvedProposal.id}"]`)).toContainText(
      'Relayed by none',
    );
    await expect(page.locator(`[data-occurrence-id="${approvedAssignment.id}"]`)).toContainText(
      '2026-09-29',
    );
    await expect(page.locator(`[data-occurrence-id="${pendingAssignment.id}"]`)).toContainText(
      '2026-09-26',
    );
    await page.goto(`/journal/${journal.observation.id}`, { waitUntil: 'networkidle' });
    await page.reload({ waitUntil: 'networkidle' });
    await expect(
      page
        .getByText(
          'I completed the Tuesday mobility item on Thursday; shoulder tightness was also recorded.',
        )
        .first(),
    ).toBeVisible();
    await page.getByText('Revision history').click();
    const priorJournalRevision = page.locator(
      `[data-revision-id="${journal.observation.currentRevisionId}"]`,
    );
    await expect(priorJournalRevision).toContainText(
      'I completed the Tuesday mobility item on Thursday.',
    );
    await expect(priorJournalRevision.locator(`[data-source-id="${execution.id}"]`)).toContainText(
      'referenced revision',
    );
    await page
      .locator(`[data-source-id="${shoulder.concern.id}"]`)
      .first()
      .getByRole('button')
      .click();
    await expect(page.locator(`[data-source-id="${shoulder.concern.id}"]`).first()).toContainText(
      'Exact recorded revision',
    );
    await page.locator(`[data-source-id="${execution.id}"]`).getByRole('link').click();
    await page.reload({ waitUntil: 'networkidle' });
    await expect(page.locator(`[data-occurrence-id="${execution.id}"]`)).toBeVisible();
    await page.goto('/journal?date=2026-09-24', { waitUntil: 'networkidle' });
    await expect(page.getByRole('link', { name: /Fictional agent suggestion/ })).toContainText(
      'agent suggestion',
    );
    await expect(page.getByText('Answer: unknown')).toBeVisible();
    await expect(page.getByRole('region', { name: 'Daily check-in' })).toContainText(
      'Fictional shoulder tightness; cause unknown.',
    );
    await page.goto('/journal?date=2026-09-28', { waitUntil: 'networkidle' });
    await expect(page.getByRole('region', { name: 'Weekly reflection' })).toContainText(
      '2026-09-25: workout missing',
    );
    await page.goto('/journal?date=2026-09-24', { waitUntil: 'networkidle' });
    await page.screenshot({ path: test.info().outputPath('journal-desktop.png'), fullPage: true });
    await page.goto(`/workouts/active?sessionId=${upperSession.id}`, { waitUntil: 'networkidle' });
    await expandSessionContext(page);
    await expect(page.getByText('Fictional shoulder sensitivity')).toBeVisible();
    await expect(page.getByText('Fictional knee concern')).toBeVisible();
    await expect(page.getByText('Fictional upper-body control')).toBeVisible();
    await expect(page.getByText(/sleep.*training_phase/)).toBeVisible();
    for (const sourceId of [
      shoulder.concern.id,
      upperFocus.capability.id,
      shoulderGuidance.guidance.id,
    ]) {
      const audit = page.locator(`[data-source-id="${sourceId}"]`);
      await audit.getByRole('button').click();
      await expect(audit).toContainText('Exact recorded revision');
    }
    await page.screenshot({
      path: test.info().outputPath('upper-session-desktop.png'),
      fullPage: true,
    });
    await page.goto(`/workouts/active?sessionId=${lowerSession.id}`, { waitUntil: 'networkidle' });
    await expandSessionContext(page);
    await expect(page.getByText('Fictional quad tightness')).toBeVisible();
    await expect(page.getByText('Fictional lower-body control')).toBeVisible();
    await expect(page.locator(`[data-source-id="${execution.id}"]`).first()).toContainText(
      'referenced revision',
    );
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload({ waitUntil: 'networkidle' });
    await expandSessionContext(page);
    await expect(page.getByText('Fictional quad tightness')).toBeVisible();
    await page.screenshot({
      path: test.info().outputPath('lower-session-mobile.png'),
      fullPage: true,
    });
    // Fixture-DB uncertainty probe: no registered API can erase a saved exercise's muscle identity.
    execFileSync('sqlite3', [
      file,
      `update exercises set muscle_groups='null' where id='${lowerExercise.id}' and user_id='${user.id}';`,
    ]);
    try {
      await page.reload({ waitUntil: 'networkidle' });
      await expandSessionContext(page);
      await expect(page.getByText(/Missing muscle identity for 1 set/)).toBeVisible();
      await expect(
        page.getByRole('heading', { name: 'Uncertain relevance' }).locator('..'),
      ).toContainText('Fictional quad tightness');
      await page.screenshot({
        path: test.info().outputPath('uncertain-session-mobile.png'),
        fullPage: true,
      });
    } finally {
      execFileSync('sqlite3', [
        file,
        `update exercises set muscle_groups='["quads"]' where id='${lowerExercise.id}' and user_id='${user.id}';`,
      ]);
    }
    await page.goto('/calendar', { waitUntil: 'networkidle' });
    const agendaButton = page.getByRole('button', { name: 'Agenda' });
    await agendaButton.focus();
    await expect(agendaButton).toBeFocused();
    await agendaButton.click();
    await page.locator(`[data-record-id="${execution.id}"]`).click();
    await page.reload({ waitUntil: 'networkidle' });
    await expect(page.locator(`[data-occurrence-id="${execution.id}"]`)).toBeVisible();
    await page.goto('/journal?date=2026-09-24', { waitUntil: 'networkidle' });
    await expect(
      page.locator(`[data-record-id="${journal.observation.id}"]`).first(),
    ).toBeVisible();
    await page.screenshot({ path: test.info().outputPath('journal-mobile.png'), fullPage: true });
    await page.goto('/activity', { waitUntil: 'networkidle' });
    await expect(page.getByText('Fictional mobility')).toBeVisible();
    await expect(page.getByText('Fictional legacy walk')).toBeVisible();
    await page.screenshot({ path: test.info().outputPath('activity-mobile.png'), fullPage: true });
    await page.getByText('Fictional legacy walk').click();
    await page.reload({ waitUntil: 'networkidle' });
    await expect(page.getByText(/Legacy date only: 2026-09-24/)).toBeVisible();
    expect(consoleErrors).toEqual([]);
    // Fixture-DB overflow only: preserve registered canonical seed, exercise a real owner-scoped server 422.
    execFileSync('sqlite3', [
      file,
      `with recursive seq(n) as (select 1 union all select n+1 from seq where n<1000) insert into journal_entries (id,user_id,date,title,type,content,created_by,created_at,updated_at) select 'overflow-183-'||n,'${user.id}','2026-09-24','Fictional overflow','observation','Fixture-only limit row','user',1000,1000 from seq;`,
    ]);
    try {
      const overflow = await owner.get('/api/v1/journal?from=2026-09-01&to=2026-09-24');
      expect(overflow.status(), await overflow.text()).toBe(422);
      expect((await overflow.json()).error).toMatchObject({
        code: 'JOURNAL_READ_LIMIT_EXCEEDED',
        details: { scope: 'journal_list_legacy' },
      });
      await page.goto('/journal?date=2026-09-24', { waitUntil: 'networkidle' });
      await expect(page.getByRole('alert')).toContainText('422');
      await expect(page.getByRole('alert')).toContainText('JOURNAL_READ_LIMIT_EXCEEDED');
      await page.screenshot({
        path: test.info().outputPath('real-422-mobile.png'),
        fullPage: true,
      });
    } finally {
      execFileSync('sqlite3', [
        file,
        "delete from journal_entries where id like 'overflow-183-%';",
      ]);
    }
    await page.goto('/activity/absent-183', { waitUntil: 'networkidle' });
    await expect(page.getByRole('alert')).toContainText('404');
    await page.goto('/journal/absent-183', { waitUntil: 'networkidle' });
    await expect(page.getByRole('alert')).toContainText('404');
    const foreignRegistration = await anonymous.post('/api/v1/auth/register', {
      data: {
        username: `foreign183-${Date.now()}`,
        password: 'fictional-foreign-183-password',
        timeZone: 'America/Detroit',
      },
    });
    expect(foreignRegistration.ok(), await foreignRegistration.text()).toBeTruthy();
    const foreignToken = ((await foreignRegistration.json()).data as { token: string }).token;
    const foreign = await request.newContext({
      baseURL: apiBaseURL,
      extraHTTPHeaders: { Authorization: `Bearer ${foreignToken}` },
    });
    try {
      const foreignActivity = await foreign.get(`/api/v1/activities/${activityId}`);
      expect(foreignActivity.status()).toBe(404);
      const foreignContext = await foreign.get(
        `/api/v1/workout-sessions/${upperSession.id}/session-context`,
      );
      expect(foreignContext.status()).toBe(404);
      await setAuthenticatedSession(page, foreignToken);
      await page.goto('/activity', { waitUntil: 'networkidle' });
      await expect(page.getByText('No activities recorded.')).toBeVisible();
      await page.goto('/journal?date=2026-09-24', { waitUntil: 'networkidle' });
      await expect(page.getByText('No Journal observations recorded.')).toBeVisible();
      await page.screenshot({
        path: test.info().outputPath('empty-owner-mobile.png'),
        fullPage: true,
      });
    } finally {
      await foreign.dispose();
    }
    const unauthApi = await anonymous.get('/api/v1/activities');
    expect(unauthApi.status()).toBe(401);
    const unauthContext = await browser.newContext();
    try {
      const unauthPage = await unauthContext.newPage();
      await unauthPage.goto(`${new URL(page.url()).origin}/activity`, { waitUntil: 'networkidle' });
      await expect(unauthPage).toHaveURL(/\/login/u);
    } finally {
      await unauthContext.close();
    }
  } finally {
    await agentB.dispose();
    await agent.dispose();
    await owner.dispose();
    await anonymous.dispose();
  }
});
