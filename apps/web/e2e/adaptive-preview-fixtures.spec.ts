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

function monitorPage(page: Page) {
  const consoleFailures: string[] = [];
  const networkFailures: string[] = [];
  const pageFailures: string[] = [];
  const responseFailures: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') {
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
    if (response.status() >= 400) {
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
}

async function acceptWithSameDateConfirmation(page: Page) {
  await page.getByRole('button', { name: 'Use these targets' }).click();
  const replacementDialog = page.getByRole('alertdialog');
  if (await replacementDialog.isVisible()) {
    await replacementDialog.getByRole('button', { name: 'Replace target' }).click();
  }
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

    await openCoach(page, 'updating');
    await expect(
      page.getByRole('heading', { level: 2, name: 'Your Adaptive TDEE is active' }),
    ).toBeVisible();
    await expect(page.getByText('12 / 12')).toBeVisible();

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
    await page.keyboard.type('192');
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
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
        `horizontal overflow at ${width}px`,
      ).toBe(true);
    }

    assertDiagnostics();
  });
});
