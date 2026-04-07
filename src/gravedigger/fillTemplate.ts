import type { GraveData, CrematedData } from '@/types/game';
import { ALL_TEMPLATES } from './templates';
import type { GravediggerTemplate } from './templates';

/** Data bag for template placeholders */
interface TemplateData {
  name?: string;
  cause?: string;
  last_commit?: string;
  stack?: string;
  lifespan?: string;
  stack_count?: string;
}

type TemplateContext = 'grave' | 'cremated'

function hasNonAscii(value: string | null | undefined): boolean {
  return !!value && /[^\x00-\x7F]/.test(value);
}

function humanLifespan(bornAt: string | null, diedAt: string | null): string | undefined {
  if (!bornAt || !diedAt) return undefined;
  const ms = new Date(diedAt).getTime() - new Date(bornAt).getTime();
  if (isNaN(ms) || ms < 0) return undefined;
  const days = Math.floor(ms / 86400000);
  if (days === 0) return 'less than a day';
  if (days === 1) return '1 day';
  if (days < 30) return `${days} days`;
  const months = Math.floor(days / 30);
  if (months === 1) return '1 month';
  if (months < 12) return `${months} months`;
  const years = Math.floor(months / 12);
  if (years === 1) return '1 year';
  return `${years} years`;
}

/** Truncate string to max length, adding ellipsis if needed */
function truncate(s: string | null | undefined, max: number): string | undefined {
  if (!s) return undefined;
  const trimmed = s.trim();
  if (!trimmed) return undefined;
  if (hasNonAscii(trimmed)) return undefined;
  if (trimmed.length <= max) return trimmed;
  return trimmed.slice(0, max - 1) + '…';
}

function extractData(grave: GraveData): TemplateData {
  const stack = Array.isArray(grave.stack)
    ? (grave.stack as string[])[0]
    : typeof grave.stack === 'string' && grave.stack
      ? grave.stack
      : undefined;

  return {
    name: truncate(grave.name, 30),
    cause: truncate(grave.cause, 40),
    last_commit: truncate(grave.last_commit_message, 50),
    stack: truncate(stack, 20),
    lifespan: humanLifespan(grave.born_at, grave.died_at),
  };
}

function extractCrematedData(c: CrematedData): TemplateData {
  return {
    name: truncate(c.name, 30),
    cause: truncate(c.cause, 40),
    last_commit: truncate(c.last_commit_message, 50),
  };
}

function fill(template: string, data: TemplateData): string {
  return template.replace(/\{(\w+)\}/g, (match, key) => {
    const val = data[key as keyof TemplateData];
    return val ?? match;
  });
}

function filterTemplates(data: TemplateData, context: TemplateContext): GravediggerTemplate[] {
  return ALL_TEMPLATES.filter(t =>
    (t.contexts == null || t.contexts.includes(context)) &&
    t.requires.every(key => data[key as keyof TemplateData] != null)
  );
}

/**
 * Generate a dynamic phrase from a random grave or cremated project.
 * Returns null if no data or no matching templates.
 */
export function generateFromGrave(
  graves: Map<number, GraveData>,
  cremated: CrematedData[],
): string | null {
  const graveArr = Array.from(graves.values());
  const totalItems = graveArr.length + cremated.length;
  if (totalItems === 0) return null;

  // Pick a random source
  const idx = Math.floor(Math.random() * totalItems);
  let data: TemplateData;
  let context: TemplateContext;
  if (idx < graveArr.length) {
    data = extractData(graveArr[idx]);
    context = 'grave';
  } else {
    data = extractCrematedData(cremated[idx - graveArr.length]);
    context = 'cremated';
  }

  // Stack count (how many graves share this stack)
  if (data.stack) {
    const stackLower = data.stack.toLowerCase();
    let count = 0;
    for (const g of graveArr) {
      const gs = Array.isArray(g.stack) ? (g.stack as string[])[0] : g.stack;
      if (gs && gs.toLowerCase() === stackLower) count++;
    }
    if (count > 1) data.stack_count = String(count);
  }

  const candidates = filterTemplates(data, context);
  if (candidates.length === 0) return null;

  const template = candidates[Math.floor(Math.random() * candidates.length)];
  return fill(template.text, data);
}
