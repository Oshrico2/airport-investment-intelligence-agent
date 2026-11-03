import { parseCsv } from './csv';

describe('parseCsv', () => {
  it('handles quotes, escaped quotes, CRLF, BOM and the BTS trailing comma', () => {
    const text = '﻿a,b,\r\n"x, y","say ""hi""",\r\n1,,\r\n';
    expect(parseCsv(text)).toEqual([
      { a: 'x, y', b: 'say "hi"' },
      { a: '1', b: '' },
    ]);
  });

  it('keeps a final line without newline and ignores blank lines', () => {
    expect(parseCsv('a,b\n1,2\n\n3,4')).toEqual([{ a: '1', b: '2' }, { a: '3', b: '4' }]);
  });

  it('returns no rows for empty input', () => {
    expect(parseCsv('')).toEqual([]);
  });
});
