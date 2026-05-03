import type { NextRequest } from 'next/server';

interface RateLimitEntry {
  timestamps: number[];
  windowMs: number;
}

type RateLimitResult = { allowed: true } | { allowed: false; retryAfterMs: number };

interface RateLimitStore {
  check(key: string, maxRequests: number, windowMs: number): Promise<RateLimitResult>;
}

const buckets = new Map<string, RateLimitEntry>();
const MAX_BUCKETS = 5000;
const CLEANUP_INTERVAL = 60_000;
let lastCleanup = Date.now();

function getUpstashConfig() {
  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  return url && token ? { url: url.replace(/\/+$/, ''), token } : null;
}

function cleanup() {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL) return;
  lastCleanup = now;
  for (const [key, entry] of buckets) {
    const cutoff = now - entry.windowMs;
    entry.timestamps = entry.timestamps.filter((t) => t > cutoff);
    if (entry.timestamps.length === 0) buckets.delete(key);
  }
  // Hard cap — evict oldest entries (FIFO) if map grows too large
  if (buckets.size > MAX_BUCKETS) {
    const excess = buckets.size - MAX_BUCKETS;
    const iter = buckets.keys();
    for (let i = 0; i < excess; i++) {
      const key = iter.next().value;
      if (key) buckets.delete(key);
    }
  }
}

const memoryStore: RateLimitStore = {
  async check(key, maxRequests, windowMs) {
    cleanup();

    const now = Date.now();
    const cutoff = now - windowMs;
    const entry = buckets.get(key) ?? { timestamps: [], windowMs };

    entry.timestamps = entry.timestamps.filter((t) => t > cutoff);
    entry.windowMs = windowMs;

    if (entry.timestamps.length >= maxRequests) {
      const oldest = entry.timestamps[0];
      return { allowed: false, retryAfterMs: oldest + windowMs - now };
    }

    entry.timestamps.push(now);
    buckets.set(key, entry);
    return { allowed: true };
  },
};

async function upstashCommand<T>(path: string): Promise<T> {
  const config = getUpstashConfig();
  if (!config) {
    throw new Error('Upstash config missing');
  }

  const response = await fetch(`${config.url}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.token}`,
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`Upstash rate limit request failed with ${response.status}`);
  }

  const json = await response.json() as { result?: T };
  return json.result as T;
}

const upstashStore: RateLimitStore = {
  async check(key, maxRequests, windowMs) {
    const encodedKey = encodeURIComponent(key);
    const count = await upstashCommand<number>(`/incr/${encodedKey}`);

    if (count === 1) {
      await upstashCommand<number>(`/pexpire/${encodedKey}/${windowMs}`);
    }

    if (count > maxRequests) {
      const ttl = await upstashCommand<number>(`/pttl/${encodedKey}`);
      return { allowed: false, retryAfterMs: ttl > 0 ? ttl : windowMs };
    }

    return { allowed: true };
  },
};

function getRateLimitStore(): RateLimitStore {
  return getUpstashConfig() ? upstashStore : memoryStore;
}

/**
 * Check rate limit for a given key (typically IP).
 * Returns { allowed: true } or { allowed: false, retryAfterMs }.
 */
export async function checkRateLimit(
  key: string,
  maxRequests: number,
  windowMs: number,
): Promise<RateLimitResult> {
  try {
    return await getRateLimitStore().check(key, maxRequests, windowMs);
  } catch (error) {
    console.error('[VibeCemetery] Shared rate limit failed, falling back to memory store:', error);
    return memoryStore.check(key, maxRequests, windowMs);
  }
}

export function __resetRateLimitStateForTests() {
  buckets.clear();
  lastCleanup = Date.now();
}

/**
 * Extract client IP from request.
 * Forwarding headers are only safe when the deployment proxy strips inbound spoofed values.
 */
export function getClientIp(req: NextRequest): string {
  // Vercel/runtime may set req.ip from the verified socket address.
  const reqIp = (req as unknown as { ip?: string }).ip;
  if (reqIp) return reqIp;

  const headers = req.headers;
  if (process.env.VERCEL === '1') {
    const xff = headers.get('x-forwarded-for');
    if (xff) {
      const parts = xff.split(',');
      return parts[parts.length - 1].trim();
    }
    return '0.0.0.0';
  }

  const trustProxyHeaders = /^(1|true)$/i.test(process.env.TRUST_PROXY_HEADERS?.trim() ?? '');
  if (!trustProxyHeaders) return '0.0.0.0';

  const cf = headers.get('cf-connecting-ip');
  if (cf) return cf;
  const xri = headers.get('x-real-ip');
  if (xri) return xri;
  const xff = headers.get('x-forwarded-for');
  if (xff) {
    const parts = xff.split(',');
    return parts[parts.length - 1].trim();
  }
  return '0.0.0.0';
}
