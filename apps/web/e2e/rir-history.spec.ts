import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test, type Page, type Locator } from '@playwright/test';

import { setAuthenticatedSession } from './auth-session';
import { seedRirHistoryFixture } from './rir-history-fixture';
import { apiBaseURL } from './test-env';

test.setTimeout(120_000);
// This populated fixture is opt-in to the dedicated disposable lane, never a reused dev API.
test.skip(
  apiBaseURL !== 'http://127.0.0.1:3139',
  'Requires the isolated issue-139 API on port 3139',
);

let fixture: Awaited<ReturnType<typeof seedRirHistoryFixture>>;
const artifacts = resolve(process.cwd(), '../../logs/issue-139/chrome');
test.beforeAll(async () => {
  fixture = await seedRirHistoryFixture(apiBaseURL);
  mkdirSync(artifacts, { recursive: true });
});

async function readRaw(path: string, data?: unknown) {
  const response = await fetch(`${apiBaseURL}/api/v1${path}`, {
    method: data ? 'POST' : 'GET',
    headers: { authorization: `Bearer ${fixture.token}`, 'content-type': 'application/json' },
    ...(data ? { body: JSON.stringify(data) } : {}),
  });
  expect(response.ok).toBeTruthy();
  return (await response.json()).data;
}

async function capture(page: Page, name: string, width: number) {
  await page.screenshot({
    path: resolve(artifacts, `${width}-${name}.png`),
    animations: 'disabled',
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
    'no page overflow',
  ).toBe(true);
}

async function disclose(
  page: Page,
  trigger: Locator,
  width: number,
  expected: string,
  screenshot: string,
) {
  if (width === 375) await trigger.tap();
  else {
    // Traverse the real tab order to discover the control; no programmatic focus shortcut.
    for (
      let count = 0;
      count < 100 && !(await trigger.evaluate((element) => element === document.activeElement));
      count++
    )
      await page.keyboard.press('Tab');
    await expect(trigger).toBeFocused();
    await page.keyboard.press('Enter');
  }
  const dialog = page.getByRole('dialog', { name: 'Effort details', exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(expected);
  const box = await dialog.boundingBox();
  expect(box?.x).toBeGreaterThanOrEqual(0);
  expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(width);
  const target = await trigger.boundingBox();
  expect(target?.height).toBeGreaterThanOrEqual(44);
  expect(target?.width).toBeGreaterThanOrEqual(44);
  await capture(page, screenshot, width);
  if (screenshot === 'exercise-history') {
    const missingEffort = dialog.getByText('Effort not logged. No estimate.', { exact: true });
    await missingEffort.scrollIntoViewIfNeeded();
    await expect(missingEffort).toBeInViewport();
    await capture(page, `${screenshot}-scrolled`, width);
  }
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
}

for (const width of [375, 1280]) {
  test.describe(`${width}px RIR history`, () => {
    test.use({
      viewport: { width, height: 900 },
      hasTouch: width === 375,
      isMobile: width === 375,
      timezoneId: 'America/Detroit',
      colorScheme: width === 375 ? 'dark' : 'light',
    });
    test('keeps provenance discoverable across populated history and evidence', async ({
      page,
    }) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('console', (message) => {
        if (['warning', 'error'].includes(message.type())) errors.push(message.text());
      });
      const before = await readRaw(`/workout-sessions/${fixture.completedSessionId}`);
      await setAuthenticatedSession(page, fixture.token);
      await page.goto(`/workouts/sessions/${fixture.completedSessionId}`);
      const bench = page.getByTestId(`workout-exercise-card-${fixture.exercises[0].id}`);
      await expect(bench).toBeVisible();
      await bench.getByText('Show full set detail', { exact: true }).click();
      await expect(bench.getByText('0 RIR', { exact: true })).toBeVisible();
      await expect(bench.getByText('≈ 2 RIR', { exact: true })).toBeVisible();
      await expect(
        bench.getByRole('button', { name: 'Effort details: Set 4', exact: true }),
      ).toHaveCount(0);
      await disclose(
        page,
        bench.getByRole('button', { name: 'Effort details: Set 1', exact: true }),
        width,
        'Stored RIR: 0',
        'completed-native-zero',
      );
      await disclose(
        page,
        bench.getByRole('button', { name: 'Effort details: Set 2', exact: true }),
        width,
        'Derived approximately from stored RPE 8',
        'completed-legacy',
      );
      await disclose(
        page,
        bench.getByRole('button', { name: 'Effort details: Set 3', exact: true }),
        width,
        'five-or-more bucket, not an exact estimate',
        'completed-legacy-bound',
      );
      for (const [index, value] of [
        [1, '4 RIR'],
        [2, '5+ RIR'],
      ] as const) {
        const card = page.getByTestId(`workout-exercise-card-${fixture.exercises[index].id}`);
        await card.getByText('Show full set detail', { exact: true }).click();
        await expect(card.getByText(value, { exact: true })).toBeVisible();
        await disclose(
          page,
          card.getByRole('button', { name: 'Effort details: Set 1', exact: true }),
          width,
          index === 1 ? 'Stored RIR: 4' : 'not exactly five',
          `completed-native-${index === 1 ? 'four' : 'bound'}`,
        );
      }
      await expect(page.getByText(/1,800 sec \(RPE 3 \/ Zone 2\)/)).toBeVisible();
      await disclose(
        page,
        bench.getByRole('button', {
          name: 'Effort details: Last performance, 2026-09-04',
          exact: true,
        }),
        width,
        'Derived approximately from stored RPE 8',
        'last-performance',
      );
      await expect(page.getByText('Session RPE', { exact: true }).locator('..')).toContainText('7');
      await page.getByRole('checkbox', { name: 'Show comparison' }).check();
      await disclose(
        page,
        bench.getByRole('button', { name: 'Effort details: Previous set 1', exact: true }),
        width,
        'Derived approximately from stored RPE 8',
        'comparison',
      );
      await page
        .getByRole('button', { name: 'Open History Bench Press history', exact: true })
        .click();
      await page.getByRole('tab', { name: 'History', exact: true }).click();
      const history = page.getByRole('tabpanel', { name: 'History', exact: true });
      await expect(
        history.getByText(/135x10 \(0 RIR\), 135x10 \(≈ 2 RIR\), 135x10 \(≈ 5\+ RIR\), 135x10/),
      ).toBeVisible();
      await disclose(
        page,
        history.getByRole('button', {
          name: 'Effort details: Session history, 2026-09-04',
          exact: true,
        }),
        width,
        'Effort not logged. No estimate.',
        'exercise-history',
      );
      await page.keyboard.press('Escape');
      await page.goto(`/workouts/scheduled/${fixture.scheduledWorkoutId}`);
      await expect(
        page.getByRole('heading', { name: 'Progression review', exact: true }),
      ).toBeVisible();
      const comparison = page.getByRole('table', {
        name: 'History Bench Press exact progression comparison',
        exact: true,
      });
      await disclose(
        page,
        comparison.getByRole('button', { name: 'Effort details: Completed set 2', exact: true }),
        width,
        'Stored RIR: not logged; stored RPE: 8',
        'progression',
      );
      const after = await readRaw(`/workout-sessions/${fixture.completedSessionId}`);
      const afterPreview = await readRaw('/workout-progression/preview', {
        scheduledWorkoutId: fixture.scheduledWorkoutId,
      });
      expect(after).toEqual(before);
      expect(afterPreview.recommendations).toEqual(fixture.preview.recommendations);
      expect(errors).toEqual([]);
      writeFileSync(
        resolve(artifacts, `${width}-readback.json`),
        JSON.stringify(
          {
            width,
            browserVersion: page.context().browser()?.version(),
            rawSessionUnchanged: true,
            progressionUnchanged: true,
            before,
            after,
            beforePreview: fixture.preview,
            afterPreview,
            errors,
          },
          null,
          2,
        ),
      );
    });
  });
}
