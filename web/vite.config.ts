/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // The API runs on :3000; the browser only ever talks to the Vite origin.
    proxy: { '/api': 'http://localhost:3000' },
  },
  preview: { port: 4173, proxy: { '/api': 'http://localhost:3000' } },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
