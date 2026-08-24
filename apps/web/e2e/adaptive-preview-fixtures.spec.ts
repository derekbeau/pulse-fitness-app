import { expect, request, test, type APIRequestContext, type Page } from '@playwright/test';

import { apiBaseURL } from './test-env';

const authTokenStorageKey = 'pulse-auth-token';
const fixturePassword = 'adaptive-preview-only';
const fixtureNames = [
  'setup',
  'baseline',
  'learning',
  'updating',
  'holding',
  'pending',
  'goal-reached',
  'goal-loss',
  'goal-maintenance',
  'goal-edited',
  'goal-history',
  'goal-change-pending',
  'completion-required',
] as const;
type FixtureName = (typeof fixtureNames)[number];

let apiContext: APIRequestContext;
const tokens = new Map<FixtureName, string>();

async function authenticateFixture(page: Page, fixture: FixtureName) {
  const token = tokens.get(fixture);
  if (!token) throw new Error(`Missing authentication token for ${fixture}`);
  await page.addInitScript(
    ([storageKey, value]) => window.localStorage.setItem(storageKey, value),
    [authTokenStorageKey, token] as const,
  );
}

function fixtureUsername(fixture: FixtureName) {
  if (fixture === 'goal-maintenance') return 'adaptive-preview-maintain';
  if (fixture === 'goal-change-pending') return 'adaptive-preview-goal-pending';
  if (fixture === 'completion-required') return 'adaptive-preview-completion';
  return `adaptive-preview-${fixture}`;
}

function monitorPage(page: Page, allowedResponseStatuses: number[] = []) {
  const consoleFailures: string[] = [];
  const networkFailures: string[] = [];
  const pageFailures: string[] = [];
  const responseFailures: string[] = [];
  page.on('console', (message) => {
    const isExpectedHttpFailure = allowedResponseStatuses.some((status) =>
      message.text().includes(`status of ${status}`),
    );
    if ((message.type() === 'error' || message.type() === 'warning') && !isExpectedHttpFailure) {
      consoleFailures.push(
        `${message.type()}: ${message.text()} (${message.location().url || 'unknown source'})`,
      );
    }
  });
  page.on('pageerror', (error) => pageFailures.push(error.message));
  page.on('requestfailed', (requestFailure) => {
    networkFailures.push(
      `${requestFailure.method()} ${requestFailure.url()}: ${requestFailure.failure()?.errorText}`,
    );
  });
  page.on('response', (response) => {
    if (response.status() >= 400 && !allowedResponseStatuses.includes(response.status())) {
      responseFailures.push(
        `${response.status()} ${response.request().method()} ${response.url()}`,
      );
    }
  });
  return () => {
    expect(consoleFailures, 'browser console warnings/errors').toEqual([]);
    expect(pageFailures, 'uncaught browser errors').toEqual([]);
    expect(networkFailures, 'failed browser network requests').toEqual([]);
    expect(responseFailures, 'HTTP responses with failure status').toEqual([]);
  };
}

async function openCoach(page: Page, fixture: FixtureName) {
  await authenticateFixture(page, fixture);
  await page.goto('/nutrition?view=coach');
  await expect(page.getByRole('heading', { level: 1, name: 'Nutrition' })).toBeVisible();
  await page.waitForLoadState('networkidle');
}

async function acceptWithSameDateConfirmation(page: Page) {
  await page.getByRole('button', { name: 'Use these targets' }).click();
  const replacementDialog = page.getByRole('alertdialog');
  if (await replacementDialog.isVisible()) {
    await replacementDialog.getByRole('button', { name: 'Replace target' }).click();
  }
}

async function fillManualSetup(page: Page, tdee: number, weightLbs: number) {
  await page.getByLabel('Starting equation').selectOption('manual_tdee');
  await page.getByLabel('Starting TDEE (kcal/day)').fill(String(tdee));
  await page.getByLabel('Current weight (lbs)').fill(String(weightLbs));
}

async function selectSetupChoice(page: Page, groupName: string, choiceName: RegExp) {
  await page
    .getByRole('radiogroup', { name: groupName })
    .getByRole('radio', { name: choiceName })
    .check();
}

