import { readEnv } from './env';
import { createChatAgents, providerInfo } from '../chat/agent.factory';
import { ClaudeAgent } from '../chat/claude-agent';
import { DemoAgent } from '../chat/demo-agent';
import { GeminiAgent } from '../chat/gemini-agent';
import { DataService } from '../data/data.service';

process.env.LIVE_CHECK = 'off';
const data = new DataService();

describe('Gemini configuration', () => {
  it('defaults to 3.5 Flash-Lite primary and 3.8 Flash fallback with separate guards', () => {
    expect(readEnv({})).toMatchObject({
      GEMINI_MODEL: 'gemini-3.5-flash-lite', GEMINI_FALLBACK_MODEL: 'gemini-3.8-flash',
      GEMINI_RPM: 10, GEMINI_RPD: 20, GEMINI_FALLBACK_RPM: 5, GEMINI_FALLBACK_RPD: 20, GEMINI_FIRST_CHUNK_TIMEOUT_MS: 25000, GEMINI_FALLBACK_FIRST_CHUNK_TIMEOUT_MS: 10000,
    });
  });

  it('an empty GEMINI_FALLBACK_MODEL disables the fallback', () => {
    expect(readEnv({ GEMINI_FALLBACK_MODEL: '' }).GEMINI_FALLBACK_MODEL).toBeUndefined();
  });

  it('the agent tries the primary first, then the fallback, each with its own quota (no network call)', () => {
    const agents = createChatAgents(data, readEnv({ GEMINI_API_KEY: 'test-key-not-real', GEMINI_RPM: '10', GEMINI_FALLBACK_RPM: '5' }));
    const agent = agents.get('gemini');
    expect(agent).toBeInstanceOf(GeminiAgent);
    expect((agent as GeminiAgent).quotaStatus()).toEqual([
      { model: 'gemini-3.5-flash-lite', usedToday: 0, rpm: 10, rpd: 20 },
      { model: 'gemini-3.8-flash', usedToday: 0, rpm: 5, rpd: 20 },
    ]);
  });
});

describe('providers', () => {
  it('Claude defaults to Haiku 5.5, and the model and retries are configurable', () => {
    expect(readEnv({})).toMatchObject({ ANTHROPIC_MODEL: 'claude-haiku-5-5', ANTHROPIC_TIMEOUT_MS: 60000, ANTHROPIC_MAX_RETRIES: 2 });
    expect(readEnv({ ANTHROPIC_MAX_RETRIES: '0' }).ANTHROPIC_MAX_RETRIES).toBe(0);
    expect(readEnv({}).DEMO_PACE_MS).toBe(1500);
    expect(readEnv({ DEMO_PACE_MS: '0' }).DEMO_PACE_MS).toBe(0);
    expect(() => readEnv({ ANTHROPIC_MAX_RETRIES: '-1' })).toThrow();
    expect(readEnv({ ANTHROPIC_API_KEY: '  ' }).ANTHROPIC_API_KEY).toBeUndefined();
    const agents = createChatAgents(data, readEnv({ ANTHROPIC_API_KEY: 'test-key-not-real', ANTHROPIC_MODEL: 'claude-sonnet-5' }));
    expect(agents.get('claude')).toBeInstanceOf(ClaudeAgent);
    expect(agents.get('claude')?.model).toBe('claude-sonnet-5');
  });

  it('enables each provider only with its key; Demo is always there; Claude is the default, then Gemini, then Demo', () => {
    const none = createChatAgents(data, readEnv({}));
    expect([...none.keys()]).toEqual(['demo']);
    expect(none.get('demo')).toBeInstanceOf(DemoAgent);
    expect(providerInfo(none)).toEqual({
      default: 'demo',
      providers: [
        { id: 'claude', label: 'Claude', available: false, reason: 'Set ANTHROPIC_API_KEY in server/.env' },
        { id: 'gemini', label: 'Gemini', available: false, reason: 'Set GEMINI_API_KEY in server/.env' },
        { id: 'demo', label: 'Demo', available: true },
      ],
    });
    expect(providerInfo(createChatAgents(data, readEnv({ ANTHROPIC_API_KEY: 'k' }))).default).toBe('claude');
    const both = providerInfo(createChatAgents(data, readEnv({ ANTHROPIC_API_KEY: 'k', GEMINI_API_KEY: 'k' })));
    expect(both.default).toBe('claude'); // Claude preselected when its key is set
    expect(both.providers.map((p) => [p.id, p.available, p.model])).toEqual([['claude', true, 'claude-haiku-5-5'], ['gemini', true, 'gemini-3.5-flash-lite'], ['demo', true, undefined]]);
    expect(providerInfo(createChatAgents(data, readEnv({ GEMINI_API_KEY: 'k' }))).default).toBe('gemini'); // no Claude key: Gemini
    expect(JSON.stringify(both)).not.toContain('"k"'); // keys never leave the server
  });
});
