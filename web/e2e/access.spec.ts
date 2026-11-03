import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import type { AccessStatus } from '../../shared/api';

/**
 * The production access screen and quota notes. The local server needs no code, so /api/access is answered here the
 * way production answers it; everything else is the real app and server (Demo mode, no AI key).
 */
const scan = async (page: Page) => {
  await page.waitForFunction(() => document.getAnimations().every((a) => a.effect?.getTiming().iterations === Infinity));
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  const summary = results.violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.length} nodes, e.g. ${v.nodes[0]?.target.join(' ')}`);
  expect(summary, summary.join('\n')).toEqual([]);
};

const EXHAUSTED = 'You have used all 20 questions for this access code. Please contact the developer for additional access.';

async function productionAccess(page: Page) {
  let status: AccessStatus = { required: true, granted: false };
  await page.route('**/api/access', async (route) => {
    if (route.request().method() === 'POST') {
      const { code } = route.request().postDataJSON() as { code: string };
      if (code !== 'AIA-TEST-TEST-TEST-TEST') return route.fulfill({ status: 401, json: { error: 'That access code is not valid. Check it and try again.', code: 'access_required' } });
      status = { required: true, granted: true, used: 3, limit: 20, remaining: 17 };
    }
    return route.fulfill({ json: status });
  });
  return (s: AccessStatus) => (status = s);
}

test('asks for an access code first, then shows the remaining questions', async ({ page }, info) => {
  await productionAccess(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Enter your access code' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Access code' })).toBeFocused();
  await scan(page);
  await page.screenshot({ path: info.outputPath('access-screen.png') });

  await page.getByRole('textbox', { name: 'Access code' }).fill('AIA-WRONG');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('alert')).toHaveText('That access code is not valid. Check it and try again.');
  await scan(page);
  await page.screenshot({ path: info.outputPath('access-error.png') });

  await page.getByRole('textbox', { name: 'Access code' }).fill('AIA-TEST-TEST-TEST-TEST');
  await page.getByRole('textbox', { name: 'Access code' }).press('Enter');
  await expect(page.getByRole('heading', { name: /Which U\.S\. airports deserve capital next/ })).toBeVisible();
  await expect(page.getByTestId('quota')).toHaveText('17 of 20 questions left on your access code.');
  expect(await page.evaluate(() => document.cookie + localStorage.length + sessionStorage.length)).toBe('00'); // nothing stored by the page
});

test('shows the friendly message once the code is used up', async ({ page }, info) => {
  const set = await productionAccess(page);
  set({ required: true, granted: true, used: 20, limit: 20, remaining: 0, message: EXHAUSTED });
  await page.goto('/');
  await expect(page.getByTestId('quota')).toHaveText(EXHAUSTED);
  await expect(page.getByTestId('quota')).toHaveAttribute('role', 'status');
  await scan(page);
  await page.screenshot({ path: info.outputPath('quota-exhausted.png') });
});
