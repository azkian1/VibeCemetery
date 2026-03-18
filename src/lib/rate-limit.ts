/**
 * Simple in-memory sliding-window rate limiter.
 * Not shared across serverless instances — good enough for single-instance
 * dev/preview and provides baseline protection in production.
 * For strict enforcement at scale, use Redis (e.g. Upstash).
 */

import type { NextRequest } from 'next/server';

interface RateLimitEntry {
  timestamps: number[];
  windowMs: number;
}

const buckets = new Map<string, RateLimitEntry>();
const MAX_BUCKETS = 5000;
const CLEANUP_INTERVAL = 60_000;
let lastCleanup = Date.now();

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

/**
 * Check rate limit for a given key (typically IP).
 * Returns { allowed: true } or { allowed: false, retryAfterMs }.
 */
export function checkRateLimit(
  key: string,
  maxRequests: number,
  windowMs: number,
): { allowed: true } | { allowed: false; retryAfterMs: number } {
  cleanup();

  const now = Date.now();
  const cutoff = now - windowMs;
  const entry = buckets.get(key) ?? { timestamps: [], windowMs };

  // Drop expired timestamps
  entry.timestamps = entry.timestamps.filter((t) => t > cutoff);
  entry.windowMs = windowMs;

  if (entry.timestamps.length >= maxRequests) {
    const oldest = entry.timestamps[0];
    return { allowed: false, retryAfterMs: oldest + windowMs - now };
  }

  entry.timestamps.push(now);
  buckets.set(key, entry);
  return { allowed: true };
}

/**
 * Extract client IP from request.
 * Priority: Vercel req.ip → cf-connecting-ip → x-real-ip → x-forwarded-for (rightmost) → fallback.
 * Rightmost x-forwarded-for is used because the trusted proxy appends it last.
 */
export function getClientIp(req: NextRequest): string {
  // Vercel runtime may set req.ip from the verified socket address
  const reqIp = (req as unknown as { ip?: string }).ip;
  if (reqIp) return reqIp;
  const headers = req.headers;
  // Cloudflare sets this from verified connection
  const cf = headers.get('cf-connecting-ip');
  if (cf) return cf;
  // Trusted reverse proxy header
  const xri = headers.get('x-real-ip');
  if (xri) return xri;
  // x-forwarded-for — rightmost entry is from the trusted proxy
  const xff = headers.get('x-forwarded-for');
  if (xff) {
    const parts = xff.split(',');
    return parts[parts.length - 1].trim();
  }
  return '0.0.0.0';
}
