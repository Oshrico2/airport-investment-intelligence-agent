import { expect, test } from '@playwright/test';

/** The input meter with Chromium's fake microphone (a test tone): real getUserMedia and Web Audio, no speech service. */
test.use({ launchOptions: { args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] }, permissions: ['microphone'] });

test('the level meter tracks the microphone while listening and releases it on Stop', async ({ page }) => {
  await page.addInitScript(() => {
    class Quiet {
      lang = '';
      onresult = null;
      onend = null;
      onerror = null;
      start() {}
      stop() {}
      abort() {}
    }
    for (const name of ['SpeechRecognition', 'webkitSpeechRecognition']) Object.defineProperty(window, name, { value: Quiet, configurable: true });
    // Track the meter's own stream so the test can check the microphone is released.
    const real = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async (c) => {
      const s = await real(c);
      (window as unknown as { __tracks: MediaStreamTrack[] }).__tracks = s.getTracks();
      return s;
    };
  });
  await page.goto('/');
  await page.getByRole('button', { name: /Ask by voice/ }).click();
  const meter = page.getByRole('meter', { name: 'Microphone level' });
  await expect(meter).toBeVisible();
  await expect.poll(async () => Number(await meter.getAttribute('aria-valuenow')), { timeout: 5000 }).toBeGreaterThan(-60);
  await page.getByRole('button', { name: 'Stop listening' }).click();
  await expect(meter).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as { __tracks: MediaStreamTrack[] }).__tracks.map((t) => t.readyState))).toEqual(['ended']);
});
