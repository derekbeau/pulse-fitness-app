import { expect, request, test, type Page } from '@playwright/test';
import { apiBaseURL } from './test-env';

const authTokenStorageKey = 'pulse-auth-token';
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

function toRestTimerSeconds(timerText: string) {
  const minuteSecondMatch = timerText.match(/(\d+):(\d{2})/);
  if (minuteSecondMatch) {
    const [, minutes, seconds] = minuteSecondMatch;
    return Number(minutes) * 60 + Number(seconds);
  }

  const secondsMatch = timerText.match(/(\d+)s/);
  if (secondsMatch) {
    return Number(secondsMatch[1]);
  }

  throw new Error(`Unable to parse rest timer text: ${timerText}`);
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
  const exerciseButtons = page.locator('button[aria-controls^="exercise-panel-"]:visible');
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

    await page.getByRole('button', { exact: true, name: 'Templates' }).click();
    await page.getByRole('link', { name: seededTemplate.name }).click();

    await expect(page.getByRole('heading', { level: 1, name: seededTemplate.name })).toBeVisible();

    await page.getByRole('button', { name: 'Start Workout' }).click();
    await expect(page).toHaveURL(/\/workouts\/active\?/);

    await ensureSectionIsExpanded(page, 'Warmup');
    await ensureSectionIsExpanded(page, 'Main');
    await ensureSectionIsExpanded(page, 'Cooldown');
    await ensureAllExercisePanelsExpanded(page);

    await expect(page.getByRole('heading', { level: 3 }).first()).toBeVisible();

    const elapsedTimeText = page.getByText(/^\d{2}:\d{2}$/).first();
    const elapsedStart = await elapsedTimeText.innerText();
    await page.waitForTimeout(1200);
    const elapsedNext = await elapsedTimeText.innerText();
    expect(toElapsedSeconds(elapsedNext)).toBeGreaterThan(toElapsedSeconds(elapsedStart));

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

    await page.getByRole('button', { name: 'Complete Workout' }).click();
    await page.getByRole('button', { name: 'Complete', exact: true }).click();
    await expect(feedbackHeading).toBeVisible({ timeout: 15_000 });

    await page
      .getByRole('group', { name: 'Session RPE rating' })
      .getByRole('button', { name: '8', exact: true })
      .click();
    await page
      .getByRole('group', { name: 'Shoulder feel rating' })
      .getByRole('button', { name: '4', exact: true })
      .click();
    await page
      .getByRole('group', { name: 'Energy post workout options' })
      .getByRole('button')
      .nth(3)
      .click();
    await page
      .getByRole('group', { name: 'Any pain or discomfort? response' })
      .getByRole('button')
      .nth(1)
      .click();

    const finalizeButton = page.getByRole('button', { name: 'Finalize session' });
    await expect(finalizeButton).toBeEnabled({ timeout: 15_000 });
    await finalizeButton.click();
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

  test('keeps sticky rest timer running while entering data in another set', async ({ page }) => {
    test.setTimeout(60_000);

    await authenticatePage(page);
    await page.goto(`/workouts/active?template=${seededTemplateId}`);
    await expect(page).toHaveURL(/\/workouts\/active\?/);

    await ensureSectionIsExpanded(page, 'Warmup');
    await ensureSectionIsExpanded(page, 'Main');
    await ensureAllExercisePanelsExpanded(page);

    const benchHeading = page.getByRole('heading', {
      level: 3,
      name: seededExercises[1].name,
    });
    await expect(benchHeading).toBeVisible();
    const benchCard = benchHeading.locator('xpath=ancestor::*[@data-slot="card"][1]');

    await benchCard.locator('input[aria-label="Reps for set 1"]:visible').first().fill('8');
    await benchCard.getByLabel('Complete set 1').check();

    const restTimer = page.getByRole('timer', { name: 'Rest timer' });
    await expect(restTimer).toBeVisible({ timeout: 5_000 });

    const countdownBeforeInput = toRestTimerSeconds(await restTimer.innerText());
    await page.waitForTimeout(1_200);

    await benchCard.locator('input[aria-label="Reps for set 2"]:visible').first().fill('6');
    await page.waitForTimeout(400);

    await expect(restTimer).toBeVisible();
    const countdownAfterInput = toRestTimerSeconds(await restTimer.innerText());
    expect(countdownAfterInput).toBeLessThanOrEqual(countdownBeforeInput);

    await page.waitForTimeout(1_200);
    const countdownAfterTick = toRestTimerSeconds(await restTimer.innerText());
    expect(countdownAfterTick).toBeLessThan(countdownAfterInput);
  });
});
