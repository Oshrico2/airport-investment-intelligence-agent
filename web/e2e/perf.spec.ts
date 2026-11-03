import { expect, test } from '@playwright/test';
import { readdirSync, readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

/** Performance budgets. Measured locally against the production build. */

test('initial JavaScript stays within 150 KB gzip', () => {
  const js = readdirSync('dist/assets').filter((f) => f.endsWith('.js'));
  const total = js.reduce((sum, f) => sum + gzipSync(readFileSync(`dist/assets/${f}`)).length, 0);
  console.log(`initial JS: ${(total / 1024).toFixed(1)} KB gzip`);
  expect(total).toBeLessThan(150 * 1024);
});

test('deterministic API answers in well under 50 ms (p95 over 30 requests)', async ({ request }) => {
  const times: number[] = [];
  for (let i = 0; i < 30; i++) {
    const t = performance.now();
    const res = await request.get(i % 3 === 0 ? '/api/rankings?limit=200' : i % 3 === 1 ? '/api/airports/SFO' : '/api/rankings?region=New%20England');
    expect(res.ok()).toBe(true);
    times.push(performance.now() - t);
  }
  times.sort((a, b) => a - b);
  const p95 = times[Math.floor(times.length * 0.95) - 1]!;
  console.log(`API p50 ${times[15]!.toFixed(1)} ms, p95 ${p95.toFixed(1)} ms`);
  expect(p95).toBeLessThan(50);
});

test('home renders the composer and national board quickly', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('textbox', { name: /Ask about U.S. airport traffic/ })).toBeVisible();
  await expect(page.getByRole('region', { name: 'National board' }).getByRole('listitem').first()).toBeVisible();
  const lcp = await page.evaluate(
    () => new Promise<number>((resolve) => {
      new PerformanceObserver((list) => resolve(list.getEntries().at(-1)!.startTime)).observe({ type: 'largest-contentful-paint', buffered: true });
    }),
  );
  console.log(`LCP ${lcp.toFixed(0)} ms`);
  expect(lcp).toBeLessThan(2000);
});

test('a common question (Demo mode) completes end to end within 1 s', async ({ page }) => {
  await page.goto('/');
  const t = Date.now();
  await page.getByRole('button', { name: /Rank the New England airports/ }).click();
  await expect(page.getByTestId('card-ranking')).toBeVisible();
  await expect(page.getByRole('article').locator('footer')).toBeVisible();
  const ms = Date.now() - t;
  console.log(`demo answer end to end: ${ms} ms`);
  expect(ms).toBeLessThan(1000);
});

test('the full 144-airport board renders without long main-thread work', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    (window as unknown as { __long: number }).__long = 0;
    new PerformanceObserver((list) => list.getEntries().forEach((e) => ((window as unknown as { __long: number }).__long += e.duration))).observe({ type: 'longtask' });
  });
  await page.getByRole('button', { name: 'Rankings' }).first().click();
  await expect(page.locator('tbody tr')).toHaveCount(144);
  await page.waitForTimeout(600);
  const long = await page.evaluate(() => (window as unknown as { __long: number }).__long);
  console.log(`long tasks while rendering the full board: ${long.toFixed(0)} ms`);
  expect(long).toBeLessThan(250);
});
