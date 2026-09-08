# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: feedback-provenance.spec.ts >> native feedback survives failure and reload at 1280px
- Location: e2e/feedback-provenance.spec.ts:4:7

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: locator.click: Test timeout of 30000ms exceeded.
Call log:
  - waiting for getByRole('button', { name: 'Complete', exact: true })
    - locator resolved to <button type="button" data-size="default" data-variant="default" data-slot="alert-dialog-action" class="inline-flex min-h-[44px] min-w-[44px] shrink-0 cursor-pointer items-center justify-center gap-2 rounded-md text-sm font-medium whitespace-nowrap transition-all outline-none focus-visible:border-ring focus-visible:ring-[3px] disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/4…>Complete</button>
  - attempting click action
    2 × waiting for element to be visible, enabled and stable
      - element is not stable
    - retrying click action
    - waiting 20ms
    - waiting for element to be visible, enabled and stable
    - element is not stable
  - retrying click action
    - waiting 100ms
  - element was detached from the DOM, retrying

```

# Page snapshot

```yaml
- generic [ref=f4e2]:
  - generic [ref=f4e5]:
    - complementary [ref=f4e6]:
      - generic [ref=f4e7]:
        - generic [ref=f4e8]:
          - paragraph [ref=f4e9]: Pulse
          - button "Collapse sidebar" [ref=f4e10] [cursor=pointer]
        - navigation "Desktop navigation" [ref=f4e13]:
          - link "Dashboard" [ref=f4e14] [cursor=pointer]:
            - /url: /
          - link "Workouts" [ref=f4e21] [cursor=pointer]:
            - /url: /workouts
          - link "Nutrition" [ref=f4e29] [cursor=pointer]:
            - /url: /nutrition
          - link "Habits" [ref=f4e36] [cursor=pointer]:
            - /url: /habits
          - link "Data Quality" [ref=f4e41] [cursor=pointer]:
            - /url: /data-quality
          - link "Activity" [ref=f4e46] [cursor=pointer]:
            - /url: /activity
          - link "Journal" [ref=f4e50] [cursor=pointer]:
            - /url: /journal
          - link "Profile" [ref=f4e55] [cursor=pointer]:
            - /url: /profile
        - generic [ref=f4e60]:
          - link "S Synthetic Athlete @synthetic149" [ref=f4e61] [cursor=pointer]:
            - /url: /profile
            - generic [ref=f4e62]: S
            - generic [ref=f4e63]:
              - paragraph [ref=f4e64]: Synthetic Athlete
              - paragraph [ref=f4e65]: "@synthetic149"
          - button "Log out" [ref=f4e66] [cursor=pointer]
    - main [ref=f4e71]:
      - generic [ref=f4e72]:
        - link "Back to session list" [ref=f4e73] [cursor=pointer]:
          - /url: /workouts/active
        - generic [ref=f4e74]:
          - generic [ref=f4e75]:
            - generic [ref=f4e76]: Set progress
            - generic [ref=f4e77]: 1 / 1
          - progressbar "Workout progress" [ref=f4e78]
        - generic [ref=f4e82]:
          - generic [ref=f4e83]:
            - generic [ref=f4e84]:
              - paragraph [ref=f4e85]: Active session
              - generic [ref=f4e86]:
                - heading "Synthetic browser 1280" [level=1] [ref=f4e87]
                - paragraph [ref=f4e88]: Exercise 1 of 1
                - paragraph [ref=f4e89]: ~1 min total estimate
            - generic [ref=f4e90]:
              - generic [ref=f4e91]:
                - generic [ref=f4e92]: Total time
                - paragraph [ref=f4e97]: 00:00
              - generic [ref=f4e98]:
                - generic [ref=f4e99]: Exercises
                - paragraph [ref=f4e107]: 1/1
              - generic [ref=f4e108]:
                - generic [ref=f4e109]: Sets done
                - paragraph [ref=f4e114]: 1/1
              - generic [ref=f4e115]:
                - paragraph [ref=f4e116]: Estimated
                - paragraph [ref=f4e117]: ~0 min
          - generic [ref=f4e118]:
            - generic [ref=f4e119]: Start time
            - button "12:02 AM" [ref=f4e120] [cursor=pointer]
        - button "Workout session options" [ref=f4e122] [cursor=pointer]
        - region "Session context" [ref=f4e123]:
          - button [expanded] [ref=f4e124] [cursor=pointer]:
            - generic [ref=f4e125]:
              - heading "Session Context" [level=2] [ref=f4e126]
              - paragraph [ref=f4e127]: Training context and readiness notes
          - generic [ref=f4e130]:
            - note [ref=f4e131]:
              - generic [ref=f4e132]:
                - paragraph [ref=f4e135]: Some cards are in preview — sample data is shown and won't be saved.
                - button "Dismiss preview banner" [ref=f4e136] [cursor=pointer]: Dismiss
            - generic [ref=f4e137]:
              - generic [ref=f4e138]:
                - generic [ref=f4e140]:
                  - paragraph [ref=f4e142]: Recent Training
                  - paragraph [ref=f4e143]: Last 3 sessions
                - list [ref=f4e150]:
                  - listitem [ref=f4e151]:
                    - generic [ref=f4e152]:
                      - paragraph [ref=f4e153]: Synthetic browser 375
                      - paragraph [ref=f4e154]: Sep 8
                    - paragraph [ref=f4e155]: Today
                  - listitem [ref=f4e156]:
                    - generic [ref=f4e157]:
                      - paragraph [ref=f4e158]: Synthetic browser 1280
                      - paragraph [ref=f4e159]: Sep 8
                    - paragraph [ref=f4e160]: Today
                  - listitem [ref=f4e161]:
                    - generic [ref=f4e162]:
                      - paragraph [ref=f4e163]: Synthetic browser 375
                      - paragraph [ref=f4e164]: Sep 8
                    - paragraph [ref=f4e165]: Today
              - generic [ref=f4e166]:
                - generic [ref=f4e168]:
                  - generic [ref=f4e169]:
                    - paragraph [ref=f4e170]: Recovery Status
                    - generic [ref=f4e171]: Preview
                  - paragraph [ref=f4e172]: Sleep and readiness
                - generic [ref=f4e181]:
                  - paragraph [ref=f4e182]: Good sleep
                  - paragraph [ref=f4e183]: Recovery looks stable for today's training.
              - generic [ref=f4e184]:
                - generic [ref=f4e186]:
                  - generic [ref=f4e187]:
                    - paragraph [ref=f4e188]: Active Injuries
                    - generic [ref=f4e189]: Preview
                  - paragraph [ref=f4e190]: Conditions to respect today
                - generic [ref=f4e195]:
                  - generic [ref=f4e196]: 2 active
                  - list [ref=f4e197]:
                    - listitem [ref=f4e198]:
                      - generic [ref=f4e201]: Left shoulder SLAP tear
                    - listitem [ref=f4e202]:
                      - generic [ref=f4e205]: Right patellar tendon irritation
              - generic [ref=f4e206]:
                - generic [ref=f4e208]:
                  - generic [ref=f4e209]:
                    - paragraph [ref=f4e210]: Training Phase
                    - generic [ref=f4e211]: Preview
                  - paragraph [ref=f4e212]: Current program block
                - generic [ref=f4e219]:
                  - generic [ref=f4e220]: Rebuild Phase
                  - paragraph [ref=f4e221]: Accumulation Block 2 - Rebuild
        - generic [ref=f4e223]:
          - generic [ref=f4e224]:
            - button "Main 1-3 min Main elapsed time Section complete 1/1" [expanded] [ref=f4e225] [cursor=pointer]:
              - generic [ref=f4e226]:
                - heading "Main 1-3 min" [level=2] [ref=f4e227]:
                  - text: Main
                  - generic [ref=f4e228]: 1-3 min
                - paragraph [ref=f4e229]: 00:00
              - generic [ref=f4e231]:
                - generic [ref=f4e232]: Section complete
                - text: 1/1
            - button "Start" [ref=f4e235] [cursor=pointer]
          - generic [ref=f4e236]:
            - 'button "Completed exercise Synthetic Dumbbell Row 1/1 sets· 1-3 min #1 Exercise actions for Synthetic Dumbbell Row" [ref=f4e239] [cursor=pointer]':
              - generic [ref=f4e240]:
                - generic [ref=f4e241]:
                  - generic "Completed exercise" [ref=f4e242]
                  - generic [ref=f4e245]:
                    - heading "Synthetic Dumbbell Row" [level=3] [ref=f4e246]
                    - paragraph [ref=f4e247]: 1/1 sets· 1-3 min
                - generic [ref=f4e248]: "#1"
              - button "Exercise actions for Synthetic Dumbbell Row" [ref=f4e252]
            - status [ref=f4e253]
        - generic [ref=f4e254]:
          - button "Complete Workout" [ref=f4e255] [cursor=pointer]
          - paragraph [ref=f4e256]: 1/1 sets completed
  - region "Notifications alt+T"
