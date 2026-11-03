import { readFileSync } from 'node:fs';
import path from 'node:path';
import { readZip } from './zip';
import { parseCsv } from './csv';

const fixture = (n: string) => readFileSync(path.join(__dirname, '__fixtures__', n));

describe('readZip', () => {
  it('reads deflated and stored entries', () => {
    const files = readZip(fixture('sample.zip'));
    expect([...files.keys()]).toEqual(['T_SAMPLE.csv', 'notes.txt']);
    expect(files.get('notes.txt')?.toString()).toBe('stored entry');
    expect(readZip(fixture('stored.zip')).get('a.txt')?.toString()).toBe('plain');
  });

  it('rejects non-zip input', () => {
    expect(() => readZip(Buffer.from('<html>error page</html>'))).toThrow(/Not a ZIP/);
  });

  it('feeds the CSV parser end to end', () => {
    const rows = parseCsv(readZip(fixture('sample.zip')).get('T_SAMPLE.csv')!.toString());
    expect(rows).toEqual([
      { ORIGIN: 'BOS', CITY: 'Boston, MA', PASSENGERS: '12.00' },
      { ORIGIN: 'PVD', CITY: 'Providence, RI', PASSENGERS: '3.00' },
    ]);
  });
});
