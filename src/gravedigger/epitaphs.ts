/**
 * Gravedigger epitaph generator.
 *
 * Short tombstone-style phrases (5-15 words) carved by the Gravedigger
 * at burial time. Stored in the `epitaph` field of each grave.
 *
 * Placeholders:
 *   {name}    — project name
 *   {cause}   — cause of death
 *   {stack}   — primary language/framework
 *   {days}    — lifespan in days
 */

interface EpitaphTemplate {
  text: string;
  requires: string[];
}

// ── Generic (no data needed) ──

const GENERIC: EpitaphTemplate[] = [
  { text: 'It compiled once. That was enough.', requires: [] },
  { text: 'Pushed to main. Pulled from life.', requires: [] },
  { text: 'Gone but not version-controlled.', requires: [] },
  { text: 'Here lies code no one will debug.', requires: [] },
  { text: 'The CI never turned green.', requires: [] },
  { text: 'Dead on arrival. No rollback.', requires: [] },
  { text: 'Merged to the great beyond.', requires: [] },
  { text: 'No tests. No regrets. No future.', requires: [] },
  { text: 'README was the only thing that worked.', requires: [] },
  { text: 'Died in development.', requires: [] },
  { text: 'It worked on my machine.', requires: [] },
  { text: 'Committed. Never deployed.', requires: [] },
  { text: 'Ship it, they said.', requires: [] },
  { text: 'Another dream in the node_modules.', requires: [] },
  { text: 'Built different. Broke the same.', requires: [] },
  { text: 'Too many dependencies. Too few users.', requires: [] },
  { text: 'The backlog outlived the project.', requires: [] },
  { text: 'Left on read by every recruiter.', requires: [] },
  { text: 'The sprint that never ended.', requires: [] },
  { text: 'Abandoned mid-refactor.', requires: [] },
];

// ── By name ──

const BY_NAME: EpitaphTemplate[] = [
  { text: '{name}. Born in hype. Buried in silence.', requires: ['name'] },
  { text: 'Here lies {name}. It tried.', requires: ['name'] },
  { text: '{name} — forever in alpha.', requires: ['name'] },
  { text: 'R.I.P. {name}. You were almost something.', requires: ['name'] },
  { text: '{name}. One star. Zero users.', requires: ['name'] },
];

// ── By cause ──

const BY_CAUSE: EpitaphTemplate[] = [
  { text: 'Cause of death: {cause}. As expected.', requires: ['cause'] },
  { text: '{cause}. A classic way to go.', requires: ['cause'] },
  { text: 'Killed by {cause}. No survivors.', requires: ['cause'] },
  { text: '{cause}. The autopsy was brief.', requires: ['cause'] },
];

// ── By stack ──

const BY_STACK: EpitaphTemplate[] = [
  { text: 'Written in {stack}. Buried in dirt.', requires: ['stack'] },
  { text: '{stack} giveth. {stack} taketh away.', requires: ['stack'] },
  { text: 'Another {stack} casualty.', requires: ['stack'] },
];

// ── By lifespan ──

const BY_DAYS: EpitaphTemplate[] = [
  { text: '{days} days. Not even a proper sprint.', requires: ['days'] },
  { text: 'Lived {days} days. Most mayflies do better.', requires: ['days'] },
  { text: '{name}: {days} days from init to grave.', requires: ['name', 'days'] },
];

// ── Combined ──

const COMBINED: EpitaphTemplate[] = [
  { text: '{name}. {cause}. That is all.', requires: ['name', 'cause'] },
  { text: '{name} in {stack}. {days} days. Gone.', requires: ['name', 'stack', 'days'] },
];

const ALL_EPITAPHS: EpitaphTemplate[] = [
  ...GENERIC,
  ...BY_NAME,
  ...BY_CAUSE,
  ...BY_STACK,
  ...BY_DAYS,
  ...COMBINED,
];

interface EpitaphData {
  name?: string;
  cause?: string;
  stack?: string;
  days?: string;
}

function fill(template: string, data: EpitaphData): string {
  return template.replace(/\{(\w+)\}/g, (match, key) => {
    const val = data[key as keyof EpitaphData];
    return val ?? match;
  });
}

/** Simple string hash → stable number for deterministic template selection */
function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function buildData(opts: {
  name: string;
  cause?: string | null;
  stack?: string[] | string | null;
  born_at?: string | null;
  died_at?: string | null;
}): EpitaphData {
  const data: EpitaphData = {};
  if (opts.name) data.name = opts.name.length > 25 ? opts.name.slice(0, 24) + '\u2026' : opts.name;
  if (opts.cause) data.cause = opts.cause.length > 35 ? opts.cause.slice(0, 34) + '\u2026' : opts.cause;
  const stack = Array.isArray(opts.stack) ? opts.stack[0] : opts.stack;
  if (stack) data.stack = stack;
  if (opts.born_at && opts.died_at) {
    const ms = new Date(opts.died_at).getTime() - new Date(opts.born_at).getTime();
    if (!isNaN(ms) && ms >= 0) {
      // ceil to match GraveModal header; min 1 so epitaph never says "0 days"
      data.days = String(Math.max(1, Math.ceil(ms / 86400000)));
    }
  }
  return data;
}

function pickAndFill(data: EpitaphData, seed?: string): string {
  const candidates = ALL_EPITAPHS.filter(t =>
    t.requires.every(key => data[key as keyof EpitaphData] != null)
  );
  if (candidates.length === 0) {
    const idx = seed ? hashCode(seed) % GENERIC.length : Math.floor(Math.random() * GENERIC.length);
    return GENERIC[idx].text;
  }
  const idx = seed ? hashCode(seed) % candidates.length : Math.floor(Math.random() * candidates.length);
  return fill(candidates[idx].text, data);
}

/**
 * Generate a tombstone epitaph from grave data.
 * Called at burial time (server-side), stored in the `epitaph` DB column.
 * Uses Math.random() — each call produces a different result.
 */
export function generateEpitaph(opts: {
  name: string;
  cause?: string | null;
  stack?: string[] | null;
  born_at?: string | null;
  died_at?: string | null;
}): string {
  return pickAndFill(buildData(opts));
}

/**
 * Deterministic epitaph fallback for existing graves without an epitaph.
 * Uses grave id as seed — same grave always gets the same epitaph.
 * Called client-side in GraveModal.
 */
export function epitaphFallback(grave: {
  id: string;
  name: string;
  cause?: string | null;
  stack?: string | null;
  born_at?: string | null;
  died_at?: string | null;
}): string {
  return pickAndFill(buildData({
    ...grave,
    stack: grave.stack ? [grave.stack] : null,
  }), grave.id);
}
