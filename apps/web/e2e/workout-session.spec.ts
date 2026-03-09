import { expect, request, test, type Page } from '@playwright/test';

const authTokenStorageKey = 'pulse-auth-token';
const apiBaseURL = process.env.API_BASE_URL ?? 'http://127.0.0.1:3001';
const seedSuffix = Date.now();

const testUser = {
  username: `ws-e2e-${seedSuffix}`,
  password: 'super-secret-password',
};

const seededTemplate = {
  name: `E2E Workout Session ${seedSuffix}`,
};

const seededExercises = [
  {
    category: 'cardio',
    equipment: 'rower',
    muscleGroups: ['conditioning'],
    name: `E2E Row Erg ${seedSuffix}`,
  },
  {
    category: 'compound',
    equipment: 'barbell',
    muscleGroups: ['chest', 'triceps'],
    name: `E2E Bench Press ${seedSuffix}`,
  },
  {
    category: 'isolation',
    equipment: 'cable',
    muscleGroups: ['lats'],
    name: `E2E Lat Pulldown ${seedSuffix}`,
  },
] as const;

let authToken = '';
let seededTemplateId = '';
let seededExerciseIds: string[] = [];

async function authenticatePage(page: Page) {
  await page.addInitScript(
    ([storageKey, token]) => {
      window.localStorage.setItem(storageKey, token);
    },
    [authTokenStorageKey, authToken] as const,
  );
}

function toElapsedSeconds(value: string) {
  const [minutes, seconds] = value.split(':').map((part) => Number(part));
  return minutes * 60 + seconds;
}

async function ensureSectionIsExpanded(page: Page, sectionName: 'Warmup' | 'Main' | 'Cooldown') {
  const sectionButton = page.getByRole('button', { name: new RegExp(sectionName, 'i') }).first();
  const sectionButtonCount = await sectionButton.count();

  if (sectionButtonCount === 0) {
    return;
  }

  const isExpanded = (await sectionButton.getAttribute('aria-expanded')) === 'true';

  if (!isExpanded) {
    await sectionButton.click();
  }
}

async function ensureAllExercisePanelsExpanded(page: Page) {
  const exerciseButtons = page.locator('button[aria-controls^="exercise-panel-"]');
  const exerciseButtonCount = await exerciseButtons.count();

  for (let index = 0; index < exerciseButtonCount; index += 1) {
    const exerciseButton = exerciseButtons.nth(index);
    const isExpanded = (await exerciseButton.getAttribute('aria-expanded')) === 'true';

    if (!isExpanded) {
      await exerciseButton.click();
    }
  }
}

