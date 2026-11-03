import Anthropic from '@anthropic-ai/sdk';
import type { ClaudeMessages } from '../chat/claude-agent';

const MODEL = 'claude-haiku-5-5';

type Reply = { content: Anthropic.ContentBlock[]; stop_reason?: Anthropic.StopReason; usage?: Partial<Anthropic.Usage> } | Error;
type Params = Parameters<ClaudeMessages['stream']>[0];

/** Scripted SDK: each request pops the next reply, streams its text as deltas, then resolves finalMessage(). */
export function fakeClaude(script: Reply[]): ClaudeMessages & { requests: Params[] } {
  const requests: Params[] = [];
  return {
    requests,
    stream(params: Params, options?: { signal?: AbortSignal }) {
      requests.push(structuredClone(params));
      const reply = script.shift();
      if (!reply) throw new Error('unexpected extra model request');
      const message = reply instanceof Error ? null : ({
        id: 'msg_test', type: 'message', role: 'assistant', model: MODEL, content: reply.content, stop_sequence: null,
        stop_reason: reply.stop_reason ?? (reply.content.some((b) => b.type === 'tool_use') ? 'tool_use' : 'end_turn'),
        usage: { input_tokens: 1, output_tokens: 1, ...reply.usage },
      } as unknown as Anthropic.Message);
      return {
        async *[Symbol.asyncIterator]() {
          if (options?.signal?.aborted) throw new Anthropic.APIUserAbortError();
          if (reply instanceof Error) throw reply;
          yield { type: 'message_start', message } as Anthropic.MessageStreamEvent;
          for (const [index, b] of reply.content.entries()) {
            if (b.type !== 'text') continue;
            const mid = Math.ceil(b.text.length / 2);
            for (const text of [b.text.slice(0, mid), b.text.slice(mid)]) yield { type: 'content_block_delta', index, delta: { type: 'text_delta', text } } as Anthropic.MessageStreamEvent;
          }
        },
        finalMessage: async () => message!,
      } as unknown as ReturnType<ClaudeMessages['stream']>;
    },
  };
}

export const text = (t: string) => ({ type: 'text', text: t, citations: null }) as Anthropic.TextBlock;
export const use = (name: string, input: Record<string, unknown>, id = `toolu_${name}`) => ({ type: 'tool_use', id, name, input }) as Anthropic.ToolUseBlock;

