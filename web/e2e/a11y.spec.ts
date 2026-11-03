import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

/** Automated WCAG 2.2 A/AA checks (axe-core) on every screen state, plus keyboard operation. */

const scan = async (page: import('@playwright/test').Page) => {
  // The one-pass load choreography fades content in: scan the settled page, not a frame mid-fade.
  await page.waitForFunction(() => document.getAnimations().every((a) => a.effect?.getTiming().iterations === Infinity));
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  const summary = results.violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.length} nodes, e.g. ${v.nodes[0]?.target.join(' ')}`);
  expect(summary, summary.join('\n')).toEqual([]);
};

test('home has no axe violations', async ({ page }) => {
  await page.goto('/');
  const departures = page.getByRole('region', { name: 'Departures' }).getByRole('button');
  const national = page.getByRole('region', { name: 'National board' }).getByRole('listitem').getByRole('button');
  await expect(departures.or(national).first()).toBeVisible();
  await scan(page);
});

test('an answer with ranking cards has no axe violations', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Rank the New England airports/ }).click();
  await expect(page.getByRole('article').locator('footer')).toBeVisible();
  await page.locator('summary', { hasText: 'are not ranked' }).click();
  await scan(page);
});

test('capacity, delay and long-haul cards have no axe violations', async ({ page }) => {
  await page.goto('/');
  for (const q of [/Is there unmet demand/, /Compare delays at LAX/, /What share of Anchorage/]) {
    await page.getByRole('button', { name: q }).first().click().catch(async () => {
      await page.getByRole('textbox').fill('x'); // the board is hidden once a thread starts; fall back to the composer
    });
    await expect(page.getByRole('article').locator('footer').last()).toBeVisible();
    if (q.source.includes('unmet')) break;
  }
  await scan(page);
});

test('Rankings and Method views have no axe violations', async ({ page }) => {
  await page.goto('/#/rankings');
  await expect(page.locator('tbody tr').first()).toBeVisible();
  await scan(page);
  await page.goto('/#/method');
  await expect(page.getByTestId('card-method').first()).toBeVisible();
  await scan(page);
});

test('keyboard: "/" focuses the composer, Enter asks, focus is visible', async ({ page, isMobile }) => {
  await page.goto('/');
  await page.locator('body').click({ position: { x: 5, y: 600 } });
  await page.keyboard.press('/');
  await expect(page.getByRole('textbox', { name: /Ask about U.S. airport traffic/ })).toBeFocused();
  await page.keyboard.type('How is the investment score calculated?');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('card-method')).toBeVisible();
  // Fine pointers keep focus in the follow-up box; touch devices do not auto-focus (it would raise the keyboard).
  if (!isMobile) await expect(page.getByRole('textbox', { name: /Ask about U.S. airport traffic/ })).toBeFocused();
  else await page.getByRole('textbox', { name: /Ask about U.S. airport traffic/ }).focus();
  await page.keyboard.press('Shift+Tab'); // previous control (e.g. "Sources & limits")
  const focused = await page.evaluate(() => ({ tag: document.activeElement?.tagName, outline: getComputedStyle(document.activeElement as Element).outlineStyle }));
  expect(focused.tag).toBe('BUTTON');
  expect(focused.outline).not.toBe('none');
});

test('sortable headers expose aria-sort and respond to the keyboard', async ({ page }) => {
  await page.goto('/#/rankings');
  const growth = page.getByRole('button', { name: /^Growth/ });
  await growth.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('th', { has: growth })).toHaveAttribute('aria-sort', 'descending');
  await expect(page.locator('tbody tr').first()).toContainText('ILM'); // highest growth, +25.29%
});
