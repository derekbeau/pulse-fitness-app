import { expect, test, type Page } from '@playwright/test';
import type { Exercise, WorkoutSession } from '@pulse/shared';
import { setAuthenticatedSession } from './auth-session';
import {
  RELATED_HISTORY_API,
  RELATED_HISTORY_DATABASE,
  seedRelatedHistoryFixture,
} from './related-history-fixture';
import { apiBaseURL } from './test-env';

test.skip(
  apiBaseURL !== RELATED_HISTORY_API || process.env.E2E_DATABASE_URL !== RELATED_HISTORY_DATABASE,
  'Requires dedicated disposable issue-154 services',
);

async function panel(page: Page, exercise: Exercise) {
  const toggle = page
    .getByRole('button')
    .filter({
      has: page.getByRole('heading', { level: 3, name: exercise.name, exact: true }),
    })
    .first();
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
  return page.locator(`[id="${await toggle.getAttribute('aria-controls')}"]`);
}

for (const width of [375, 1280]) {
  test.describe(`${width}px related history`, () => {
    test.use({ viewport: { width, height: 900 } });
    test('omits empty rows, preserves previews and navigation, and never mutates history', async ({
      page,
    }, testInfo) => {
      const fixture = await seedRelatedHistoryFixture(apiBaseURL);
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text());
      });
      page.on('requestfailed', (request) =>
        errors.push(request.failure()?.errorText ?? 'Request failed'),
      );
      page.on('response', (response) => {
        if (response.url().includes('/api/') && response.status() >= 400)
          errors.push(`${response.status()} ${response.url()}`);
      });
      await setAuthenticatedSession(page, fixture.token);
      await page.goto(`/workouts/active?sessionId=${fixture.active.id}`);
      for (const exercise of [fixture.emptyPrimary, fixture.noRelated]) {
        const response = page.waitForResponse((r) =>
          r.url().includes(`/exercises/${exercise.id}/last-performance?`),
        );
        const emptyPanel = await panel(page, exercise);
        await response;
        await expect(emptyPanel.getByText('History', { exact: true })).toBeVisible();
        await expect(emptyPanel.getByText('Related history', { exact: true })).toHaveCount(0);
        await expect(emptyPanel.getByText('Related', { exact: true })).toHaveCount(0);
        await expect(emptyPanel.getByText('No completed sets yet.', { exact: true })).toHaveCount(
          0,
        );
        await expect(emptyPanel.getByRole('button', { name: 'View all', exact: true })).toHaveCount(
          1,
        );
        // Session notes is the only remaining details element: no empty related box/gap.
        await expect(emptyPanel.locator('details')).toHaveCount(1);
        await emptyPanel.screenshot({ path: testInfo.outputPath(`empty-${exercise.id}.png`) });
      }
      const mixedPanel = await panel(page, fixture.mixed);
      const disclosure = mixedPanel
        .locator('details')
        .filter({ has: page.getByText('Related history', { exact: true }) });
      const summary = disclosure.locator('summary');
      await expect(summary).toBeVisible();
      await expect(disclosure).not.toHaveAttribute('open');
      // Reach the summary through real keyboard navigation from the preceding direct-history control.
      await mixedPanel.getByRole('button', { name: 'View all', exact: true }).focus();
      for (
        let i = 0;
        i < 40 && !(await summary.evaluate((el) => el === document.activeElement));
        i++
      )
        await page.keyboard.press('Tab');
      await expect(summary).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(disclosure).toHaveAttribute('open');
      await page.keyboard.press('Space');
      await expect(disclosure).not.toHaveAttribute('open');
      await page.keyboard.press('Enter');
      for (const name of ['Unused Variation', 'Unstarted Variation', 'Skipped Variation'])
        await expect(disclosure.getByText(name, { exact: true })).toHaveCount(0);
      for (const exercise of fixture.related)
        await expect(disclosure.getByText(exercise.name, { exact: true })).toBeVisible();
      await expect(disclosure.getByText('Sep 1 · 0x8 (0 RIR)', { exact: true })).toBeVisible();
      await expect(disclosure.getByText('Sep 1 · 8 (0 RIR)', { exact: true })).toBeVisible();
      await expect(disclosure.getByText('Sep 1 · 0s', { exact: true })).toBeVisible();
      await expect(disclosure.getByText('Sep 1 · 0mi', { exact: true })).toBeVisible();
      await disclosure.getByRole('button', { name: 'View notes', exact: true }).first().click();
      await expect(page.getByText('Preserved historical note.', { exact: true })).toBeVisible();
      await page.keyboard.press('Escape');
      await disclosure
        .getByRole('button', { name: 'Effort details: History, 2026-09-01', exact: true })
        .first()
        .click();
      await expect(page.getByRole('dialog', { name: 'Effort details', exact: true })).toContainText(
        'Stored RIR: 0',
      );
      await page.keyboard.press('Escape');
      await mixedPanel.screenshot({ path: testInfo.outputPath('mixed-related.png') });
      await disclosure.getByRole('button', { name: 'View all', exact: true }).first().click();
      await expect(page.getByRole('dialog')).toContainText(fixture.related[0].name);
      await expect(
        page.getByRole('dialog').getByText('Session history', { exact: true }),
      ).toBeVisible();
      await page.keyboard.press('Escape');
      await summary.click();
      await mixedPanel.getByRole('button', { name: 'View all', exact: true }).click();
      await expect(page.getByRole('dialog')).toContainText(fixture.mixed.name);
      await expect(
        page.getByRole('dialog').getByText('Session history', { exact: true }),
      ).toBeVisible();
      await page.keyboard.press('Escape');
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
        ),
      ).toBe(true);
      for (const session of [fixture.older, fixture.newer, fixture.active])
        expect(await fixture.api<WorkoutSession>(`/workout-sessions/${session.id}`)).toEqual(
          session,
        );
      expect(errors).toEqual([]);
    });
  });
}

test('keeps loading and retryable errors separate from an empty related result', async ({
  page,
}) => {
  const fixture = await seedRelatedHistoryFixture(apiBaseURL);
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  let requests = 0;
  await page.route(`**/exercises/${fixture.mixed.id}/last-performance?**`, async (route) => {
    requests++;
    if (requests === 1) {
      await pending;
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({
          error: { code: 'UNAVAILABLE', message: 'Synthetic retryable failure' },
        }),
      });
    } else await route.continue();
  });
  await setAuthenticatedSession(page, fixture.token);
  await page.goto(`/workouts/active?sessionId=${fixture.active.id}`);
  const mixedPanel = await panel(page, fixture.mixed);
  await expect.poll(() => requests).toBe(1);
  await expect(mixedPanel.getByText('Related history', { exact: true })).toHaveCount(0);
  await expect(mixedPanel.getByText('No completed sets yet.', { exact: true })).toHaveCount(0);
  await expect(mixedPanel.getByText('History', { exact: true })).toBeVisible();
  release();
  await expect(mixedPanel.getByText('Related history', { exact: true })).toBeVisible();
  expect(requests).toBe(2);
});
