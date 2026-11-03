import { fetchBuffer, fetchWithTimeout } from './http';
import { readZip } from './zip';
import { parseCsv } from './csv';

const TRANSTATS = 'https://www.transtats.bts.gov';

/** TranStats table ids: FMG = T-100 Segment (All Carriers). */
export const FMG_URL = `${TRANSTATS}/DL_SelectFields.aspx?gnoyr_VQ=FMG&QO_fu146_anzr=Nv4%20Pn44vr45`;

export interface CsvDownload {
  rows: Record<string, string>[];
  raw: Buffer;
  url: string;
  params: Record<string, string>;
}

/**
 * Download a T-100 table through the ASP.NET form (DATA_SOURCES §2): GET the page for its hidden
 * state and session cookie, then POST it back with the filters and one checkbox per field.
 */
export async function downloadTransStatsTable(
  url: string,
  filters: { geography: string; year: number; period: 'All' | number },
  fields: readonly string[],
): Promise<CsvDownload> {
  const page = await fetchWithTimeout(url, {}, 60_000);
  const cookie = page.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
  const html = await page.text();
  const form = new URLSearchParams();
  for (const [, name, value] of html.matchAll(/<input[^>]*type="hidden"[^>]*name="([^"]+)"[^>]*value="([^"]*)"/g)) {
    if (name && value !== undefined) form.set(name, value);
  }
  if (!form.has('__VIEWSTATE')) throw new Error('TranStats form changed: __VIEWSTATE not found');
  const params = {
    cboGeography: filters.geography,
    cboYear: String(filters.year),
    cboPeriod: String(filters.period),
  };
  for (const [k, v] of Object.entries(params)) form.set(k, v);
  form.set('chkDownloadZip', 'on');
  form.set('btnDownload', 'Download');
  for (const f of fields) form.set(f, 'on');
  const raw = await fetchBuffer(
    url,
    { method: 'POST', body: form, headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' } },
    900_000,
  );
  const files = readZip(raw);
  const csvName = [...files.keys()].find((n) => n.startsWith('T_') && n.endsWith('.csv'));
  if (!csvName) throw new Error(`TranStats ZIP has no data CSV (entries: ${[...files.keys()].join(', ')})`);
  return { rows: parseCsv(files.get(csvName)!.toString('utf8')), raw, url, params };
}

/**
 * Delay Causes raw download (DATA_SOURCES §3). The query string is letter-substituted text for
 * `where YearMonth between FROM and TO`, with YearMonth = year*12+month and digits 0->D … 9->M.
 * The encoding was reverse-engineered and verified on 2026-11-03; BTS does not document it.
 */
export function encodeYearMonth(year: number, month: number): string {
  return String(year * 12 + month)
    .split('')
    .map((d) => String.fromCharCode('D'.charCodeAt(0) + Number(d)))
    .join('');
}

export function delayCausesUrl(from: { year: number; month: number }, to: { year: number; month: number }): string {
  const q = `9ur4r Brn4z106u or69rr0 ${encodeYearMonth(from.year, from.month)} NaQ ${encodeYearMonth(to.year, to.month)}`;
  return `${TRANSTATS}/OT_Delay/ot_delaycause1_DL.aspx?8n4=${encodeURIComponent(q)}`;
}

export async function downloadDelayCauses(
  from: { year: number; month: number },
  to: { year: number; month: number },
): Promise<CsvDownload> {
  const url = delayCausesUrl(from, to);
  const raw = await fetchBuffer(url, {}, 300_000);
  const csv = readZip(raw).get('Airline_Delay_Cause.csv');
  if (!csv) throw new Error('Delay Causes ZIP has no Airline_Delay_Cause.csv');
  return { rows: parseCsv(csv.toString('utf8')), raw, url, params: { from: `${from.year}-${from.month}`, to: `${to.year}-${to.month}` } };
}

/** Lookup tables, e.g. L_AIRPORT_ID = Y_NVecbeg_VQ (case-sensitive; copied from TranStats links). */
export async function downloadLookup(code: string): Promise<CsvDownload> {
  const url = `${TRANSTATS}/Download_Lookup.asp?Y11x72=${code}`;
  const raw = await fetchBuffer(url, {}, 60_000);
  const text = raw.toString('utf8');
  if (!text.startsWith('Code,Description')) throw new Error(`Lookup ${code} did not return CSV`);
  return { rows: parseCsv(text), raw, url, params: { Y11x72: code } };
}