test.describe.serial('Adaptive TDEE deterministic preview fixtures', () => {
  test.beforeAll(async () => {
    apiContext = await request.newContext({ baseURL: apiBaseURL });
    for (const fixture of fixtureNames) {
      const response = await apiContext.post('/api/v1/auth/login', {
        data: {
          password: fixturePassword,
          username: fixtureUsername(fixture),
        },
      });
      expect(response.ok(), `${fixture} fixture login`).toBeTruthy();
      const payload = (await response.json()) as { data: { token: string } };
      tokens.set(fixture, payload.data.token);
    }
  });

  test.afterAll(async () => {
    await apiContext.dispose();
  });

  test('renders setup, baseline, learning, eligible, and held states', async ({ page }) => {
    const assertDiagnostics = monitorPage(page);

    await openCoach(page, 'setup');
    await expect(
      page.getByRole('heading', { level: 2, name: 'Set up Adaptive TDEE' }),
    ).toBeVisible();

    await openCoach(page, 'baseline');
    await expect(
      page.getByRole('heading', { level: 2, name: 'Your baseline is active' }),
    ).toBeVisible();

    await openCoach(page, 'learning');
    await expect(
      page.getByRole('heading', { level: 2, name: 'A stronger estimate is taking shape' }),
    ).toBeVisible();
    const learningReadiness = page.getByRole('region', { name: 'Data readiness' });
    const learningToken = tokens.get('learning');
    if (!learningToken) throw new Error('Missing learning fixture token');
    const learningStateResponse = await apiContext.get('/api/v1/adaptive-nutrition', {
      headers: { authorization: `Bearer ${learningToken}` },
    });
    expect(learningStateResponse.ok()).toBeTruthy();
    const learningEligibility = (
      (await learningStateResponse.json()) as {
        data: {
          eligibility: {
            completeNutritionDaysLogged: number;
            completeNutritionDaysUsable: number;
            completeNutritionDaysBeforeWeightTrend: number;
            completeNutritionDaysPendingCutoff: number;
            weighInsLogged: number;
            weighInsUsable: number;
            weighInsPendingCutoff: number;
          };
        };
      }
    ).data.eligibility;
    await expect(
      learningReadiness.getByText(`${learningEligibility.completeNutritionDaysLogged} logged`),
    ).toBeVisible();
    await expect(
      learningReadiness.getByText(`${learningEligibility.weighInsLogged} logged`),
    ).toBeVisible();
    const learningNutritionProgress = learningReadiness.getByRole('progressbar', {
      name: 'Complete nutrition: Usable with weight trend',
    });
    await expect(learningNutritionProgress).toContainText(
      `${learningEligibility.completeNutritionDaysUsable} / 12`,
    );
    await expect(learningNutritionProgress).toHaveAttribute(
      'aria-valuenow',
      String(learningEligibility.completeNutritionDaysUsable),
    );
    await expect(learningNutritionProgress).toHaveAttribute(
      'aria-valuetext',
      `${learningEligibility.completeNutritionDaysUsable} usable nutrition ${learningEligibility.completeNutritionDaysUsable === 1 ? 'day' : 'days'}; 12 required`,
    );
    const learningWeightProgress = learningReadiness.getByRole('progressbar', {
      name: 'Scale weigh-ins: Usable after daily cutoff',
    });
    await expect(learningWeightProgress).toContainText(`${learningEligibility.weighInsUsable} / 3`);
    await expect(learningWeightProgress).toHaveAttribute(
      'aria-valuenow',
      String(learningEligibility.weighInsUsable),
    );
    if (learningEligibility.completeNutritionDaysPendingCutoff > 0) {
      await expect(
        learningReadiness.getByText(
          /complete nutrition day is saved for .+ It will enter coaching analysis after that local day ends in America\/Detroit\./,
        ),
      ).toBeVisible();
    }
    if (learningEligibility.weighInsPendingCutoff > 0) {
      await expect(
        learningReadiness.getByText(
          /weigh-in is saved for .+ It will enter coaching analysis after that local day ends in America\/Detroit\./,
        ),
      ).toBeVisible();
    }
    await expect(
      learningReadiness.getByText(
        `${learningEligibility.completeNutritionDaysBeforeWeightTrend} complete nutrition days were logged before your weight trend began. They stay in your history but do not count toward this coaching window.`,
      ),
    ).toBeVisible();

    await openCoach(page, 'updating');
    await expect(
      page.getByRole('heading', { level: 2, name: 'Your Adaptive TDEE is active' }),
    ).toBeVisible();
    const updatingNutritionProgress = page.getByRole('progressbar', {
      name: 'Complete nutrition: Usable with weight trend',
    });
    const updatingToken = tokens.get('updating');
    if (!updatingToken) throw new Error('Missing updating fixture token');
    const updatingStateResponse = await apiContext.get('/api/v1/adaptive-nutrition', {
      headers: { authorization: `Bearer ${updatingToken}` },
    });
    expect(updatingStateResponse.ok()).toBeTruthy();
    const updatingUsableDays = (
      (await updatingStateResponse.json()) as {
        data: { eligibility: { completeNutritionDaysUsable: number } };
      }
    ).data.eligibility.completeNutritionDaysUsable;
    await expect(updatingNutritionProgress).toContainText(`${updatingUsableDays} / 12`);
    await expect(updatingNutritionProgress).toHaveAttribute('aria-valuenow', '12');
    await expect(updatingNutritionProgress).toHaveAttribute(
      'aria-valuetext',
      `${updatingUsableDays} usable nutrition days; 12 required`,
    );

    await openCoach(page, 'holding');
    await expect(
      page.getByRole('heading', {
        level: 2,
        name: 'Pulse needs better data before changing targets',
      }),
    ).toBeVisible();
    await expect(page.getByText('Why Pulse is holding')).toBeVisible();

    assertDiagnostics();
  });

  test('coaches recommended and outside-band gain rates without writing during edits', async ({
    page,
  }) => {
    const assertDiagnostics = monitorPage(page);
    const writeRequests: string[] = [];
    page.on('request', (request) => {
      if (request.method() !== 'GET') writeRequests.push(`${request.method()} ${request.url()}`);
    });
    await openCoach(page, 'setup');
    await fillManualSetup(page, 2450, 177.2);
    await selectSetupChoice(page, 'Goal direction', /Gain weight/);
    await page.getByLabel('Target weight (lbs)').fill('185');
    await selectSetupChoice(page, 'Weekly goal rate', /Faster/);

    const projection = page.getByTestId('setup-projection');
    await expect(projection).toContainText('About 13 weeks');
    await expect(projection).toContainText('0.62 lb/wk');
    await expect(projection).toContainText('0.65 lb/wk');
    await expect(projection).toContainText('Faster · Recommended');
    expect(writeRequests, 'writes while editing recommended setup').toEqual([]);

    await selectSetupChoice(page, 'Weekly goal rate', /Custom/);
    await page.getByLabel('Custom rate (% body weight/week)').fill('0.45');
    await expect(projection).toContainText(/outside Pulse’s recommended gain range/i);
    await expect(page.getByRole('img', { name: /Recommended 0.10 to 0.35 percent/ })).toBeVisible();
    expect(writeRequests, 'writes while editing outside-band setup').toEqual([]);

    assertDiagnostics();
  });

  test('explains loss guardrails, maintenance, and live macro preferences', async ({ page }) => {
    const assertDiagnostics = monitorPage(page);
    await openCoach(page, 'setup');
    await fillManualSetup(page, 2000, 220.46);
    await page.getByLabel('Target weight (lbs)').fill('176.37');
    await selectSetupChoice(page, 'Weekly goal rate', /Custom/);
    await page.getByLabel('Custom rate (% body weight/week)').fill('1');
    await page.getByText('Advanced calorie floor').click();
    await page.getByLabel('Optional calorie floor (kcal/day)').fill('1200');

    const projection = page.getByTestId('setup-projection');
    await expect(projection).toContainText(/calorie floor limits this starting target/i);
    await expect(projection).toContainText(/maximum-deficit guardrail/i);
    await expect(projection).toContainText('1,500');

    await selectSetupChoice(page, 'Goal direction', /Maintain/);
    await expect(projection).toContainText(/Maintain around 220.5 lbs/);
    await expect(projection).toContainText(/no artificial finish date/i);
    await expect(projection).not.toContainText(/About \d+ weeks/);

    await selectSetupChoice(page, 'Goal direction', /Gain weight/);
    await page.getByLabel('Target weight (lbs)').fill('230');
    await selectSetupChoice(page, 'Protein target', /High/);
    await selectSetupChoice(page, 'Fat and carbohydrate preference', /Higher fat/);
    await expect(projection).toContainText(/Protein220 g · 2\.20 g\/kg · 1\.00 g\/lb/);
    await expect(projection).toContainText(/Fat\d+ g/);
    await expect(projection).toContainText(/Carbohydrate\d+ g/);

    assertDiagnostics();
  });

  test('keeps the coached setup readable and operable at every required issue width', async ({
    page,
  }) => {
    const assertDiagnostics = monitorPage(page);
    await authenticateFixture(page, 'setup');

    for (const width of [320, 390, 430, 1280]) {
      await page.setViewportSize({ width, height: width < 768 ? 812 : 900 });
      await page.goto('/nutrition?view=coach');
      await fillManualSetup(page, 2450, 177.2);
      await selectSetupChoice(page, 'Goal direction', /Gain weight/);
      await page.getByLabel('Target weight (lbs)').fill('185');
      await selectSetupChoice(page, 'Weekly goal rate', /Faster/);
      await expect(page.getByTestId('setup-projection')).toContainText('About 13 weeks');
      await page.evaluate(() => document.fonts.ready);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
        `coached setup horizontal overflow at ${width}px`,
      ).toBe(true);
      const preview = page.getByRole('button', { name: 'Preview starting targets' });
      expect(
        (await preview.boundingBox())?.height ?? 0,
        `preview height at ${width}px`,
      ).toBeGreaterThanOrEqual(44);
    }

    assertDiagnostics();
  });

  test('declines, audits history, creates a replacement preview, and accepts it', async ({
    page,
  }) => {
    const assertDiagnostics = monitorPage(page);
    await openCoach(page, 'pending');
    await expect(
      page.getByRole('heading', { level: 2, name: 'A recommendation is ready' }),
    ).toBeVisible();

    await page.getByRole('button', { name: 'Keep current' }).click();
    await expect(page.getByText('Current targets kept.')).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'Check-in history' })).toBeVisible();
    await expect(page.getByText('Kept current', { exact: true }).first()).toBeVisible();
    await page.getByRole('button', { name: 'View calculation' }).first().click();
    await expect(page.getByRole('dialog')).toContainText('Kept current');
    await page.keyboard.press('Escape');

    await page.getByRole('button', { name: 'Check in now' }).click();
    await expect(page.getByText('Recommendation ready for review.')).toBeVisible();
    await acceptWithSameDateConfirmation(page);
    await expect(page.getByText(/Targets accepted and applied from today/)).toBeVisible();
    await expect(page.getByText('Accepted', { exact: true }).first()).toBeVisible();

    assertDiagnostics();
  });

  test('accepts a reached target while keeping the goal transition explicit', async ({ page }) => {
    const assertDiagnostics = monitorPage(page);
    await openCoach(page, 'goal-reached');
    await expect(page.getByText('Goal reached', { exact: true })).toBeVisible();

    await acceptWithSameDateConfirmation(page);
    await expect(
      page.getByText(/review goal completion before moving to maintenance/i),
    ).toBeVisible();
    await expect(page.getByText(/review the completion step/i)).toBeVisible();

    assertDiagnostics();
  });

  test('shows persistent loss and maintenance goal cards with honest semantics', async ({
    page,
  }) => {
    const assertDiagnostics = monitorPage(page);

    await openCoach(page, 'goal-loss');
    await expect(page.getByRole('heading', { level: 2, name: /Lose to/ })).toBeVisible();
    await expect(page.getByText('Current trend')).toBeVisible();
    await expect(page.getByText('Latest scale')).toBeVisible();
    await expect(
      page.getByRole('progressbar', { name: /percent of goal distance completed/ }),
    ).toBeVisible();

    await openCoach(page, 'goal-maintenance');
    await expect(page.getByRole('heading', { level: 2, name: /Maintain around/ })).toBeVisible();
    await expect(page.getByText('Days in range')).toBeVisible();
    await expect(page.getByRole('img', { name: /Maintenance range/ })).toBeVisible();
    await expect(page.getByText(/% complete/)).toHaveCount(0);

    assertDiagnostics();
  });

  test('edits a goal and reveals the explicit goal-change recommendation', async ({ page }) => {
    const assertDiagnostics = monitorPage(page);
    await openCoach(page, 'goal-loss');
    await page.getByRole('button', { name: 'Edit goal' }).click();
    const target = page.getByLabel('Target weight (lbs)');
    await expect(target).toBeVisible();
    await target.fill('164');
    await page.getByRole('button', { name: 'Review change' }).click();
    await expect(page.getByText('Confirm your updated goal')).toBeVisible();
    await page.getByRole('button', { name: 'Update goal' }).click();
    await expect(
      page.getByText(/Goal updated\. Your current nutrition targets stay in place/),
    ).toBeVisible();
    await expect(page.getByText('Goal update', { exact: true })).toBeVisible();
    await expect(
      page.getByText(/Your goal changed\. Your current nutrition targets stay in place/),
    ).toBeVisible();

    assertDiagnostics();
  });

  test('requires explicit replacement when editing with a pending recommendation', async ({
    page,
  }) => {
    const assertDiagnostics = monitorPage(page);
    await openCoach(page, 'goal-change-pending');
    await page.getByRole('button', { name: 'Edit goal' }).click();
    await page.getByLabel('Target weight (lbs)').fill('166');
    await page.getByRole('button', { name: 'Review change' }).click();
    const update = page.getByRole('button', { name: 'Update goal' });
    await expect(update).toBeDisabled();
    await page.getByRole('checkbox').check();
    await expect(update).toBeEnabled();
    await update.click();
    await expect(
      page.getByText(/Goal updated\. Your current nutrition targets stay in place/),
    ).toBeVisible();

    assertDiagnostics();
  });

  test('starts a new direction only after the reviewed confirmation', async ({ page }) => {
    const assertDiagnostics = monitorPage(page);
    await openCoach(page, 'goal-edited');
    await page.getByRole('button', { name: 'Start a new goal' }).click();
    await page.getByRole('button', { name: 'Gain weight' }).click();
    await page.getByLabel('Target weight (lbs)').fill('190');
    await page.getByRole('button', { name: 'Review change' }).click();
    await expect(page.getByText('Confirm your new goal')).toBeVisible();
    await expect(
      page.getByText(/Historical goals and learned expenditure remain intact/),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Start new goal' }).click();
    await expect(
      page.getByText(/New goal started\. Your history and Adaptive TDEE were preserved/),
    ).toBeVisible();
    await expect(page.getByText('Goal update', { exact: true })).toBeVisible();

    assertDiagnostics();
  });

  test('audits weekly trend text equivalents, revisions, prior goals, and linked check-ins', async ({
    page,
  }) => {
    const assertDiagnostics = monitorPage(page);
    await openCoach(page, 'goal-history');
    await expect(page.getByText('Prior goals')).toBeVisible();
    await expect(page.getByText('Replaced').first()).toBeVisible();
    const detailButtons = page.getByRole('button', { name: 'View goal details' });
    await expect(detailButtons).toHaveCount(20);
    await page.getByRole('button', { name: 'Load more goals (20 of 21)' }).click();
    await expect(detailButtons).toHaveCount(21);
    await expect(page.getByText('All 21 goals loaded.')).toBeVisible();
    await detailButtons.nth(20).click();
    const priorDialog = page.getByRole('dialog');
    await expect(priorDialog.getByRole('heading', { name: 'Weekly goal progress' })).toBeVisible();
    await expect(
      priorDialog.getByRole('img', { name: /weekly trend-weight chart with [3-9]/i }),
    ).toBeVisible();
    await expect(
      priorDialog.getByRole('table', {
        name: 'Text equivalent of weekly goal trend and progress chart',
      }),
    ).toBeVisible();
    await expect(
      priorDialog.getByRole('heading', { name: 'Linked accepted check-ins' }),
    ).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(detailButtons.nth(20)).toBeFocused();

    await openCoach(page, 'goal-edited');
    await page.getByRole('button', { name: 'View goal details' }).nth(1).click();
    const editedDialog = page.getByRole('dialog');
    await expect(editedDialog.getByText('Revision 2').first()).toBeVisible();
    await expect(editedDialog.getByText('User edit')).toBeVisible();

    assertDiagnostics();
  });

  test('fails stale completion closed, then survives a lost response with an idempotent retry', async ({
    page,
  }) => {
    const assertDiagnostics = monitorPage(page, [409, 503]);
    let completionAttempts = 0;
    await page.route('**/api/v1/adaptive-nutrition/goals/*/complete', async (route) => {
      completionAttempts += 1;
      if (completionAttempts === 1) {
        await route.fulfill({
          body: JSON.stringify({
            error: { code: 'CHECKIN_STALE', message: 'Simulated stale completion' },
          }),
          contentType: 'application/json',
          status: 409,
        });
        return;
      }
      if (completionAttempts === 2) {
        const response = await route.fetch();
        expect(response.ok(), 'server completed before the simulated lost response').toBeTruthy();
        await route.fulfill({
          body: JSON.stringify({
            error: { code: 'SIMULATED_LOST_RESPONSE', message: 'Simulated lost response' },
          }),
          contentType: 'application/json',
          status: 503,
        });
        return;
      }
      await route.continue();
    });

    await openCoach(page, 'completion-required');
    await page.getByRole('button', { name: 'Review completion' }).click();
    await expect(page.getByRole('heading', { name: 'Review goal completion' })).toBeVisible();
    await page.getByText('Review completion evidence').click();
    await expect(
      page.getByText(/rechecks the trend tolerance and source fingerprint/i),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Move to maintenance' }).click();
    await expect(page.getByRole('alert')).toContainText('out of date');
    await expect(page.getByRole('button', { name: 'Move to maintenance' })).toBeDisabled();
    await page.getByRole('button', { name: 'Refresh Coach state' }).click();
    await expect(page.getByRole('button', { name: 'Review completion' })).toBeFocused();

    await page.getByRole('button', { name: 'Review completion' }).click();
    await page.getByRole('button', { name: 'Move to maintenance' }).click();
    await expect(page.getByRole('alert')).toContainText('Simulated lost response');
    await page.getByRole('button', { name: 'Retry completion' }).click();
    await expect(page.getByRole('heading', { level: 2, name: /Maintain around/ })).toBeVisible();
    await expect(page.getByText(/Goal completed\. Maintenance is now centered/)).toBeVisible();
    expect(completionAttempts).toBe(3);

    await page.getByRole('button', { name: 'View goal details' }).first().click();
    const completionDetail = page.getByRole('dialog');
    await expect(
      completionDetail.getByRole('heading', { name: 'Completion transition' }),
    ).toBeVisible();
    await expect(completionDetail).toContainText('immutably links completed goal');

    assertDiagnostics();
  });

  test('supports keyboard-only editing and restores focus when dismissed', async ({ page }) => {
    const assertDiagnostics = monitorPage(page);
    await openCoach(page, 'goal-history');
    const edit = page.getByRole('button', { name: 'Edit goal' });
    await edit.focus();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    const target = page.getByLabel('Target weight (lbs)');
    await target.focus();
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.type('160');
    const review = page.getByRole('button', { name: 'Review change' });
    await review.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByText('Confirm your updated goal')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(edit).toBeFocused();

    assertDiagnostics();
  });

  test('has no horizontal overflow at every required acceptance width', async ({ page }) => {
    const assertDiagnostics = monitorPage(page);
    await authenticateFixture(page, 'goal-maintenance');

    for (const width of [320, 375, 390, 430, 768, 1280]) {
      await page.setViewportSize({ width, height: width < 768 ? 812 : 900 });
      await page.goto('/nutrition?view=coach');
      await expect(page.getByRole('heading', { level: 2, name: /Maintain around/ })).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      const detailAction = page.getByRole('button', { name: 'View goal details' });
      expect(
        (await detailAction.boundingBox())?.height ?? 0,
        `detail action height at ${width}px`,
      ).toBeGreaterThanOrEqual(44);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
        `horizontal overflow at ${width}px`,
      ).toBe(true);
      await detailAction.click();
      await expect(page.getByRole('heading', { name: 'Weekly goal progress' })).toBeVisible();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
        `goal detail horizontal overflow at ${width}px`,
      ).toBe(true);
      await page.keyboard.press('Escape');
    }

    assertDiagnostics();
  });
});
