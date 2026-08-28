import { expect, request, test, type APIRequestContext, type Page } from '@playwright/test';
import { adaptivePreviewFixtureContract } from './adaptive-preview-fixture-contract';
import { apiBaseURL } from './test-env';

test.use({ timezoneId: 'Pacific/Kiritimati' });

const authTokenStorageKey = 'pulse-auth-token';
const seedSuffix = Date.now();
const serverNow = process.env.PULSE_TEST_NOW ?? adaptivePreviewFixtureContract.serverNow;
const expectUtcNextDay = process.env.PULSE_EXPECT_UTC_NEXT_DAY === '1';

const testUser = {
  username: `wsched-e2e-${seedSuffix}`,
  password: 'super-secret-password',
  timeZone: 'America/Detroit',
};

const seededTemplate = {
  name: `E2E Workout Scheduling ${seedSuffix}`,
};

let authToken = '';
let agentToken = '';
let agentTokenId = '';
let seededTemplateId = '';
let resolvedLocalDate = '';

async function authenticatePage(page: Page) {
  await page.addInitScript(
    ([storageKey, token]) => {
      window.localStorage.setItem(storageKey, token);
    },
    [authTokenStorageKey, authToken] as const,
  );
}

function addDays(dateKey: string, days: number) {
  const [year, month, day] = dateKey.split('-').map(Number);
  const next = new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1));
  next.setUTCDate(next.getUTCDate() + days);
  const nextYear = next.getUTCFullYear();
  const nextMonth = `${next.getUTCMonth() + 1}`.padStart(2, '0');
  const nextDay = `${next.getUTCDate()}`.padStart(2, '0');
  return `${nextYear}-${nextMonth}-${nextDay}`;
}

function getDateRange(dateKey = resolvedLocalDate) {
  return {
    from: addDays(dateKey, -7),
    to: addDays(dateKey, 14),
  };
}

async function createAuthorizedApiContext() {
  return request.newContext({
    baseURL: apiBaseURL,
    extraHTTPHeaders: {
      Authorization: `Bearer ${authToken}`,
    },
  });
}

async function fetchScheduledWorkouts(apiContext: APIRequestContext, from: string, to: string) {
  const response = await apiContext.get(`/api/v1/scheduled-workouts?from=${from}&to=${to}`);
  expect(response.ok()).toBeTruthy();
  const payload = (await response.json()) as {
    data: Array<{
      id: string;
      date: string;
      templateId: string | null;
      templateName: string | null;
      sessionId: string | null;
    }>;
  };

  return payload.data;
}

async function fetchWorkoutSessions(apiContext: APIRequestContext, from: string, to: string) {
  const response = await apiContext.get(`/api/v1/workout-sessions?from=${from}&to=${to}`);
  expect(response.ok()).toBeTruthy();
  const payload = (await response.json()) as {
    data: Array<{
      id: string;
      templateId: string | null;
    }>;
  };

  return payload.data;
}

async function fetchScheduledWorkout(apiContext: APIRequestContext, id: string) {
  const response = await apiContext.get(`/api/v1/scheduled-workouts/${id}`);
  expect(response.ok()).toBeTruthy();
  const payload = (await response.json()) as {
    data: {
      id: string;
      sessionId: string | null;
    };
  };

  return payload.data;
}

async function fetchDashboardWorkout(apiContext: APIRequestContext, date: string) {
  const response = await apiContext.get(`/api/v1/dashboard/snapshot?date=${date}`);
  expect(response.ok()).toBeTruthy();
  const payload = (await response.json()) as {
    data: {
      workout: {
        scheduledWorkoutId: string | null;
        sessionId: string | null;
        status: 'completed' | 'in_progress' | 'scheduled';
      } | null;
    };
  };

  return payload.data.workout;
}

async function pickDayInDialog(page: Page, dateKey: string) {
  await page.locator(`[role="dialog"] [data-day="${dateKey}"]`).first().click();
}

