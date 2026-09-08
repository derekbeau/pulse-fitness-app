import { expect, request, test, type Page } from '@playwright/test';

const suffix = Date.now();
const apiBaseURL = 'http://127.0.0.1:3125';
const authStorageKey = 'pulse-auth-token';
const user = {
  username: `feedback-150-${suffix}`,
  password: 'Synthetic-150-only!',
  timeZone: 'America/Detroit',
};

let bearerToken = '';
let agentToken = '';
let agentTokenId = '';
let exerciseId = '';
let workoutExerciseId = '';
let templateId = '';
let today = '';

const question = () => ({
  id: 'tib-bar-response',
  prompt: 'What did the left lower leg do during tib-bar raises?',
  type: 'multi_select' as const,
  optional: true,
  timing: 'post_session' as const,
  config: {
    options: ['None', 'Pain', 'Tightness', 'Could not test'],
    exclusiveOption: 'None',
  },
  exerciseIdSnapshot: exerciseId,
  exerciseNameSnapshot: 'Synthetic Tibialis Raise',
  bodyRegion: 'lower leg',
  laterality: 'left' as const,
  concernRef: 'fictional-tib-150',
  contextLabel: 'Synthetic acceptance only',
});

const nextCheckQuestion = {
  id: 'next-check',
  prompt: 'How did the lower leg feel at the next check-in?',
  type: 'text' as const,
  optional: true,
  timing: 'next_check_in' as const,
  config: {},
};

async function authorizedApi() {
  return request.newContext({
    baseURL: apiBaseURL,
    extraHTTPHeaders: { Authorization: `Bearer ${bearerToken}` },
  });
}

async function authenticatePage(page: Page) {
  await page.addInitScript(([key, token]) => localStorage.setItem(key, token), [
    authStorageKey,
    bearerToken,
  ] as const);
}

