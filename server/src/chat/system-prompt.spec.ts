import { DataService } from '../data/data.service';
import { systemInstruction } from './system-prompt';

process.env.LIVE_CHECK = 'off';

/** The acceptance review's wording findings are prompt rules; these pin them so they are not lost in an edit. */
describe('system instruction rules (acceptance review fixes)', () => {
  const text = systemInstruction(new DataService().index);

  it('asks for clarification instead of calling tools when the question lacks context', () => {
    expect(text).toMatch(/Ask before analysing .* call no tool and do not guess an analysis/);
    expect(text).toMatch(/Follow-ups that refer to an earlier answer in this conversation are not ambiguous/);
    expect(text).toMatch(/When there are no earlier messages in this conversation, nothing has been discussed yet/);
  });

  it('quotes tool values at their own precision and adds no outside framing or causes', () => {
    expect(text).toContain('with the same decimals (write 2.77%, not 2.8%)');
    expect(text).toMatch(/Do not describe how a figure is usually quoted, cited or reported elsewhere/);
    expect(text).toMatch(/do not state causes, motives or strategies .* unless a tool result states them/);
    expect(text).toMatch(/attribute each change to its own year/);
    expect(text).not.toMatch(/rounded no further than one decimal/);
  });
});
