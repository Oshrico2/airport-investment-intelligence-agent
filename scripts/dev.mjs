// Starts the NestJS API (tsc watch + node --watch) and the Vite dev server together.
// Simplification: plain child processes instead of a process-manager dependency.
import { spawn } from 'node:child_process';

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const children = [
  spawn(npm, ['run', 'dev', '-w', 'server'], { stdio: 'inherit' }),
  spawn(npm, ['run', 'dev', '-w', 'web'], { stdio: 'inherit' }),
];
const stop = () => children.forEach((c) => c.kill('SIGTERM'));
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
children.forEach((c) => c.on('exit', (code) => { if (code) { stop(); process.exitCode = code; } }));
