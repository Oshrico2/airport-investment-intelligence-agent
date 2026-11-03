import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/**
 * Voice input end to end with a scripted recognizer (no microphone, no speech service, no AI): the transcript fills
 * the question box, is not sent by itself, and goes through the normal chat flow when the user presses Ask.
 */
const QUESTION = "What share of Anchorage's passenger flights are long-haul (3,000+ miles)?"; // a Demo question

async function installRecognizer(page: Page) {
  await page.addInitScript((question) => {
    class ScriptedRecognizer {
      lang = '';
      interimResults = false;
      continuous = true;
      maxAlternatives = 0;
      onresult: ((e: unknown) => void) | null = null;
      onerror: ((e: unknown) => void) | null = null;
      onend: (() => void) | null = null;
      start() {
        (window as unknown as { __voice: object }).__voice = { lang: this.lang, interim: this.interimResults };
        const result = (t: string, isFinal: boolean) => ({ results: [Object.assign([{ transcript: t }], { isFinal })] });
        // Keeps "speaking" (an interim result every 400 ms, so the app's silence timer never fires) until the test
        // finishes the utterance with a final result.
        const speaking = setInterval(() => this.onresult?.(result(question.slice(0, 20), false)), 400);
        setTimeout(() => this.onresult?.(result(question.slice(0, 20), false)), 150);
        (window as unknown as { __finish: () => void }).__finish = () => {
          clearInterval(speaking);
          this.onresult?.(result(question, true));
          this.onend?.();
        };
        (window as unknown as { __speaking: number }).__speaking = speaking as unknown as number;
      }
      stop() {}
      abort() {
        clearInterval((window as unknown as { __speaking: number }).__speaking);
        (window as unknown as { __aborted: boolean }).__aborted = true;
        this.onend?.();
      }
    }
    // Current Chromium ships the unprefixed SpeechRecognition natively, which the app prefers: replace both.
    for (const name of ['SpeechRecognition', 'webkitSpeechRecognition']) Object.defineProperty(window, name, { value: ScriptedRecognizer, configurable: true });
  }, QUESTION);
}

test('a spoken question fills the box, is reviewed, then answered through the normal flow', async ({ page }) => {
  await installRecognizer(page);
  await page.goto('/');
  const box = page.getByRole('textbox', { name: /Ask about U.S. airport traffic/ });
  await page.getByRole('button', { name: 'Ask by voice (English)' }).click();

  const stop = page.getByRole('button', { name: 'Stop listening' });
  await expect(stop).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('voice-status')).toContainText('Listening');
  await expect(box).toHaveValue(QUESTION.slice(0, 20)); // interim preview
  await page.waitForFunction(() => document.getAnimations().every((a) => a.effect?.getTiming().iterations === Infinity)); // load fades done
  const scan = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  expect(scan.violations.map((v) => v.id)).toEqual([]); // listening state is accessible too

  await page.evaluate(() => (window as unknown as { __finish: () => void }).__finish());
  await expect(box).toHaveValue(QUESTION);
  await expect(page.getByRole('article')).toHaveCount(0); // not sent automatically
  await page.locator('form').getByRole('button', { name: 'Ask', exact: true }).click();
  await expect(page.getByTestId('card-longhaul')).toBeVisible();
  await expect(page.getByTestId('headline-value')).toHaveText('2.77%');
});

test('Hebrew dictation is selectable and the Esc key cancels a recording', async ({ page }) => {
  await installRecognizer(page);
  await page.goto('/');
  await page.getByRole('button', { name: /Dictation language: English\. Switch to Hebrew/ }).click();
  await page.getByRole('button', { name: 'Ask by voice (Hebrew)' }).click();
  expect(await page.evaluate(() => (window as unknown as { __voice: { lang: string } }).__voice.lang)).toBe('he-IL');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('textbox', { name: /Ask about U.S. airport traffic/ })).toHaveValue('');
  await expect(page.getByRole('button', { name: 'Ask by voice (Hebrew)' })).toHaveAttribute('aria-pressed', 'false');
});

test('silence after speech ends the recording on its own and keeps the words', async ({ page }) => {
  await page.addInitScript(() => {
    class OneUtterance {
      lang = '';
      onresult: ((e: unknown) => void) | null = null;
      onend: (() => void) | null = null;
      onerror: ((e: unknown) => void) | null = null;
      start() {
        // Says one interim phrase and then goes quiet without ever ending (as real Chrome did for 60 s).
        setTimeout(() => this.onresult?.({ results: [Object.assign([{ transcript: 'Rank the New England airports' }], { isFinal: false })] }), 200);
      }
      stop() {}
      abort() {
        (window as unknown as { __aborted: boolean }).__aborted = true;
      }
    }
    for (const name of ['SpeechRecognition', 'webkitSpeechRecognition']) Object.defineProperty(window, name, { value: OneUtterance, configurable: true });
  });
  await page.goto('/');
  const t0 = Date.now();
  await page.getByRole('button', { name: /Ask by voice/ }).click();
  await expect(page.getByRole('button', { name: /Ask by voice/ })).toHaveAttribute('aria-pressed', 'false', { timeout: 5000 });
  const ms = Date.now() - t0;
  expect(ms).toBeGreaterThan(2000); // 0.2 s of speech + 2 s of silence
  expect(ms).toBeLessThan(4000);
  expect(await page.evaluate(() => (window as unknown as { __aborted: boolean }).__aborted)).toBe(true);
  await expect(page.getByRole('textbox', { name: /Ask about U.S. airport traffic/ })).toHaveValue('Rank the New England airports');
});
