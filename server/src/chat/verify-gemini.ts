/**
 * Verification: model availability, tool calling and streaming on the free tier, with as few requests as possible.
 *   npm run verify:gemini -- --list                     model metadata only (no generateContent request)
 *   npm run verify:gemini -- --model gemini-2.5-flash   1 small streamed request with a function declaration
 * Needs GEMINI_API_KEY in server/.env. The key is never printed.
 */
import { FunctionCallingConfigMode, GoogleGenAI, ThinkingLevel } from '@google/genai';
import { readEnv } from '../config/env';
import { classifyApiError, describeApiError, thinkingConfigFor } from './gemini-agent';

const arg = (name: string) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : undefined;
};

async function main(): Promise<void> {
  const env = readEnv();
  if (!env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is not set (server/.env). Create a free key at https://aistudio.google.com/apikey');
  const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
  const wanted = [env.GEMINI_MODEL, ...(env.GEMINI_FALLBACK_MODEL ? [env.GEMINI_FALLBACK_MODEL] : [])];

  if (process.argv.includes('--list')) {
    const found = new Map<string, string[]>();
    for await (const m of await ai.models.list()) {
      const id = m.name?.replace(/^models\//, '') ?? '';
      if (/flash/.test(id)) found.set(id, m.supportedActions ?? []);
    }
    for (const id of wanted) {
      const actions = found.get(id);
      console.log(`${id}: ${actions ? `available, actions: ${actions.join(', ')}` : 'NOT available to this key'}`);
    }
    console.log(`Other Flash models visible: ${[...found.keys()].filter((k) => !wanted.includes(k)).join(', ')}`);
    return;
  }

  const model = arg('--model') ?? env.GEMINI_MODEL;
  const thinkingConfig = thinkingConfigFor(model, ThinkingLevel[env.GEMINI_THINKING_LEVEL], env.GEMINI_THINKING_BUDGET);
  const t0 = performance.now();
  let firstChunkMs: number | null = null;
  let chunks = 0;
  let functionCall: string | null = null;
  let usage: unknown = null;
  try {
    const stream = await ai.models.generateContentStream({
      model,
      contents: 'Which data sources does this tool use? Call the tool.',
      config: {
        tools: [{ functionDeclarations: [{ name: 'get_data_sources', description: 'Lists the data sources.', parametersJsonSchema: { type: 'object', properties: {} } }] }],
        toolConfig: { functionCallingConfig: { mode: FunctionCallingConfigMode.AUTO } },
        ...(thinkingConfig ? { thinkingConfig } : {}),
      },
    });
    for await (const chunk of stream) {
      chunks++;
      firstChunkMs ??= Math.round(performance.now() - t0);
      functionCall ??= chunk.functionCalls?.[0]?.name ?? null;
      usage = chunk.usageMetadata ?? usage;
    }
  } catch (e) {
    const c = classifyApiError(e);
    console.error(`${model}: ${describeApiError(e, model)}${c.quota ? ` [quota: ${c.quota}${c.freeTier ? ', free tier' : ''}]` : ''}`);
    console.error(`  raw: ${(e instanceof Error ? e.message : String(e)).replace(/AIza[0-9A-Za-z_-]+/g, '[REDACTED]').slice(0, 600)}`);
    process.exitCode = 1;
    return;
  }
  console.log(`${model}: thinking ${JSON.stringify(thinkingConfig ?? null)}`);
  console.log(`  streaming: ${chunks} chunk(s), first after ${firstChunkMs} ms, total ${Math.round(performance.now() - t0)} ms`);
  console.log(`  tool calling: ${functionCall === 'get_data_sources' ? 'OK (model called get_data_sources)' : `no function call (${functionCall ?? 'none'})`}`);
  console.log(`  usage: ${JSON.stringify(usage)}`);
}

main().catch((e: unknown) => {
  console.error(describeApiError(e, readEnv().GEMINI_MODEL));
  process.exitCode = 1;
});