async function openTemplatesAndSchedule(page: Page, dateKey?: string) {
  await page.getByRole('button', { exact: true, name: 'Templates' }).click();
  await page.getByRole('button', { name: `Template actions for ${seededTemplate.name}` }).click();
  await page.getByRole('menuitem', { name: 'Schedule workout' }).click();

  if (dateKey) {
    await pickDayInDialog(page, dateKey);
  }

  await page.getByRole('dialog').getByRole('button', { name: 'Schedule' }).click();
}

function getScheduledCard(page: Page) {
  return page.locator('[data-slot="card"]').filter({ hasText: seededTemplate.name }).first();
}

test.describe.serial('workout scheduling flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(new Date(serverNow));
  });

  test.beforeAll(async () => {
    const apiContext = await request.newContext({ baseURL: apiBaseURL });

    try {
      const registerResponse = await apiContext.post('/api/v1/auth/register', {
        data: testUser,
      });
      if (registerResponse.ok()) {
        const registerPayload = (await registerResponse.json()) as {
          data: {
            token: string;
          };
        };
        authToken = registerPayload.data.token;
      } else if (registerResponse.status() === 409) {
        const loginResponse = await apiContext.post('/api/v1/auth/login', {
          data: testUser,
        });
        expect(loginResponse.ok()).toBeTruthy();

        const loginPayload = (await loginResponse.json()) as {
          data: {
            token: string;
          };
        };
        authToken = loginPayload.data.token;
      } else {
        throw new Error(
          `Unable to create e2e auth token. register status=${registerResponse.status()}`,
        );
      }

      const authorizedContext = await createAuthorizedApiContext();
      try {
        const authorityResponse = await authorizedContext.get('/api/v1/adaptive-nutrition');
        expect(authorityResponse.ok(), await authorityResponse.text()).toBeTruthy();
        const authority = (await authorityResponse.json()) as {
          data: { localDate: string; timeZone: string; timeZoneSource: string };
        };
        expect(authority.data).toMatchObject({
          timeZone: 'America/Detroit',
          timeZoneSource: 'user_profile',
        });
        resolvedLocalDate = authority.data.localDate;
        expect(new Date(serverNow).toISOString().slice(0, 10)).toBe(
          expectUtcNextDay ? addDays(resolvedLocalDate, 1) : resolvedLocalDate,
        );

        const exerciseResponse = await authorizedContext.post('/api/v1/exercises', {
          data: {
            category: 'compound',
            equipment: 'barbell',
            muscleGroups: ['chest', 'triceps'],
            name: `E2E Scheduling Bench ${seedSuffix}`,
          },
        });
        expect(exerciseResponse.ok()).toBeTruthy();
        const exercisePayload = (await exerciseResponse.json()) as {
          data: { id: string };
        };

        const templateResponse = await authorizedContext.post('/api/v1/workout-templates', {
          data: {
            description: 'Playwright seeded template for workout scheduling lifecycle coverage.',
            name: seededTemplate.name,
            sections: [
              {
                type: 'main',
                exercises: [
                  {
                    exerciseId: exercisePayload.data.id,
                    sets: 3,
                    repsMin: 6,
                    repsMax: 10,
                    restSeconds: 120,
                    cues: [],
                  },
                ],
              },
            ],
            tags: ['e2e', 'workout-scheduling'],
          },
        });
        expect(templateResponse.ok()).toBeTruthy();

        const templatePayload = (await templateResponse.json()) as {
          data: {
            id: string;
          };
        };
        seededTemplateId = templatePayload.data.id;

        const agentTokenResponse = await authorizedContext.post('/api/v1/agent-tokens', {
          data: { name: `Workout scheduling ${seedSuffix}` },
        });
        expect(agentTokenResponse.status(), await agentTokenResponse.text()).toBe(201);
        const agentTokenPayload = (await agentTokenResponse.json()) as {
          data: { id: string; token: string };
        };
        agentToken = agentTokenPayload.data.token;
        agentTokenId = agentTokenPayload.data.id;
      } finally {
        await authorizedContext.dispose();
      }
    } finally {
      await apiContext.dispose();
    }
  });

  test.afterAll(async () => {
    if (!authToken || !agentTokenId) return;
    const authorizedContext = await createAuthorizedApiContext();
    try {
      const response = await authorizedContext.delete(`/api/v1/agent-tokens/${agentTokenId}`);
      expect(response.ok(), await response.text()).toBeTruthy();
    } finally {
      await authorizedContext.dispose();
    }
  });

  test('schedules a workout from template actions and renders in calendar/list', async ({
    page,
  }) => {
    test.setTimeout(90_000);

    await authenticatePage(page);
    await page.goto('/workouts');

    await openTemplatesAndSchedule(page);

    await page.getByRole('button', { exact: true, name: 'Calendar' }).click();
    await expect(page.getByText(seededTemplate.name).first()).toBeVisible();

    await page.getByRole('button', { exact: true, name: 'List' }).click();
    await expect(getScheduledCard(page)).toBeVisible();
  });

  test('reschedules a scheduled workout', async ({ page }) => {
    test.setTimeout(90_000);

    const secondDate = addDays(resolvedLocalDate, 4);
    const range = getDateRange();

    await authenticatePage(page);
    await page.goto('/workouts');
    await page.getByRole('button', { exact: true, name: 'List' }).click();

    const scheduledCard = getScheduledCard(page);
    await expect(scheduledCard).toBeVisible();
    await scheduledCard.getByRole('button', { name: 'Reschedule' }).click();
    await pickDayInDialog(page, secondDate);
    await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click();

    const apiContext = await createAuthorizedApiContext();
    try {
      await expect
        .poll(
          async () => {
            const scheduledRows = await fetchScheduledWorkouts(apiContext, range.from, range.to);
            return scheduledRows.some(
              (row) => row.templateId === seededTemplateId && row.date === secondDate,
            );
          },
          {
            timeout: 15_000,
          },
        )
        .toBeTruthy();
    } finally {
      await apiContext.dispose();
    }
  });

  test('removes a scheduled workout', async ({ page }) => {
    test.setTimeout(90_000);

    const range = getDateRange();

    await authenticatePage(page);
    await page.goto('/workouts');
    await page.getByRole('button', { exact: true, name: 'List' }).click();

    const scheduledCard = getScheduledCard(page);
    await expect(scheduledCard).toBeVisible();

    await scheduledCard.getByRole('button', { name: 'Reschedule' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Remove from schedule' }).click();
    await page.getByRole('button', { name: 'Remove', exact: true }).click();
    await expect(getScheduledCard(page)).toHaveCount(0);

    const apiContext = await createAuthorizedApiContext();
    try {
      await expect
        .poll(
          async () => {
            const scheduledRows = await fetchScheduledWorkouts(apiContext, range.from, range.to);
            return scheduledRows.some((row) => row.templateId === seededTemplateId);
          },
          { timeout: 15_000 },
        )
        .toBe(false);
    } finally {
      await apiContext.dispose();
    }
  });

  test("starts today's scheduled workout from the dashboard without creating a duplicate", async ({
    page,
  }) => {
    test.setTimeout(90_000);

    const today = resolvedLocalDate;
    const range = getDateRange();

    await authenticatePage(page);
    await page.goto('/workouts');

    await openTemplatesAndSchedule(page, today);

    const apiContext = await createAuthorizedApiContext();
    try {
      await expect
        .poll(
          async () => {
            const scheduledRows = await fetchScheduledWorkouts(apiContext, range.from, range.to);
            return scheduledRows.some(
              (row) => row.templateId === seededTemplateId && row.date === today,
            );
          },
          { timeout: 15_000 },
        )
        .toBeTruthy();

      const scheduledRows = await fetchScheduledWorkouts(apiContext, range.from, range.to);
      const scheduledWorkout = scheduledRows.find(
        (row) => row.templateId === seededTemplateId && row.date === today,
      );
      expect(scheduledWorkout).toBeDefined();
      if (!scheduledWorkout) {
        throw new Error('The scheduled workout was not returned after creation.');
      }
      const scheduledWorkoutId = scheduledWorkout.id;
      const sessionsBeforeStart = await fetchWorkoutSessions(apiContext, today, today);
      const sessionIdsBeforeStart = new Set(sessionsBeforeStart.map((session) => session.id));

      const dashboardWorkout = await fetchDashboardWorkout(apiContext, today);
      expect(dashboardWorkout).toEqual(
        expect.objectContaining({
          scheduledWorkoutId,
          sessionId: null,
          status: 'scheduled',
        }),
      );

      const contextResponse = await apiContext.get('/api/v1/context', {
        headers: { Authorization: `AgentToken ${agentToken}` },
      });
      expect(contextResponse.ok(), await contextResponse.text()).toBeTruthy();
      const context = (await contextResponse.json()) as {
        data: { scheduledWorkouts: Array<{ date: string; templateName: string }> };
      };
      expect(context.data.scheduledWorkouts).toContainEqual({
        date: today,
        templateName: seededTemplate.name,
      });

      await page.goto('/nutrition?view=log', { waitUntil: 'networkidle' });
      await expect(page.getByText(/Sunday, August 23/).first()).toBeVisible();

      await page.goto('/habits', { waitUntil: 'networkidle' });
      await expect(
        page.locator(`[data-slot="habit-calendar-day"][data-date="${today}"]`),
      ).toHaveAttribute('aria-pressed', 'true');

      await page.goto('/');
      const dashboardWorkoutLink = page.getByRole('link', {
        name: `Open today's scheduled workout: ${seededTemplate.name}`,
      });
      await expect(dashboardWorkoutLink).toHaveAttribute(
        'href',
        `/workouts/scheduled/${scheduledWorkoutId}`,
      );
      await dashboardWorkoutLink.click();
      await expect(page).toHaveURL(`/workouts/scheduled/${scheduledWorkoutId}`);
      await expect(page.getByRole('heading', { name: seededTemplate.name })).toBeVisible();
      await expect(page.getByText('This day already has a workout')).toHaveCount(0);
      await expect(page.getByText('Create another anyway')).toHaveCount(0);

      const startRequestBodies: unknown[] = [];
      page.on('request', (request) => {
        const requestUrl = new URL(request.url());
        if (request.method() === 'POST' && requestUrl.pathname === '/api/v1/workout-sessions') {
          startRequestBodies.push(request.postDataJSON());
        }
      });

      await page.getByRole('button', { name: 'Start workout' }).click();
      await expect(page).toHaveURL(/\/workouts\/active\?/);
      await expect(page.getByText('This day already has a workout')).toHaveCount(0);
      await expect(page.getByText('Create another anyway')).toHaveCount(0);

      const sessionId = new URL(page.url()).searchParams.get('sessionId');
      expect(sessionId).toBeTruthy();
      expect(startRequestBodies).toHaveLength(1);
      expect(startRequestBodies[0]).toEqual(
        expect.objectContaining({
          scheduledWorkoutId,
        }),
      );
      expect(startRequestBodies[0]).not.toEqual(
        expect.objectContaining({
          templateId: seededTemplateId,
        }),
      );

      const consumedSchedule = await fetchScheduledWorkout(apiContext, scheduledWorkoutId);
      expect(consumedSchedule.sessionId).toBe(sessionId);

      const sessionsAfterStart = await fetchWorkoutSessions(apiContext, today, today);
      const newSessions = sessionsAfterStart.filter(
        (session) => !sessionIdsBeforeStart.has(session.id),
      );
      expect(newSessions).toEqual([
        expect.objectContaining({
          id: sessionId,
          templateId: seededTemplateId,
        }),
      ]);

      const postStartRows = await fetchScheduledWorkouts(apiContext, range.from, range.to);
      const linkedRow = postStartRows.find(
        (row) => row.templateId === seededTemplateId && row.date === today,
      );
      expect(linkedRow).toBeUndefined();

      await page.goto('/');
      const inProgressLink = page.getByRole('link', {
        name: `Resume today's workout: ${seededTemplate.name}`,
      });
      await expect(inProgressLink).toHaveAttribute(
        'href',
        `/workouts/active?sessionId=${sessionId}`,
      );
    } finally {
      await apiContext.dispose();
    }
  });
});
