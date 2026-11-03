import { useSyncExternalStore } from 'react';

/** Live `matchMedia` result. `serverDefault` is used without a window (tests, SSR). */
export function useMediaQuery(query: string, serverDefault = true): boolean {
  return useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia?.(query);
      m?.addEventListener('change', cb);
      return () => m?.removeEventListener('change', cb);
    },
    () => window.matchMedia?.(query).matches ?? serverDefault,
    () => serverDefault,
  );
}
