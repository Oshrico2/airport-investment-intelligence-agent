// Server dev loop: incremental tsc build + node --watch on the output.
// Simplification: avoids @nestjs/cli; restart is handled by Node itself.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
if (!existsSync('dist/main.js')) execFileSync(npx, ['tsc', '-p', 'tsconfig.build.json'], { stdio: 'inherit' });
const tsc = spawn(npx, ['tsc', '-p', 'tsconfig.build.json', '--watch', '--preserveWatchOutput'], { stdio: 'inherit' });
const node = spawn(process.execPath, ['--watch-path=dist', '--enable-source-maps', 'dist/main.js'], { stdio: 'inherit' });
const stop = () => { tsc.kill(); node.kill(); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
