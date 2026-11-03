import type { ChatEvent, ChatProvider } from '../../../shared/api';

export interface ChatTurnInput {
  sessionId: string;
  message: string;
}

/** An agent streams ChatEvents for one user turn. Implementations: GeminiAgent, ClaudeAgent, DemoAgent. */
export interface ChatAgent {
  readonly provider: ChatProvider;
  readonly mode: 'ai' | 'demo';
  readonly model?: string;
  run(input: ChatTurnInput, emit: (event: ChatEvent) => void, signal: AbortSignal): Promise<void>;
}

/** Every configured agent, keyed by provider. Demo is always present; Gemini and Claude only with their key. */
export type ChatAgents = Map<ChatProvider, ChatAgent>;

export const CHAT_AGENTS = Symbol('CHAT_AGENTS');
