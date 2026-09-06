/**
 * Gravedigger dynamic phrase templates.
 *
 * Placeholders are filled with real data from the cemetery database.
 * Available variables (all optional — template is skipped if data is missing):
 *
 *   {name}           — project name
 *   {cause}          — cause of death
 *   {last_commit}    — last commit message
 *   {stack}          — primary language / framework
 *   {lifespan}       — human-readable lifespan ("3 days", "2 months")
 *   {stack_count}    — how many projects of this stack are buried
 */

export interface GravediggerTemplate {
  text: string;
  /** Which placeholders this template requires */
  requires: string[];
  /** Which cemetery record types may use this template */
  contexts?: Array<'grave'>;
}

// ── By project name ──

export const TEMPLATES_NAME: GravediggerTemplate[] = [
  { text: 'Just buried {name}. The soil is still warm.', requires: ['name'], contexts: ['grave'] },
  { text: '{name}. Heard of it? Me neither. But here it lies.', requires: ['name'], contexts: ['grave'] },
  { text: '{name} — another name on the wall.', requires: ['name'] },
  { text: 'Farewell, {name}. You were... a project.', requires: ['name'] },
  { text: '{name} has joined the others. Quiet now.', requires: ['name'] },
];

// ── By cause of death ──

export const TEMPLATES_CAUSE: GravediggerTemplate[] = [
  { text: '"{cause}" — heard that one before.', requires: ['cause'] },
  { text: 'Cause of death: {cause}. Classic.', requires: ['cause'] },
  { text: '{cause}. If I had a coin for every time...', requires: ['cause'] },
  { text: 'They all say "{cause}". The graves don\'t judge.', requires: ['cause'] },
  { text: '{cause}. Seen it. Buried it. Moving on.', requires: ['cause'] },
];

// ── By last commit message ──

export const TEMPLATES_LAST_COMMIT: GravediggerTemplate[] = [
  { text: '"{last_commit}" — famous last words.', requires: ['last_commit'] },
  { text: 'Last commit: "{last_commit}". Then silence.', requires: ['last_commit'] },
  { text: '"{last_commit}". And then — nothing.', requires: ['last_commit'] },
  { text: 'Final words: "{last_commit}". Poetic.', requires: ['last_commit'] },
  { text: '"{last_commit}" — the last thing it ever said.', requires: ['last_commit'] },
];

// ── By stack / language ──

export const TEMPLATES_STACK: GravediggerTemplate[] = [
  { text: 'Another {stack} project in the ground.', requires: ['stack'], contexts: ['grave'] },
  { text: '{stack}. Good choice. Didn\'t help.', requires: ['stack'] },
  { text: 'Written in {stack}. Buried in dirt. Same outcome.', requires: ['stack'], contexts: ['grave'] },
  { text: 'The {stack} section grows. {stack_count} and counting.', requires: ['stack', 'stack_count'] },
  { text: '{stack} won\'t save you. Nothing does.', requires: ['stack'] },
];

// ── By lifespan ──

export const TEMPLATES_LIFESPAN: GravediggerTemplate[] = [
  { text: '{name} lasted {lifespan}. Some mayflies live longer.', requires: ['name', 'lifespan'] },
  { text: '{lifespan}. That\'s all {name} got.', requires: ['name', 'lifespan'] },
  { text: 'Born. Lived {lifespan}. Died. The full story.', requires: ['lifespan'] },
  { text: '{lifespan} from first commit to last. Brief.', requires: ['lifespan'] },
  { text: '{name} — {lifespan} of life. I\'ve seen shorter.', requires: ['name', 'lifespan'] },
];

// ── Combined ──

export const TEMPLATES_COMBINED: GravediggerTemplate[] = [
  { text: '{name} — {cause}. Heard that before.', requires: ['name', 'cause'] },
  { text: '{name}. Last words: "{last_commit}".', requires: ['name', 'last_commit'] },
  { text: '{name} in {stack}. Lived {lifespan}. Gone.', requires: ['name', 'stack', 'lifespan'] },
  { text: '{name}. {cause}. No further comment.', requires: ['name', 'cause'] },
  { text: 'Another {stack} project. {cause}.', requires: ['stack', 'cause'] },
];

/** All template pools, flat */
export const ALL_TEMPLATES: GravediggerTemplate[] = [
  ...TEMPLATES_NAME,
  ...TEMPLATES_CAUSE,
  ...TEMPLATES_LAST_COMMIT,
  ...TEMPLATES_STACK,
  ...TEMPLATES_LIFESPAN,
  ...TEMPLATES_COMBINED,
];
