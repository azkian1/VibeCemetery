export const PENDING_BURIAL_CEREMONY_KEY = 'vibecemetery:pending-burial-ceremony';
export const PENDING_BURIAL_CEREMONY_TTL_MS = 120_000;

export interface PendingBurialCeremony {
  slot_id: number;
  id: string;
  name: string;
  chatText: string;
  gravediggerPhrase: string;
}

interface StoredPendingBurialCeremony extends PendingBurialCeremony {
  version: 1;
  createdAt: number;
  expiresAt: number;
}

function isPendingBurialCeremony(value: unknown): value is StoredPendingBurialCeremony {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<StoredPendingBurialCeremony>;
  return item.version === 1
    && typeof item.slot_id === 'number'
    && typeof item.id === 'string'
    && typeof item.name === 'string'
    && typeof item.chatText === 'string'
    && typeof item.gravediggerPhrase === 'string'
    && typeof item.createdAt === 'number'
    && typeof item.expiresAt === 'number';
}

function getStorage(): Storage | null {
  if (typeof globalThis.sessionStorage === 'undefined') return null;
  return globalThis.sessionStorage;
}

export function clearPendingBurialCeremony(): void {
  try {
    getStorage()?.removeItem(PENDING_BURIAL_CEREMONY_KEY);
  } catch {
    // Ignore unavailable storage.
  }
}

export function savePendingBurialCeremony(
  ceremony: PendingBurialCeremony,
  options: { now?: number; ttlMs?: number } = {},
): boolean {
  try {
    const storage = getStorage();
    if (!storage) return false;
    const now = options.now ?? Date.now();
    const ttlMs = options.ttlMs ?? PENDING_BURIAL_CEREMONY_TTL_MS;
    const stored: StoredPendingBurialCeremony = {
      ...ceremony,
      version: 1,
      createdAt: now,
      expiresAt: now + ttlMs,
    };
    storage.setItem(PENDING_BURIAL_CEREMONY_KEY, JSON.stringify(stored));
    return true;
  } catch {
    return false;
  }
}

export function readPendingBurialCeremony(options: { now?: number } = {}): PendingBurialCeremony | null {
  try {
    const storage = getStorage();
    if (!storage) return null;
    const raw = storage.getItem(PENDING_BURIAL_CEREMONY_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!isPendingBurialCeremony(parsed)) {
      storage.removeItem(PENDING_BURIAL_CEREMONY_KEY);
      return null;
    }
    if ((options.now ?? Date.now()) >= parsed.expiresAt) {
      storage.removeItem(PENDING_BURIAL_CEREMONY_KEY);
      return null;
    }
    const { slot_id, id, name, chatText, gravediggerPhrase } = parsed;
    return { slot_id, id, name, chatText, gravediggerPhrase };
  } catch {
    clearPendingBurialCeremony();
    return null;
  }
}

export function consumePendingBurialCeremony(options: { now?: number } = {}): PendingBurialCeremony | null {
  const ceremony = readPendingBurialCeremony(options);
  if (ceremony) clearPendingBurialCeremony();
  return ceremony;
}

export function hasPendingBurialCeremony(options: { now?: number } = {}): boolean {
  return readPendingBurialCeremony(options) !== null;
}
