import { useSyncExternalStore } from 'react';

const MOBILE_BREAKPOINT = 640;

function getSnapshot() {
  return window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`).matches;
}

// Match the server HTML during hydration; React then reads the browser snapshot.
function getServerSnapshot() { return false; }

function subscribe(onChange: () => void) {
  const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`);
  mql.addEventListener('change', onChange);
  return () => mql.removeEventListener('change', onChange);
}

export function useIsMobile() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
