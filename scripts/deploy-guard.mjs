#!/usr/bin/env node
/**
 * Refuses a Vercel deployment that would carry a secret (adapted from shopping-list-app's deploy guard).
 *
 *   node scripts/deploy-guard.mjs check      before `vercel build`: repository safety rules
 *   node scripts/deploy-guard.mjs prebuilt   before `vercel deploy --prebuilt`: scans .vercel/output
 *   node scripts/deploy-guard.mjs prebuilt <dir>   scans another directory (tests of the guard itself)
 *
 * This project deploys only with --prebuilt (scripts/deploy.sh), so the upload is exactly .vercel/output. The Vercel CLI
 * does NOT read .gitignore, and its bundler (nft) follows file paths in code, e.g. server/src/config/env.ts names
 * server/.env. So the output is checked for:
 *   · env files, keys and tool folders by name (.env*, *.pem, *.key, .vercel, .claude, .idea),
 *   · key-shaped strings (Anthropic sk-ant-…, Google AIza…) and env-file assignments of the secret variables,
 *   · the actual secret values found locally (server/.env, .vercel/.env.*.local, the macOS Keychain items of the
 *     codes CLI): any of them in any output file fails the check.
 * Only file and variable names are reported, never values. Exit codes: 0 clean, 1 unsafe, 2 could not check.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = process.cwd();
const SECRET_NAMES = ['ANTHROPIC_API_KEY', 'GEMINI_API_KEY', 'ACCESS_CODE_SECRET', 'KV_REST_API_TOKEN', 'KV_REST_API_READ_ONLY_TOKEN', 'KV_URL', 'REDIS_URL', 'UPSTASH_REDIS_REST_TOKEN', 'VERCEL_OIDC_TOKEN'];
const KEY_SHAPES = [/sk-ant-[A-Za-z0-9_-]{20,}/, /AIza[0-9A-Za-z_-]{30,}/];
const ASSIGNMENT = new RegExp(`(^|\\n)\\s*(${SECRET_NAMES.join('|')})=\\S`);

const fail = (msg, code = 1) => {
  console.error(`deploy-guard: ${msg}`);
  process.exit(code);
};

export function isForbidden(relPath) {
  const parts = relPath.split('/');
  const base = parts.at(-1);
  if (/^\.env(\..+)?$/.test(base) && base !== '.env.example') return true;
  if (/\.(pem|key)$/.test(base)) return true;
  return parts.some((p) => p === '.vercel' || p === '.claude' || p === '.idea');
}

function walk(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.isFile()) out.push(p);
  }
  return out;
}

/** name → value of every secret present locally (values never leave this process). */
function localSecrets() {
  const found = new Map();
  const envFiles = [join(root, 'server', '.env'), ...(existsSync(join(root, '.vercel')) ? readdirSync(join(root, '.vercel')).filter((f) => f.startsWith('.env')).map((f) => join(root, '.vercel', f)) : [])];
  for (const f of envFiles.filter(existsSync)) {
    for (const line of readFileSync(f, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]*)"?\s*$/);
      if (m && SECRET_NAMES.includes(m[1]) && m[2].length >= 16) found.set(`${m[1]} (${relative(root, f)})`, m[2]);
    }
  }
  for (const name of ['ACCESS_CODE_SECRET', 'KV_REST_API_TOKEN']) {
    try {
      const v = execFileSync('security', ['find-generic-password', '-s', 'airport-investment-agent', '-a', name, '-w'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
      if (v.length >= 16) found.set(`${name} (Keychain)`, v);
    } catch {
      // not stored on this machine
    }
  }
  return found;
}

function check() {
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  if (existsSync(join(root, '.nowignore'))) fail('.nowignore exists: remove it (the CLI would read it instead of .vercelignore).');
  try {
    git('ls-files', '--error-unmatch', '.vercelignore', 'vercel.json');
    git('diff', '--quiet', 'HEAD', '--', '.vercelignore', 'vercel.json');
  } catch {
    fail('.vercelignore and vercel.json must be committed and unmodified. Never deploy with temporary versions.');
  }
  const tracked = git('ls-files').split('\n').filter((p) => p && isForbidden(p));
  if (tracked.length) fail(`secret-like files are tracked by git: ${tracked.join(', ')}`);
  if (!/^\/?\.vercel\/?$/m.test(readFileSync(join(root, '.gitignore'), 'utf8'))) fail('.gitignore must ignore .vercel (CLI credentials and pulled env files).');
  console.log(JSON.stringify({ ok: true, mode: 'check' }));
}

function prebuilt(dir = join(root, '.vercel', 'output')) {
  if (!existsSync(dir)) fail(`${relative(root, dir)} does not exist: run \`vercel build\` first`, 2);
  // A non-standalone build only references some function files (`filePathMap` in .vc-config.json); the deploy uploads
  // them from the repository. scripts/deploy.sh builds --standalone, but referenced files are checked here as well.
  const referenced = walk(dir).filter((f) => f.endsWith('.vc-config.json')).flatMap((f) => Object.values(JSON.parse(readFileSync(f, 'utf8')).filePathMap ?? {}).map((p) => join(root, p)));
  const files = [...walk(dir), ...referenced];
  const named = files.map((f) => relative(f.startsWith(dir) ? dir : root, f)).filter((f) => isForbidden(f));
  const secrets = localSecrets();
  const leaks = [];
  for (const f of files) {
    const text = readFileSync(f, 'latin1');
    const rel = f.startsWith(dir) ? relative(dir, f) : `${relative(root, f)} (referenced)`;
    if (KEY_SHAPES.some((re) => re.test(text)) || ASSIGNMENT.test(text)) leaks.push(`${rel} (key-shaped string or secret assignment)`);
    for (const [name, value] of secrets) if (text.includes(value)) leaks.push(`${rel} (contains ${name})`);
  }
  if (named.length || leaks.length) fail(`prebuilt output carries secrets: ${[...named, ...leaks].join(', ')}`);
  console.log(JSON.stringify({ ok: true, mode: 'prebuilt', files: files.length, referenced: referenced.length, secretValuesChecked: secrets.size }));
}

const mode = process.argv[2];
if (mode === 'check') check();
else if (mode === 'prebuilt') prebuilt(process.argv[3]);
else fail('usage: deploy-guard.mjs check | prebuilt', 2);
