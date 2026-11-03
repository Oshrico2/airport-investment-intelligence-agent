import { expect, test } from '@playwright/test';

/** User flows in Demo mode (no Gemini or Claude calls): every suggested analysis renders its deterministic cards. */

const FLOWS: [string, RegExp, string][] = [
  ['Which U.S. airports rank highest', /Investment ranking · United States/, 'card-ranking'],
  ['Rank the New England airports', /Investment ranking · New England/, 'card-ranking'],
  ["What share of Anchorage", /Long-haul share · 2025/, 'card-longhaul'],
  ['Compare delays at LAX and SNA', /Delays · LAX vs SNA/, 'card-delays'],
  ['Is there unmet demand for flights at SFO', /Capacity pressure/, 'card-capacity'],
  ['Give me an investment profile of Boston', /Logan International/, 'card-airport'],
  ['How is the investment score calculated', /How the investment score works/, 'card-method'],
];

for (const [question, title, card] of FLOWS) {
  test(`suggested analysis: ${question}`, async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: new RegExp(question) }).click();
    await expect(page.getByTestId(card).first()).toBeVisible();
    await expect(page.getByTestId(card).first()).toContainText(title);
    await expect(page.getByRole('article').locator('footer')).toBeVisible();
    await expect(page.getByTestId('mode-tag')).toHaveText(/Demo mode/);
    await expect(page.getByTestId(card).getByRole('list', { name: 'Sources' }).first()).toBeVisible(); // source + coverage on every block
  });
}

test('ANC answer states the approved figure and the cargo context', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /What share of Anchorage/ }).click();
  await expect(page.getByTestId('headline-value')).toHaveText('2.77%');
  await expect(page.getByTestId('card-longhaul')).toContainText('31.03%');
});

test('LAX vs SNA shows both periods and the congestion caveat', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Compare delays at LAX and SNA/ }).click();
  const delays = page.getByTestId('card-delays');
  await expect(delays).toHaveCount(2);
  await expect(delays.first()).toContainText('Full-year 2025');
  await expect(delays.nth(1)).toContainText('Jan–Aug 2026');
  await expect(delays.first()).toContainText('not a direct measure of terminal congestion');
});

test('free text in Demo mode lists the supported questions instead of guessing', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('textbox', { name: /Ask about U.S. airport traffic/ }).fill('What about Denver?');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('narrative')).toContainText('answers only the listed questions');
  await expect(page.getByTestId('turn-cards')).toHaveCount(0);
});

test('provider selector: unconfigured providers are disabled with the reason; the thread keeps its provider', async ({ page }) => {
  await page.goto('/');
  const picker = page.getByRole('group', { name: 'Answer with' });
  await expect(picker.getByRole('radio', { name: 'Demo' })).toBeChecked();
  for (const name of ['Gemini', 'Claude']) await expect(picker.getByRole('radio', { name })).toBeDisabled();
  await expect(page.getByTestId('disclosure')).toContainText('Claude is off: Set ANTHROPIC_API_KEY in server/.env');
  await expect(page.getByTestId('mode')).toHaveText('Demo mode · no AI');
  await page.getByRole('button', { name: /What share of Anchorage/ }).click();
  await expect(page.getByRole('article').locator('footer')).toBeVisible();
  const locked = page.getByRole('group', { name: /start a new analysis to switch/ });
  await expect(locked.getByRole('radio')).toHaveCount(1); // only the provider answering this thread
  await expect(locked.getByRole('radio', { name: 'Demo' })).toBeChecked();
  await expect(locked.getByRole('radio', { name: 'Demo' })).toBeDisabled();
  await page.getByRole('button', { name: 'New analysis' }).click();
  await expect(page.getByRole('group', { name: 'Answer with' }).getByRole('radio', { name: 'Demo' })).toBeEnabled();
});

