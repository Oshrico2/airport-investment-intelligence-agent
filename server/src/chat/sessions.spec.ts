import type { Content } from '@google/genai';
import { MemorySessionStore } from './sessions';

const texts = (items: Content[]) => items.map((c) => c.parts?.[0]?.text);

describe('MemorySessionStore', () => {
  it('keeps the latest 8 turns and expires idle sessions after an hour', async () => {
    let now = 0;
    const store = new MemorySessionStore<Content>(() => now);
    for (let i = 0; i < 10; i++) await store.append('s', [{ role: 'user', parts: [{ text: `q${i}` }] }]);
    const s = await store.load('s');
    expect(texts(s.items)).toEqual(['q2', 'q3', 'q4', 'q5', 'q6', 'q7', 'q8', 'q9']);
    expect(s.trimmed).toBe(true);
    const short = new MemorySessionStore<Content>(() => now);
    for (let i = 0; i < 8; i++) await short.append('t', [{ role: 'user', parts: [{ text: `q${i}` }] }]);
    expect((await short.load('t')).trimmed).toBe(false); // exactly 8 turns: nothing dropped yet
    now = 61 * 60_000;
    expect(await store.load('s')).toEqual({ items: [], trimmed: false });
    expect((await store.load('unknown')).items).toEqual([]);
  });
});
