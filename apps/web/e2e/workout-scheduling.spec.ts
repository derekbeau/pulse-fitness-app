import { expect, request, test, type APIRequestContext, type Page } from '@playwright/test';
import { apiBaseURL } from './test-env';

const authTokenStorageKey = 'pulse-auth-token';
const seedSuffix = Date.now();

const testUser = {
  username: `wsched-e2e-${seedSuffix}`,
  password: 'super-secret-password',
};

const seededTemplate = {
  name: `E2E Workout Scheduling ${seedSuffix}`,
};

let authToken = '';
let seededTemplateId = '';

async function authenticatePage(page: Page) {
  await page.addInitScript(
    ([storageKey, token]) => {
      window.localStorage.setItem(storageKey, token);
    },
    [authTokenStorageKey, authToken] as const,
  );
}

function toDateKey(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function getDateRange() {
  const today = new Date();
  return {
    from: toDateKey(addDays(today, -7)),
    to: toDateKey(addDays(today, 14)),
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
      } finally {
        await authorizedContext.dispose();
      }
    } finally {
      await apiContext.dispose();
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

    const secondDate = toDateKey(addDays(new Date(), 4));
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
      const scheduledRows = await fetchScheduledWorkouts(apiContext, range.from, range.to);
      const targetSchedule = scheduledRows.find((row) => row.templateId === seededTemplateId);
      expect(targetSchedule).toBeUndefined();
    } finally {
      await apiContext.dispose();
    }
  });

  test('starts a scheduled workout and removes it from the schedule list', async ({ page }) => {
    test.setTimeout(90_000);

    const today = toDateKey(new Date());
    const range = getDateRange();

    await authenticatePage(page);
    await page.goto('/workouts');

    await openTemplatesAndSchedule(page, today);

    await page.getByRole('button', { exact: true, name: 'List' }).click();
    const startCard = getScheduledCard(page);
    await expect(startCard).toBeVisible();
    await startCard.getByRole('button', { name: 'Start' }).click();
    await expect(page).toHaveURL(/\/workouts\/active\?/);

    const sessionId = new URL(page.url()).searchParams.get('sessionId');
    expect(sessionId).toBeTruthy();

    const apiContext = await createAuthorizedApiContext();
    try {
      const postStartRows = await fetchScheduledWorkouts(apiContext, range.from, range.to);
      const linkedRow = postStartRows.find(
        (row) => row.templateId === seededTemplateId && row.date === today,
      );
      expect(linkedRow).toBeUndefined();
    } finally {
      await apiContext.dispose();
    }
  });
});
