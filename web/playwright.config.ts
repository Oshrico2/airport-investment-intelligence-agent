import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end, accessibility and performance suites against the production build: the NestJS server serves
 * web/dist and the API on one origin. Both AI keys are forced empty, so tests never call Gemini or Claude (Demo mode);
 * Demo pacing is off so the performance budgets measure the app, not the deliberate delay.
 */
const PORT = 4310;
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: { baseURL: `http://localhost:${PORT}`, reducedMotion: 'reduce' },
  webServer: {
    command: 'node ../server/dist/main.js',
    url: `http://localhost:${PORT}/api/health`,
    reuseExistingServer: false,
    env: { PORT: String(PORT), LIVE_CHECK: 'off', GEMINI_API_KEY: '', ANTHROPIC_API_KEY: '', DEMO_PACE_MS: '0', CHAT_RATE_LIMIT_PER_MIN: '1000', WEB_DIST: 'dist' },
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'mobile', use: { ...devices['Pixel 7'] }, testIgnore: /perf\.spec/ },
  ],
});