test.describe.serial('workout session flow', () => {
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

      const authorizedContext = await request.newContext({
        baseURL: apiBaseURL,
        extraHTTPHeaders: {
          Authorization: `Bearer ${authToken}`,
        },
      });

      try {
        seededExerciseIds = [];

        for (const exercise of seededExercises) {
          const exerciseResponse = await authorizedContext.post('/api/v1/exercises', {
            data: exercise,
          });
          expect(exerciseResponse.ok()).toBeTruthy();

          const exercisePayload = (await exerciseResponse.json()) as {
            data: {
              id: string;
            };
          };
          seededExerciseIds.push(exercisePayload.data.id);
        }

        const templateResponse = await authorizedContext.post('/api/v1/workout-templates', {
          data: {
            description: 'Playwright seeded template for workout-session lifecycle coverage.',
            name: seededTemplate.name,
            sections: [
              {
                type: 'warmup',
                exercises: [
                  {
                    exerciseId: seededExerciseIds[0],
                    sets: 3,
                    repsMin: 8,
                    repsMax: 10,
                    restSeconds: 60,
                    cues: [],
                  },
                ],
              },
              {
                type: 'main',
                exercises: [
                  {
                    exerciseId: seededExerciseIds[1],
                    sets: 3,
                    repsMin: 6,
                    repsMax: 10,
                    restSeconds: 120,
                    cues: [],
                  },
                  {
                    exerciseId: seededExerciseIds[2],
                    sets: 3,
                    repsMin: 10,
                    repsMax: 12,
                    restSeconds: 90,
                    cues: [],
                  },
                ],
              },
            ],
            tags: ['e2e', 'workout-session'],
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

  test('starts from template, logs sets, completes, and persists history/detail data', async ({
    page,
  }) => {
    test.setTimeout(90_000);

    await authenticatePage(page);
    await page.goto('/workouts');

    await page.getByRole('button', { name: 'Templates' }).click();
    await page.getByRole('link', { name: seededTemplate.name }).click();

    await expect(page.getByRole('heading', { level: 1, name: seededTemplate.name })).toBeVisible();

    await page.getByRole('button', { name: 'Start Workout' }).click();
    await expect(page).toHaveURL(/\/workouts\/active\?/);

    await ensureSectionIsExpanded(page, 'Warmup');
    await ensureSectionIsExpanded(page, 'Main');
    await ensureSectionIsExpanded(page, 'Cooldown');

    await expect(page.getByRole('heading', { level: 3 }).first()).toBeVisible();

    const elapsedTimeText = page.getByText(/^\d{2}:\d{2}$/).first();
    const elapsedStart = await elapsedTimeText.innerText();
    await page.waitForTimeout(1200);
    const elapsedNext = await elapsedTimeText.innerText();
    expect(toElapsedSeconds(elapsedNext)).toBeGreaterThan(toElapsedSeconds(elapsedStart));

    const firstSetWeight = page.getByLabel('Weight for set 1').first();
    const firstSetReps = page.getByLabel('Reps for set 1').first();
    const firstSetComplete = page.getByLabel('Complete set 1').first();

    await firstSetWeight.fill('135');
    await firstSetReps.fill('10');
    await firstSetComplete.check();
    await expect(firstSetComplete).toBeChecked();

    const secondSetWeight = page.getByLabel('Weight for set 2').first();
    const secondSetReps = page.getByLabel('Reps for set 2').first();
    const secondSetComplete = page.getByLabel('Complete set 2').first();

    await secondSetWeight.fill('140');
    await secondSetReps.fill('8');
    await secondSetComplete.check();
    await expect(secondSetComplete).toBeChecked();

    await ensureAllExercisePanelsExpanded(page);
    const feedbackHeading = page.getByRole('heading', { name: 'How did this session feel?' });

    for (let attempt = 0; attempt < 60; attempt += 1) {
      if (await feedbackHeading.isVisible()) {
        break;
      }

      const setCompletionCheckboxes = page.getByRole('checkbox', {
        name: /^Complete set \d+$/,
      });
      const totalSetCount = await setCompletionCheckboxes.count();
      let checkedAnySet = false;

      for (let index = 0; index < totalSetCount; index += 1) {
        const setCheckbox = setCompletionCheckboxes.nth(index);
        if (await setCheckbox.isChecked()) {
          continue;
        }

        await setCheckbox.click();
        checkedAnySet = true;
        break;
      }

      if (!checkedAnySet) {
        break;
      }
    }

    await expect(feedbackHeading).toBeVisible({ timeout: 15_000 });

    await page.getByRole('button', { name: 'Finalize session' }).click();
    await expect(page.getByRole('heading', { name: 'Workout summary' })).toBeVisible();
    await expect(page.getByText('Duration')).toBeVisible();

    const sessionId = new URL(page.url()).searchParams.get('sessionId');
    expect(sessionId).toBeTruthy();

    await page.getByRole('button', { name: 'Done' }).click();
    await expect(page).toHaveURL('/workouts');

    const apiContext = await request.newContext({
      baseURL: apiBaseURL,
      extraHTTPHeaders: {
        Authorization: `Bearer ${authToken}`,
      },
    });

    try {
      const detailResponse = await apiContext.get(`/api/v1/workout-sessions/${sessionId}`);
      expect(detailResponse.ok()).toBeTruthy();

      const detailPayload = (await detailResponse.json()) as {
        data: {
          date: string;
          id: string;
          name: string;
          sets: Array<{
            completed: boolean;
            exerciseId: string;
            reps: number | null;
            setNumber: number;
            weight: number | null;
          }>;
          status: string;
          templateId: string | null;
        };
      };

      expect(detailPayload.data.id).toBe(sessionId);
      expect(detailPayload.data.name).toBe(seededTemplate.name);
      expect(detailPayload.data.status).toBe('completed');
      expect(detailPayload.data.templateId).toBe(seededTemplateId);
      expect(detailPayload.data.sets).toHaveLength(9);
      expect(
        detailPayload.data.sets.some((set) => seededExerciseIds.includes(set.exerciseId)),
      ).toBeTruthy();

      const listResponse = await apiContext.get(
        `/api/v1/workout-sessions?from=${detailPayload.data.date}&to=${detailPayload.data.date}`,
      );
      expect(listResponse.ok()).toBeTruthy();

      const listPayload = (await listResponse.json()) as {
        data: Array<{
          id: string;
          name: string;
        }>;
      };

      expect(listPayload.data).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: sessionId,
            name: seededTemplate.name,
          }),
        ]),
      );
    } finally {
      await apiContext.dispose();
    }
  });
});