function tomorrow(dateKey: string) {
  const date = new Date(`${dateKey}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

test.describe.serial('workout feedback questions frozen acceptance', () => {
  test.beforeAll(async () => {
    const anonymous = await request.newContext({ baseURL: apiBaseURL });
    const registered = await anonymous.post('/api/v1/auth/register', { data: user });
    expect(registered.status(), await registered.text()).toBe(201);
    bearerToken = ((await registered.json()) as { data: { token: string } }).data.token;
    await anonymous.dispose();

    const api = await authorizedApi();
    const authority = await api.get('/api/v1/adaptive-nutrition');
    expect(authority.ok(), await authority.text()).toBeTruthy();
    today = ((await authority.json()) as { data: { localDate: string } }).data.localDate;

    const exercise = await api.post('/api/v1/exercises', {
      data: {
        category: 'isolation',
        equipment: 'other',
        muscleGroups: ['calves'],
        name: 'Synthetic Tibialis Raise',
      },
    });
    expect(exercise.status(), await exercise.text()).toBe(201);
    exerciseId = ((await exercise.json()) as { data: { id: string } }).data.id;
    const workoutExercise = await api.post('/api/v1/exercises', {
      data: {
        category: 'isolation',
        equipment: 'other',
        muscleGroups: ['calves'],
        name: 'Synthetic Tib Bar',
      },
    });
    expect(workoutExercise.status(), await workoutExercise.text()).toBe(201);
    workoutExerciseId = ((await workoutExercise.json()) as { data: { id: string } }).data.id;

    const token = await api.post('/api/v1/agent-tokens', {
      data: { name: 'Synthetic #150 author' },
    });
    expect(token.status(), await token.text()).toBe(201);
    const tokenData = (await token.json()) as { data: { id: string; token: string } };
    agentToken = tokenData.data.token;
    agentTokenId = tokenData.data.id;

    const authored = await api.post('/api/v1/workout-templates', {
      headers: { Authorization: `AgentToken ${agentToken}` },
      data: {
        name: `Synthetic tib-bar ${suffix}`,
        sections: [
          {
            type: 'main',
            exercises: [
              {
                exerciseId: workoutExerciseId,
                sets: 1,
                repsMin: 8,
                repsMax: 12,
                restSeconds: 60,
                cues: [],
              },
            ],
          },
        ],
        feedbackQuestions: [nextCheckQuestion],
      },
    });
    expect(authored.status(), await authored.text()).toBe(201);
    templateId = ((await authored.json()) as { data: { id: string } }).data.id;
    await api.dispose();
  });

  test.afterAll(async () => {
    if (!agentTokenId) return;
    const api = await authorizedApi();
    await api.delete(`/api/v1/agent-tokens/${agentTokenId}`);
    await api.dispose();
  });

  test('freezes both scheduled launch surfaces and retains draft, correction, and raw evidence', async ({
    page,
  }, testInfo) => {
    test.setTimeout(120_000);
    const pageErrors: string[] = [];
    const consoleMessages: string[] = [];
    const network: Array<{ method: string; path: string; status: number }> = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') consoleMessages.push(message.text());
    });
    page.on('response', (response) => {
      const url = new URL(response.url());
      if (url.pathname.startsWith('/api/')) {
        network.push({
          method: response.request().method(),
          path: url.pathname,
          status: response.status(),
        });
      }
    });

    const api = await authorizedApi();
    const createSchedule = async (date: string) => {
      const response = await api.post('/api/v1/scheduled-workouts', {
        data: { templateId, date },
      });
      expect(response.status(), await response.text()).toBe(201);
      const scheduled = (await response.json()) as {
        data: { id: string; feedbackQuestions: { revision: number } };
      };
      const override = await api.patch(`/api/v1/scheduled-workouts/${scheduled.data.id}`, {
        headers: { Authorization: `AgentToken ${agentToken}` },
        data: {
          feedbackQuestions: [question(), nextCheckQuestion],
          feedbackQuestionsExpectedRevision: scheduled.data.feedbackQuestions.revision,
        },
      });
      expect(override.ok(), await override.text()).toBeTruthy();
      return (await override.json()) as {
        data: { id: string; feedbackQuestions: { revision: number; questions: unknown[] } };
      };
    };

    const listSchedule = await createSchedule(today);
    const detailSchedule = await createSchedule(tomorrow(today));
    await testInfo.attach('scheduled-api-readback', {
      body: JSON.stringify({ listSchedule, detailSchedule }, null, 2),
      contentType: 'application/json',
    });

    await authenticatePage(page);
    await page.setViewportSize({ width: 375, height: 900 });
    await page.goto('/workouts?view=list');
    const scheduledCard = page
      .locator('[data-slot="card"]')
      .filter({ hasText: `Synthetic tib-bar ${suffix}` })
      .first();
    await scheduledCard.getByRole('button', { name: 'Start', exact: true }).click();
    await expect(page).toHaveURL(/\/workouts\/active\?/);
    const listSessionId = new URL(page.url()).searchParams.get('sessionId');
    expect(listSessionId).toBeTruthy();
    const listSessionResponse = await api.get(`/api/v1/workout-sessions/${listSessionId}`);
    const listSession = (await listSessionResponse.json()) as {
      data: { feedbackQuestions: unknown };
    };
    expect(
      (listSession.data.feedbackQuestions as { questions: unknown[] }).questions.slice(3),
    ).toEqual(listSchedule.data.feedbackQuestions.questions);

    const cancelled = await api.post(`/api/v1/workout-sessions/${listSessionId}/cancel`);
    expect(cancelled.ok(), await cancelled.text()).toBeTruthy();
    await page.goto(`/workouts/scheduled/${detailSchedule.data.id}`);
    await page.getByRole('button', { name: 'Start workout' }).click();
    const earlyDialog = page.getByRole('alertdialog');
    await expect(earlyDialog).toBeVisible();
    await earlyDialog.getByRole('button', { name: 'Start now' }).click();
    const duplicateConfirmation = page.getByRole('button', { name: 'Start anyway' });
    if (await duplicateConfirmation.isVisible({ timeout: 2_000 })) {
      await duplicateConfirmation.click();
    }
    await expect(page).toHaveURL(/\/workouts\/active\?/);
    const sessionId = new URL(page.url()).searchParams.get('sessionId');
    expect(sessionId).toBeTruthy();
    const startedResponse = await api.get(`/api/v1/workout-sessions/${sessionId}`);
    const started = (await startedResponse.json()) as {
      data: {
        feedbackQuestions: { questions: Array<{ id: string; version: number }> };
        sets: unknown[];
        startedAt: number;
      };
    };
    expect(started.data.feedbackQuestions.questions.slice(3)).toEqual(
      detailSchedule.data.feedbackQuestions.questions,
    );

    await page.getByRole('button', { name: 'Complete Workout' }).click();
    await page.getByRole('button', { name: 'Complete', exact: true }).click();
    await expect(page.getByRole('heading', { name: question().prompt })).toBeVisible();
    await expect(page.getByText(nextCheckQuestion.prompt)).toHaveCount(0);

    let failOneDraft = true;
    await page.route(`**/api/v1/workout-sessions/${sessionId}`, async (route) => {
      if (route.request().method() === 'PATCH' && failOneDraft) {
        failOneDraft = false;
        await route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ error: { code: 'SYNTHETIC_FAILURE', message: 'Retry me' } }),
        });
      } else {
        await route.continue();
      }
    });
    await page
      .getByRole('group', { name: 'Any pain or discomfort? response' })
      .getByRole('button', { name: 'No' })
      .click();
    await expect(page.getByText(/Draft not saved/)).toBeVisible();
    await page.unroute(`**/api/v1/workout-sessions/${sessionId}`);
    await page
      .getByRole('group', { name: 'Session RPE rating' })
      .getByRole('button', { name: '1: Very easy', exact: true })
      .click();
    await page
      .getByRole('group', { name: `${question().prompt} options` })
      .getByRole('button', { name: 'Pain' })
      .click();
    await expect
      .poll(async () => {
        const response = await api.get(`/api/v1/workout-sessions/${sessionId}`);
        const payload = (await response.json()) as {
          data: { feedbackAnswers?: { current: Array<{ questionId: string; value?: unknown }> } };
        };
        return payload.data.feedbackAnswers?.current.some(
          (answer) => answer.questionId === 'tib-bar-response' && String(answer.value) === 'Pain',
        );
      })
      .toBe(true);
    await page.reload();
    await page.getByRole('button', { name: 'Complete Workout' }).click();
    await page.getByRole('button', { name: 'Complete', exact: true }).click();
    await expect(
      page
        .getByRole('group', { name: 'Any pain or discomfort? response' })
        .getByRole('button', { name: 'No' }),
    ).toHaveAttribute('aria-pressed', 'true');
    await expect(
      page
        .getByRole('group', { name: `${question().prompt} options` })
        .getByRole('button', { name: 'Pain' }),
    ).toHaveAttribute('aria-pressed', 'true');
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    ).toBe(true);
    await page.screenshot({ path: testInfo.outputPath('feedback-375.png'), fullPage: true });

    const finalize = page.getByRole('button', { name: 'Finalize session' });
    await finalize.focus();
    await expect(finalize).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { name: 'Workout summary' })).toBeVisible();

    const completedResponse = await api.get(`/api/v1/workout-sessions/${sessionId}`);
    const completed = (await completedResponse.json()) as {
      data: {
        feedbackAnswers: { revision: number; current: unknown[]; history: unknown[] };
        feedbackQuestions: unknown;
        sets: unknown[];
        startedAt: number;
        completedAt: number;
      };
    };
    expect(completed.data.sets).toEqual(started.data.sets);
    expect(completed.data.startedAt).toBe(started.data.startedAt);
    const tib = completed.data.feedbackAnswers.current.find(
      (answer: unknown) => (answer as { questionId?: string }).questionId === 'tib-bar-response',
    ) as { definitionVersion: number };
    const correction = await api.patch(`/api/v1/workout-sessions/${sessionId}/corrections`, {
      headers: { Authorization: `AgentToken ${agentToken}` },
      data: {
        feedbackExpectedRevision: completed.data.feedbackAnswers.revision,
        feedbackResponses: [
          {
            questionId: 'tib-bar-response',
            definitionVersion: tib.definitionVersion,
            state: 'answered',
            value: ['Tightness'],
            notes: 'Synthetic correction; no medical inference.',
          },
        ],
      },
    });
    expect(correction.ok(), await correction.text()).toBeTruthy();
    const corrected = (await correction.json()) as typeof completed;
    expect(corrected.data.sets).toEqual(completed.data.sets);
    expect(corrected.data.startedAt).toBe(completed.data.startedAt);
    expect(corrected.data.completedAt).toBe(completed.data.completedAt);
    expect(corrected.data.feedbackAnswers.history.length).toBeGreaterThan(
      completed.data.feedbackAnswers.history.length,
    );

    const removed = await api.delete(`/api/v1/exercises/${exerciseId}`);
    expect(removed.ok(), await removed.text()).toBeTruthy();
    const afterDelete = await api.get(`/api/v1/workout-sessions/${sessionId}`);
    const frozenAfterDelete = await afterDelete.json();
    expect(frozenAfterDelete.data.feedbackQuestions).toEqual(completed.data.feedbackQuestions);

    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`/workouts/sessions/${sessionId}`);
    await expect(page.getByText('Synthetic correction; no medical inference.')).toHaveCount(2);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    ).toBe(true);
    await page.screenshot({ path: testInfo.outputPath('history-1280.png'), fullPage: true });
    await testInfo.attach('completed-corrected-deleted-readback', {
      body: JSON.stringify({ started, completed, corrected, frozenAfterDelete }, null, 2),
      contentType: 'application/json',
    });
    await testInfo.attach('accessibility-tree', {
      body: await page.getByRole('main').ariaSnapshot(),
      contentType: 'text/plain',
    });
    await testInfo.attach('console-network', {
      body: JSON.stringify({ pageErrors, consoleMessages, network }, null, 2),
      contentType: 'application/json',
    });
    expect(pageErrors).toEqual([]);
    expect(
      consoleMessages.filter(
        (message) =>
          message !==
          'Failed to load resource: the server responded with a status of 503 (Service Unavailable)',
      ),
    ).toEqual([]);
    expect(network.some((entry) => entry.status === 503)).toBe(true);
    await api.dispose();
  });
});
