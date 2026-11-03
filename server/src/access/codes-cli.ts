import { execFileSync } from 'node:child_process';
import { AccessControl, type CodeRecord } from './access';
import { UpstashRedis } from './redis';

/**
 * Owner-only management of the production access codes, run on your own machine (README "Production access codes"):
 *
 *   npm run codes -- setup                 5 reviewer codes + 1 owner-test code, 20 questions each (skips existing)
 *   npm run codes -- list                  every code: kind, used / limit, remaining, unfinished, revoked, last used
 *   npm run codes -- show reviewer-3       print one code, to resend it privately
 *   npm run codes -- issue reviewer-6 [--limit 20] [--test]
 *   npm run codes -- grant reviewer-3 10   add questions to a code
 *   npm run codes -- revoke reviewer-3     (or: revoke --all) immediate, no redeploy
 *   npm run codes -- rotate reviewer-3     revoke and replace with a new code, fresh quota
 *   npm run codes -- set-used owner-test 19   (production verification only)
 * Add --env preview to manage the preview deployment's codes instead of production's.
 *
 * Credentials (never in the repository): KV_REST_API_URL, KV_REST_API_TOKEN and ACCESS_CODE_SECRET from the
 * environment, else from the macOS Keychain (service "airport-investment-agent", account = the variable name).
 * Codes are printed only by setup, issue, show and rotate; the Redis token and the secret never are.
 */
export const KEYCHAIN_SERVICE = 'airport-investment-agent';
const LIMIT = 20;

function credential(name: string): string {
  const fromEnv = process.env[name]?.trim();
  if (fromEnv) return fromEnv;
  try {
    return execFileSync('security', ['find-generic-password', '-s', KEYCHAIN_SERVICE, '-a', name, '-w'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    throw new Error(`${name} is not set and not in the macOS Keychain (service "${KEYCHAIN_SERVICE}", account "${name}").`);
  }
}

const row = (r: CodeRecord) => [r.label.padEnd(20), r.kind.padEnd(9), `${r.used} / ${r.limit}`.padEnd(9), String(Math.max(0, r.limit - r.used)).padEnd(10), String(r.unfinished).padEnd(11), (r.revoked ? 'yes' : 'no').padEnd(8), r.lastUsedAt ?? '-'].join('');

/** `--env` and `--limit` take a value; other `--x` are flags; the rest are positional. */
export function parseArgs(args: string[]): { positional: string[]; options: Map<string, string> } {
  const positional: string[] = [];
  const options = new Map<string, string>();
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (!a.startsWith('--')) positional.push(a);
    else options.set(a.slice(2), ['--env', '--limit'].includes(a) ? (args[++i] ?? '') : 'true');
  }
  return { positional, options };
}

/** Runs one command; `print` receives everything meant for the terminal. Exported for tests. */
export async function runCodes(args: string[], access: AccessControl, print: (line: string) => void): Promise<void> {
  const { positional, options } = parseArgs(args);
  const [command, label, value] = positional;
  const flag = (name: string) => options.has(name);
  const option = (name: string) => options.get(name);
  const need = (v: string | undefined, what: string) => {
    if (!v) throw new Error(`Missing ${what}. Usage: see the top of server/src/access/codes-cli.ts`);
    return v;
  };
  const count = (v: string | undefined, what: string) => {
    const n = Number(need(v, what));
    if (!Number.isInteger(n) || n < 0) throw new Error(`${what} must be a whole number`);
    return n;
  };

  switch (command) {
    case 'setup': {
      const existing = new Set((await access.list()).filter((r) => !r.revoked).map((r) => r.label));
      for (const [l, kind] of [...[1, 2, 3, 4, 5].map((n) => [`reviewer-${n}`, 'reviewer'] as const), ['owner-test', 'test'] as const]) {
        print(existing.has(l) ? `${l.padEnd(12)} exists (npm run codes -- show ${l})` : `${l.padEnd(12)} ${await access.issue(l, kind, LIMIT)}`);
      }
      return;
    }
    case 'list': {
      const rows = (await access.list()).filter((r) => flag('all') || !r.label.includes('~'));
      print(['Label'.padEnd(20), 'Kind'.padEnd(9), 'Used'.padEnd(9), 'Remaining'.padEnd(10), 'Unfinished'.padEnd(11), 'Revoked'.padEnd(8), 'Last used'].join(''));
      rows.forEach((r) => print(row(r)));
      return;
    }
    case 'show':
      print(await access.reveal(need(label, 'label')));
      return;
    case 'issue':
      print(await access.issue(need(label, 'label'), flag('test') ? 'test' : 'reviewer', count(option('limit') ?? String(LIMIT), '--limit')));
      return;
    case 'grant':
      print(row(await access.grant(need(label, 'label'), count(value, 'number of questions'))));
      return;
    case 'set-used':
      print(row(await access.setUsed(need(label, 'label'), count(value, 'number of questions'))));
      return;
    case 'revoke': {
      const labels = flag('all') ? (await access.list()).filter((r) => !r.revoked).map((r) => r.label) : [need(label, 'label (or --all)')];
      for (const l of labels) await access.revoke(l);
      print(`Revoked: ${labels.join(', ') || 'nothing active'}`);
      return;
    }
    case 'rotate':
      print(await access.rotate(need(label, 'label')));
      return;
    default:
      throw new Error(`Unknown command "${command ?? ''}". Commands: setup, list, show, issue, grant, set-used, revoke, rotate`);
  }
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const env = parseArgs(args).options.get('env') ?? 'production';
  try {
    if (env !== 'production' && env !== 'preview') throw new Error('--env must be production or preview');
    const access = new AccessControl(new UpstashRedis(credential('KV_REST_API_URL'), credential('KV_REST_API_TOKEN')), credential('ACCESS_CODE_SECRET'), `aia:${env}:`);
    console.log(`[${env}]`);
    runCodes(args, access, (line) => console.log(line)).catch((e: Error) => {
      console.error(e.message);
      process.exit(1);
    });
  } catch (e) {
    console.error((e as Error).message);
    process.exit(1);
  }
}