test('Evidence panel keeps the last answer with data after a text-only reply', async ({ page, isMobile }) => {
  test.skip(isMobile, 'the side panel is desktop-only; mobile opens evidence per answer');
  await page.goto('/');
  await page.getByRole('button', { name: /What share of Anchorage/ }).click();
  const side = page.getByRole('complementary', { name: 'Evidence and details' });
  await expect(side.getByRole('heading', { name: 'Evidence' })).toBeVisible();
  await page.getByRole('textbox', { name: /Ask about U.S. airport traffic/ }).fill('What about Denver?');
  await page.keyboard.press('Enter');
  const turns = page.getByRole('article');
  await expect(turns).toHaveCount(2);
  await expect(turns.nth(1).locator('footer')).toBeVisible();
  await expect(side.getByRole('heading', { name: 'Evidence' })).toBeVisible(); // not the national board
  await expect(side).toContainText('TranStats FMG'); // the ANC answer's route-level source
  await expect(turns.first()).toHaveAttribute('data-selected', 'true'); // the answer whose evidence is shown
  await expect(turns.nth(1).getByTestId('narrative').locator('ul li')).toHaveCount(7); // Demo list renders as a list
});

test('branding: named logo, favicon, metadata and per-view titles', async ({ page, request }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('Airport Investment Intelligence Agent');
  await expect(page.getByRole('img', { name: 'Airport Investment Intelligence Agent' })).toBeVisible(); // also when the name text is hidden
  await expect(page.locator('link[rel="icon"][type="image/svg+xml"]')).toHaveAttribute('href', '/logo.svg');
  await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /official U.S. DOT \/ BTS data/);
  for (const [url, type] of [['/logo.svg', 'image/svg+xml'], ['/favicon-32.png', 'image/png'], ['/apple-touch-icon.png', 'image/png']]) {
    const res = await request.get(url!);
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toContain(type!);
  }
  // The PNG fallbacks must contain the mark, not a broken-image capture: sample the signal-yellow tile.
  const pixels = await page.evaluate(async () =>
    Promise.all([['/favicon-32.png', 32, 9, 6], ['/apple-touch-icon.png', 180, 60, 40]].map(async ([src, size, x, y]) => {
      const img = new Image();
      img.src = src as string;
      await img.decode();
      const c = Object.assign(document.createElement('canvas'), { width: size, height: size }).getContext('2d')!;
      c.drawImage(img, 0, 0);
      return [img.naturalWidth, ...c.getImageData(x as number, y as number, 1, 1).data.slice(0, 3)];
    })),
  );
  for (const [[width, r, g, b], size] of pixels.map((p, i) => [p, [32, 180][i]] as const)) {
    expect(width).toBe(size);
    expect(r).toBeGreaterThan(220);
    expect(g).toBeGreaterThan(160);
    expect(b).toBeLessThan(110);
  }
  await page.getByRole('button', { name: 'Rankings' }).click();
  await expect(page).toHaveTitle('Rankings · Airport Investment Intelligence Agent');
});

test('Rankings view filters by region and keeps national ranks', async ({ page }) => {
  await page.goto('/#/rankings');
  const rows = page.locator('tbody tr');
  await expect(rows).toHaveCount(144);
  await page.getByRole('combobox', { name: 'Region' }).selectOption('new-england');
  await expect(rows).toHaveCount(7);
  await expect(rows.first()).toContainText('HVN');
  await expect(rows.first().getByRole('cell').first()).toHaveText('7'); // the national rank column
});

test('clicking an airport opens its deterministic profile', async ({ page, isMobile }) => {
  await page.goto('/#/rankings');
  await page.getByRole('button', { name: /Open profile of PGD/ }).click();
  const scope = isMobile ? page.getByRole('dialog') : page.getByRole('complementary', { name: 'Evidence and details' });
  await expect(scope.getByTestId('card-airport')).toContainText('Punta Gorda');
  await expect(scope.getByTestId('card-airport').getByText(/^#\d+ national$/)).toContainText('#1');
});

test('mobile: Sources & limits opens a sheet that Escape closes', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'sheet is the mobile pattern');
  await page.goto('/');
  await page.getByRole('button', { name: /Is there unmet demand/ }).click();
  await page.getByRole('button', { name: 'Sources & limits' }).click();
  const sheet = page.getByRole('dialog', { name: 'Sources & limits' });
  await expect(sheet).toBeVisible();
  await expect(sheet).toContainText('cannot be observed');
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();
});
