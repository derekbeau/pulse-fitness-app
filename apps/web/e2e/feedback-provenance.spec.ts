import { expect, test } from '@playwright/test';

for (const width of [375, 1280]) {
  test(`native feedback survives failure and reload at ${width}px`, async ({
    page,
    request,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    const pageErrors: string[] = [];
    const consoleMessages: string[] = [];
    const network: { method: string; url: string; status: number }[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    page.on('console', (message) => {
      if (['error', 'warning'].includes(message.type())) consoleMessages.push(message.text());
    });
    page.on('response', (response) =>
      network.push({
        method: response.request().method(),
        url: response.url(),
        status: response.status(),
      }),
    );

    const login = await request.post('http://127.0.0.1:3119/api/v1/auth/login', {
      data: { username: 'synthetic149', password: 'Synthetic149-only!' },
    });
    expect(login.ok()).toBeTruthy();
    const auth = (await login.json()).data;
    const headers = { authorization: `Bearer ${auth.token}` };
    const created = await request.post('http://127.0.0.1:3119/api/v1/workout-sessions', {
      headers,
      data: {
        name: `Synthetic browser ${width}`,
        date: '2026-09-08',
        startedAt: Date.now() - 60_000,
        sets: [
          {
            exerciseId: 'synthetic-row',
            setNumber: 1,
            weight: 20,
            reps: 8,
            rir: 0,
            completed: true,
            section: 'main',
            notes: 'Exact native set.',
          },
        ],
      },
    });
    expect(created.ok()).toBeTruthy();
    const session = (await created.json()).data;
    await page.goto('/login');
    await page.getByRole('textbox', { name: 'Username', exact: true }).fill('synthetic149');
    await page.getByLabel('Password', { exact: true }).fill('Synthetic149-only!');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible();
    await page.goto(`/workouts/active?sessionId=${session.id}`);
    const open = async () => {
      await page.getByRole('button', { name: 'Complete Workout', exact: true }).click();
      await page.getByRole('button', { name: 'Complete', exact: true }).click();
    };
    await open();
    await expect(page.getByRole('button', { name: 'Finalize session' })).toBeDisabled();
    await page
      .getByRole('group', { name: 'Session RPE rating', exact: true })
      .getByRole('button', { name: '8', exact: true })
      .click();
    await page
      .getByRole('group', { name: 'Energy post workout options', exact: true })
      .getByRole('button', { name: '🙂', exact: true })
      .click();
    await page
      .getByRole('group', { name: 'Any pain or discomfort? response', exact: true })
      .getByRole('button', { name: 'No', exact: true })
      .click();
    await page.getByRole('button', { name: 'Skip Shoulder feel', exact: true }).click();
    const exactNote = '  Synthetic exact whitespace  ';
    await page.getByRole('textbox', { name: 'Coach note', exact: true }).fill(exactNote);
    const route = `**/api/v1/workout-sessions/${session.id}`;
    await page.route(route, async (route) => {
      if (['PATCH', 'PUT'].includes(route.request().method()))
        await route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({
            error: { code: 'SYNTHETIC_FAILURE', message: 'Synthetic save failure' },
          }),
        });
      else await route.continue();
    });
    await page.getByRole('button', { name: 'Finalize session' }).click();
    await expect(
      page.getByText('Unable to complete this workout. Try again.', { exact: true }),
    ).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('failed-save.png') });
    await page.unroute(route);
    await page.reload();
    await open();
    await expect(page.getByRole('textbox', { name: 'Coach note', exact: true })).toHaveValue(
      exactNote,
    );
    await expect(
      page
        .getByRole('group', { name: 'Any pain or discomfort? response', exact: true })
        .getByRole('button', { name: 'No', exact: true }),
    ).toHaveAttribute('aria-pressed', 'true');
    const finalize = page.getByRole('button', { name: 'Finalize session' });
    for (
      let count = 0;
      count < 150 && !(await finalize.evaluate((element) => element === document.activeElement));
      count++
    )
      await page.keyboard.press('Tab');
    await expect(finalize).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { name: 'Workout summary' })).toBeVisible();
    const readback = await request.get(
      `http://127.0.0.1:3119/api/v1/workout-sessions/${session.id}`,
      { headers },
    );
    const saved = (await readback.json()).data;
    expect(saved.sets).toEqual(session.sets);
    expect(saved.notes).toBe(session.notes);
    expect(saved.startedAt).toBe(session.startedAt);
    expect(saved.feedback).toMatchObject({
      energy: 4,
      recovery: null,
      technique: null,
      notes: exactNote,
    });
    expect(saved.feedback.provenance.energy.mappingVersion).toBe('pulse-energy-emoji-v1');
    expect(
      saved.feedback.responses.find((response: { id: string }) => response.id === 'pain-discomfort')
        .value,
    ).toBe(false);
    expect(
      saved.sets.map(({ weight, reps, rir }: { weight: number; reps: number; rir: number }) => ({
        weight,
        reps,
        rir,
      })),
    ).toEqual([{ weight: 20, reps: 8, rir: 0 }]);
    await testInfo.attach('persisted-feedback', {
      body: JSON.stringify(saved.feedback, null, 2),
      contentType: 'application/json',
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    ).toBe(true);
    await page.screenshot({ path: testInfo.outputPath('completed.png') });
    await testInfo.attach('accessibility-readback', {
      body: await page.getByRole('main').ariaSnapshot(),
      contentType: 'text/plain',
    });
    await testInfo.attach('console-network', {
      body: JSON.stringify({ pageErrors, consoleMessages, network }, null, 2),
      contentType: 'application/json',
    });
    expect(pageErrors).toEqual([]);
    expect(network.some((response) => response.status === 503)).toBe(true);
  });
}
