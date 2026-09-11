# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: daily-target-adjustment.spec.ts >> desktop-1280: create, edit, reload, future-confine, and restore a daily adjustment
- Location: e2e/daily-target-adjustment.spec.ts:76:7

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByRole('heading', { name: 'Nutrition' })
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for getByRole('heading', { name: 'Nutrition' })

```

```yaml
- main:
  - paragraph: Pulse
  - heading "Welcome back" [level=1]
  - paragraph: Sign in to pick up where you left off.
  - text: Welcome back Sign in to continue tracking workouts, habits, and recovery. Username
  - textbox "Username":
    - /placeholder: derek
  - text: Password
  - textbox "Password":
    - /placeholder: Enter your password
  - button "Sign in"
  - paragraph:
    - text: Don't have an account?
    - link "Go to register":
      - /url: /register
      - text: Register
- region "Notifications alt+T"
```

# Test source

```ts
  1   | import { expect, request, test, type APIRequestContext, type Page } from '@playwright/test';
  2   | 
  3   | import { setAuthenticatedSession } from './auth-session';
  4   | import { apiBaseURL } from './test-env';
  5   | 
  6   | const addDays = (date: string, amount: number) => {
  7   |   const value = new Date(`${date}T12:00:00.000Z`);
  8   |   value.setUTCDate(value.getUTCDate() + amount);
  9   |   return value.toISOString().slice(0, 10);
  10  | };
  11  | 
  12  | const monitor = (page: Page) => {
  13  |   const consoleMessages: string[] = [];
  14  |   const failedRequests: string[] = [];
  15  |   const responses: Array<{ method: string; path: string; status: number }> = [];
  16  |   page.on('console', (message) => {
  17  |     if (message.type() === 'error' || message.type() === 'warning') {
  18  |       consoleMessages.push(`${message.type()}: ${message.text()}`);
  19  |     }
  20  |   });
  21  |   page.on('pageerror', (error) => consoleMessages.push(`pageerror: ${error.message}`));
  22  |   page.on('requestfailed', (requestValue) =>
  23  |     failedRequests.push(
  24  |       `${requestValue.method()} ${new URL(requestValue.url()).pathname} ${requestValue.failure()?.errorText ?? ''}`,
  25  |     ),
  26  |   );
  27  |   page.on('response', (response) => {
  28  |     const path = new URL(response.url()).pathname;
  29  |     if (path.includes('/api/v1/nutrition')) {
  30  |       responses.push({ method: response.request().method(), path, status: response.status() });
  31  |     }
  32  |   });
  33  |   return { consoleMessages, failedRequests, responses };
  34  | };
  35  | 
  36  | async function registerFixture(api: APIRequestContext, suffix: string) {
  37  |   const registration = await api.post('/api/v1/auth/register', {
  38  |     data: {
  39  |       username: `dt-${suffix.slice(0, 3)}-${Date.now().toString().slice(-10)}`,
  40  |       password: 'daily-target-test-password',
  41  |       timeZone: 'America/Detroit',
  42  |     },
  43  |   });
  44  |   expect(registration.ok(), await registration.text()).toBeTruthy();
  45  |   const token = ((await registration.json()) as { data: { token: string } }).data.token;
  46  |   const state = await api.get('/api/v1/adaptive-nutrition', {
  47  |     headers: { authorization: `Bearer ${token}` },
  48  |   });
  49  |   expect(state.ok(), await state.text()).toBeTruthy();
  50  |   const localDate = ((await state.json()) as { data: { localDate: string } }).data.localDate;
  51  |   const target = await api.post('/api/v1/nutrition-targets', {
  52  |     data: {
  53  |       calories: 2_200,
  54  |       protein: 180,
  55  |       carbs: 250,
  56  |       fat: 70,
  57  |       effectiveDate: addDays(localDate, -7),
  58  |     },
  59  |     headers: { authorization: `Bearer ${token}` },
  60  |   });
  61  |   expect(target.ok(), await target.text()).toBeTruthy();
  62  |   return { localDate, token };
  63  | }
  64  | 
  65  | async function openDate(page: Page, token: string, date: string) {
  66  |   await setAuthenticatedSession(page, token);
  67  |   await page.goto(`/nutrition?view=log&date=${date}`, { waitUntil: 'networkidle' });
> 68  |   await expect(page.getByRole('heading', { name: 'Nutrition' })).toBeVisible();
      |                                                                  ^ Error: expect(locator).toBeVisible() failed
  69  |   await expect(page.getByRole('heading', { name: 'Daily targets' })).toBeVisible();
  70  | }
  71  | 
  72  | for (const viewport of [
  73  |   { name: 'mobile-375', width: 375, height: 900 },
  74  |   { name: 'desktop-1280', width: 1280, height: 900 },
  75  | ] as const) {
  76  |   test(`${viewport.name}: create, edit, reload, future-confine, and restore a daily adjustment`, async ({
  77  |     page,
  78  |   }, testInfo) => {
  79  |     await page.setViewportSize(viewport);
  80  |     const api = await request.newContext({ baseURL: apiBaseURL });
  81  |     const diagnostics = monitor(page);
  82  |     const fixture = await registerFixture(api, viewport.name);
  83  |     const selectedDate = fixture.localDate;
  84  |     const historicalDate = addDays(fixture.localDate, -1);
  85  |     const futureDate = addDays(fixture.localDate, 1);
  86  | 
  87  |     try {
  88  |       await openDate(page, fixture.token, selectedDate);
  89  |       await page.getByRole('button', { name: 'Adjust this day' }).focus();
  90  |       await page.keyboard.press('Enter');
  91  |       await page.getByLabel('Calories (kcal)').fill('2500');
  92  |       await page.getByLabel('Reason (optional)').fill('Planned event');
  93  |       const createResponse = page.waitForResponse(
  94  |         (response) =>
  95  |           response.request().method() === 'PATCH' &&
  96  |           new URL(response.url()).pathname.endsWith(`/${selectedDate}/target-override`),
  97  |       );
  98  |       await page.getByRole('button', { name: 'Save adjustment' }).click();
  99  |       const created = await createResponse;
  100 |       expect(created.ok(), await created.text()).toBeTruthy();
  101 |       await expect(page.getByText('Adjusted', { exact: true })).toBeVisible();
  102 |       await expect(page.getByText('Baseline 2,200 kcal')).toBeVisible();
  103 |       await expect(page.getByRole('article', { name: 'Daily energy' })).toContainText(
  104 |         'Adjusted target',
  105 |       );
  106 | 
  107 |       await page.reload({ waitUntil: 'networkidle' });
  108 |       await expect(page.getByText('Planned event')).toBeVisible();
  109 |       await page.getByRole('button', { name: 'Edit adjustment' }).click();
  110 |       await page.getByLabel('Protein (g)').fill('200');
  111 |       await page.getByRole('button', { name: 'Save adjustment' }).click();
  112 |       await expect(page.getByText('Baseline 180 g')).toBeVisible();
  113 | 
  114 |       await openDate(page, fixture.token, historicalDate);
  115 |       await expect(
  116 |         page.getByText('No accepted baseline target was effective on this date.'),
  117 |       ).toBeVisible();
  118 |       await expect(page.getByRole('button', { name: 'Adjust this day' })).toBeDisabled();
  119 | 
  120 |       await openDate(page, fixture.token, futureDate);
  121 |       await expect(page.getByText('Adjusted', { exact: true })).toHaveCount(0);
  122 |       await expect(page.getByText('2,200 kcal')).toBeVisible();
  123 | 
  124 |       const selectedReadback = await api.get(`/api/v1/nutrition/${selectedDate}/target-override`, {
  125 |         headers: { authorization: `Bearer ${fixture.token}` },
  126 |       });
  127 |       const futureReadback = await api.get(`/api/v1/nutrition/${futureDate}/target-override`, {
  128 |         headers: { authorization: `Bearer ${fixture.token}` },
  129 |       });
  130 |       expect((await selectedReadback.json()).data).toMatchObject({
  131 |         adjusted: true,
  132 |         effective: { calories: 2_500, protein: 200 },
  133 |       });
  134 |       expect((await futureReadback.json()).data).toMatchObject({
  135 |         adjusted: false,
  136 |         effective: { calories: 2_200, protein: 180 },
  137 |       });
  138 | 
  139 |       await openDate(page, fixture.token, selectedDate);
  140 |       await page.getByRole('button', { name: 'Restore baseline' }).click();
  141 |       await expect(page.getByText('Adjusted', { exact: true })).toHaveCount(0);
  142 |       await expect(page.getByText('Baseline 2,200 kcal')).toHaveCount(0);
  143 |       expect(
  144 |         await page.evaluate(
  145 |           () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
  146 |         ),
  147 |       ).toBe(true);
  148 | 
  149 |       await testInfo.attach(`${viewport.name}-network`, {
  150 |         body: Buffer.from(JSON.stringify(diagnostics.responses, null, 2)),
  151 |         contentType: 'application/json',
  152 |       });
  153 |       await testInfo.attach(`${viewport.name}-console`, {
  154 |         body: Buffer.from(JSON.stringify(diagnostics.consoleMessages, null, 2)),
  155 |         contentType: 'application/json',
  156 |       });
  157 |       await page.screenshot({
  158 |         fullPage: true,
  159 |         path: testInfo.outputPath(`${viewport.name}-restored.png`),
  160 |       });
  161 |       expect(diagnostics.consoleMessages).toEqual([]);
  162 |       expect(diagnostics.failedRequests).toEqual([]);
  163 |       expect(
  164 |         diagnostics.responses.some((entry) => entry.method === 'PATCH' && entry.status === 200),
  165 |       ).toBe(true);
  166 |       expect(
  167 |         diagnostics.responses.some((entry) => entry.method === 'DELETE' && entry.status === 200),
  168 |       ).toBe(true);
```