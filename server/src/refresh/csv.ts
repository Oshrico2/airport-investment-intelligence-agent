/**
 * RFC 4180 CSV parser (quoted fields, escaped quotes, CRLF/LF, UTF-8 BOM).
 * Returns objects keyed by the header row. BTS files end every line with a trailing comma,
 * which yields an empty unnamed last column; that column is dropped.
 */
export function parseCsv(text: string): Record<string, string>[] {
  const rows = parseRows(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);
  const header = rows.shift();
  if (!header) return [];
  return rows
    .filter((r) => !(r.length === 1 && r[0] === ''))
    .map((r) => {
      const o: Record<string, string> = {};
      header.forEach((h, i) => {
        if (h !== '') o[h] = r[i] ?? '';
      });
      return o;
    });
}

function parseRows(s: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"') {
        if (s[i + 1] === '"') { field += '"'; i++; }
        else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}
