/**
 * Claude verification, with as few billed tokens as possible:
 *   npm run verify:claude -w server            model lookup only (Models API, no tokens billed)
 *   npm run verify:claude -w server -- --live  plus 1 small streamed request with one tool (a few hundred tokens)
 * Needs ANTHROPIC_API_KEY in server/.env. The key is never printed.
 */
import Anthropic from '@anthropic-ai/sdk';
import { readEnv } from '../config/env';
import { describeClaudeError } from './claude-agent';

async function main(): Promise<void> {
  const env = readEnv();
  if (!env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is not set (server/.env). Create a key at https://console.anthropic.com/settings/keys');
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, timeout: env.ANTHROPIC_TIMEOUT_MS });
  const model = env.ANTHROPIC_MODEL;
  try {
    const info = await client.models.retrieve(model);
    console.log(`${model}: available (${info.display_name})`);
    if (!process.argv.includes('--live')) return;
    const t0 = performance.now();
    let firstTextMs: number | null = null;
    const stream = client.messages.stream({
      model,
      max_tokens: 256,
      tools: [{ name: 'get_data_sources', description: 'Lists the data sources.', input_schema: { type: 'object', properties: {} } }],
      messages: [{ role: 'user', content: 'Which data sources does this tool use? Call the tool.' }],
    });
    stream.on('text', () => (firstTextMs ??= Math.round(performance.now() - t0)));
    const reply = await stream.finalMessage();
    const tool = reply.content.find((b) => b.type === 'tool_use');
    console.log(`  streaming: first text after ${firstTextMs ?? 'n/a'} ms, total ${Math.round(performance.now() - t0)} ms`);
    console.log(`  tool calling: ${tool?.name === 'get_data_sources' ? 'OK (model called get_data_sources)' : `no tool call (stop_reason ${reply.stop_reason})`}`);
    console.log(`  usage: ${JSON.stringify(reply.usage)}`);
  } catch (e) {
    console.error(`${model}: ${describeClaudeError(e, model)}`);
    process.exitCode = 1;
  }
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
