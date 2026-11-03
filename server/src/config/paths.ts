import path from 'node:path';

// Every module lives one level under src/ (or dist/), so the repo's data/ is three levels up.
export const DATA_DIR = process.env.DATA_DIR ?? path.resolve(__dirname, '..', '..', '..', 'data');
export const SNAPSHOTS_DIR = path.join(DATA_DIR, 'snapshots');
export const RAW_DIR = path.join(DATA_DIR, 'raw');