```

# Test source

```ts
  1   | import { expect, test } from '@playwright/test';
  2   | 
  3   | for (const width of [375, 1280]) {
  4   |   test(`native feedback survives failure and reload at ${width}px`, async ({
  5   |     page,
  6   |     request,
  7   |   }, testInfo) => {
  8   |     await page.setViewportSize({ width, height: 900 });
  9   |     const login = await request.post('http://127.0.0.1:3119/api/v1/auth/login', {
  10  |       data: { username: 'synthetic149', password: 'Synthetic149-only!' },
  11  |     });
  12  |     expect(login.ok()).toBeTruthy();
  13  |     const auth = (await login.json()).data;
  14  |     const headers = { authorization: `Bearer ${auth.token}` };
  15  |     const created = await request.post('http://127.0.0.1:3119/api/v1/workout-sessions', {
  16  |       headers,
  17  |       data: {
  18  |         name: `Synthetic browser ${width}`,
  19  |         date: '2026-09-08',
  20  |         startedAt: Date.now() - 60_000,
  21  |         sets: [
  22  |           {
  23  |             exerciseId: 'synthetic-row',
  24  |             setNumber: 1,
  25  |             weight: 20,
> 26  |             reps: 8,
      |                                                                         ^ Error: locator.click: Test timeout of 30000ms exceeded.
  27  |             rir: 0,
  28  |             completed: true,
  29  |             section: 'main',
  30  |             notes: 'Exact native set.',
  31  |           },
  32  |         ],
  33  |       },
  34  |     });
  35  |     expect(created.ok()).toBeTruthy();
  36  |     const session = (await created.json()).data;
  37  |     await page.goto('/login');
  38  |     await page.getByRole('textbox', { name: 'Username', exact: true }).fill('synthetic149');
  39  |     await page.getByLabel('Password', { exact: true }).fill('Synthetic149-only!');
  40  |     await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  41  |     await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible();
  42  |     await page.goto(`/workouts/active?sessionId=${session.id}`);
  43  |     const open = async () => {
  44  |       await page.getByRole('button', { name: 'Complete Workout', exact: true }).click();
  45  |       await page.getByRole('button', { name: 'Complete', exact: true }).click();
  46  |     };
  47  |     await open();
  48  |     await expect(page.getByRole('button', { name: 'Finalize session' })).toBeDisabled();
  49  |     await page
  50  |       .getByRole('group', { name: 'Session RPE rating', exact: true })
  51  |       .getByRole('button', { name: '8', exact: true })
  52  |       .click();
  53  |     await page
  54  |       .getByRole('group', { name: 'Energy post workout options', exact: true })
  55  |       .getByRole('button', { name: '🙂', exact: true })
  56  |       .click();
  57  |     await page
  58  |       .getByRole('group', { name: 'Any pain or discomfort? response', exact: true })
  59  |       .getByRole('button', { name: 'No', exact: true })
  60  |       .click();
  61  |     await page.getByRole('button', { name: 'Skip Shoulder feel', exact: true }).click();
  62  |     const exactNote = '  Synthetic exact whitespace  ';
  63  |     await page.getByRole('textbox', { name: 'Coach note', exact: true }).fill(exactNote);
  64  |     const route = `**/api/v1/workout-sessions/${session.id}`;
  65  |     await page.route(route, async (route) => {
  66  |       if (['PATCH', 'PUT'].includes(route.request().method()))
  67  |         await route.fulfill({
  68  |           status: 503,
  69  |           contentType: 'application/json',
  70  |           body: JSON.stringify({
  71  |             error: { code: 'SYNTHETIC_FAILURE', message: 'Synthetic save failure' },
  72  |           }),
  73  |         });
  74  |       else await route.continue();
  75  |     });
  76  |     await page.getByRole('button', { name: 'Finalize session' }).click();
  77  |     await expect(
  78  |       page.getByText('Unable to complete this workout. Try again.', { exact: true }),
  79  |     ).toBeVisible();
  80  |     await page.screenshot({ path: testInfo.outputPath('failed-save.png') });
  81  |     await page.unroute(route);
  82  |     await page.reload();
  83  |     await open();
  84  |     await expect(page.getByRole('textbox', { name: 'Coach note', exact: true })).toHaveValue(
  85  |       exactNote,
  86  |     );
  87  |     await expect(
  88  |       page
  89  |         .getByRole('group', { name: 'Any pain or discomfort? response', exact: true })
  90  |         .getByRole('button', { name: 'No', exact: true }),
  91  |     ).toHaveAttribute('aria-pressed', 'true');
  92  |     await page.getByRole('button', { name: 'Finalize session' }).press('Enter');
  93  |     await expect(page.getByRole('heading', { name: 'Workout summary' })).toBeVisible();
  94  |     const readback = await request.get(
  95  |       `http://127.0.0.1:3119/api/v1/workout-sessions/${session.id}`,
  96  |       { headers },
  97  |     );
  98  |     const saved = (await readback.json()).data;
  99  |     expect(saved.sets).toEqual(session.sets);
  100 |     expect(saved.notes).toBe(session.notes);
  101 |     expect(saved.startedAt).toBe(session.startedAt);
  102 |     expect(saved.feedback).toMatchObject({
  103 |       energy: 4,
  104 |       recovery: null,
  105 |       technique: null,
  106 |       notes: exactNote,
  107 |     });
  108 |     expect(saved.feedback.provenance.energy.mappingVersion).toBe('pulse-energy-emoji-v1');
  109 |     expect(
  110 |       saved.feedback.responses.find((response: { id: string }) => response.id === 'pain-discomfort')
  111 |         .value,
  112 |     ).toBe(false);
  113 |     expect(
  114 |       saved.sets.map(({ weight, reps, rir }: { weight: number; reps: number; rir: number }) => ({
  115 |         weight,
  116 |         reps,
  117 |         rir,
  118 |       })),
  119 |     ).toEqual([{ weight: 20, reps: 8, rir: 0 }]);
  120 |     await testInfo.attach('persisted-feedback', {
  121 |       body: JSON.stringify(saved.feedback, null, 2),
  122 |       contentType: 'application/json',
  123 |     });
  124 |     expect(
  125 |       await page.evaluate(
  126 |         () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
```