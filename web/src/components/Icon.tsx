/** Authored icon set: 20px grid, 1.5px stroke, round caps (craft floor: one consistent drawn system). */
const PATHS = {
  send: 'M4 10h11M11 5l5 5-5 5',
  stop: 'M6 6h8v8H6z',
  plus: 'M10 4v12M4 10h12',
  board: 'M3 5h14M3 10h14M3 15h14M7 3v14',
  ask: 'M4 5.5A2.5 2.5 0 0 1 6.5 3h7A2.5 2.5 0 0 1 16 5.5v5a2.5 2.5 0 0 1-2.5 2.5H9l-4 3v-3.2A2.5 2.5 0 0 1 4 10.5z',
  method: 'M10 3v14M5 7l5-4 5 4M5 13l5 4 5-4',
  check: 'M4.5 10.5l3.5 3.5 7.5-8',
  warn: 'M10 3.5l7 12.5H3zM10 8.5v3.5M10 14.4v.1',
  info: 'M10 17a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM10 9v4.5M10 6.4v.1',
  close: 'M5 5l10 10M15 5L5 15',
  up: 'M10 15V5M5.5 9.5L10 5l4.5 4.5',
  down: 'M10 5v10M5.5 10.5L10 15l4.5-4.5',
  source: 'M5 3h7l3 3v11H5zM12 3v3h3M8 10h4M8 13h4',
  chevron: 'M8 5l5 5-5 5',
  sort: 'M7 8l3-3 3 3M7 12l3 3 3-3',
  plane: 'M2.5 11.5l15-6-4 11-3.2-4.3zM10.3 12.2L17.5 5.5',
  mic: 'M10 3a2.5 2.5 0 0 1 2.5 2.5v4a2.5 2.5 0 0 1-5 0v-4A2.5 2.5 0 0 1 10 3zM5.5 9.5a4.5 4.5 0 0 0 9 0M10 14v3M7.5 17h5',
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 18, label }: { name: IconName; size?: number; label?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={label ? undefined : true}
      role={label ? 'img' : undefined}
      aria-label={label}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
