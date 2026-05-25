import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import { sanitizePublicText } from '@/lib/sanitize-public-text';

// 20 requests per minute per IP
const COMMIT_RATE_LIMIT = 20;
const COMMIT_WINDOW_MS = 60_000;

export function canReadLastCommitForOwner(owner: string, authenticatedUsername: string): boolean {
  return owner.trim().toLowerCase() === authenticatedUsername.trim().toLowerCase();
}

export function normalizeLastCommitMessage(value: unknown): string | null {
  if (typeof value !== 'string') return null;

  return sanitizePublicText(value, 500) || null;
}

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.github_username) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const ip = getClientIp(request);
  const rl = await checkRateLimit(`commit:${ip}`, COMMIT_RATE_LIMIT, COMMIT_WINDOW_MS);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Too many requests. Please try again later.' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil(rl.retryAfterMs / 1000)) } },
    );
  }

  const owner = request.nextUrl.searchParams.get('owner');
  const repo = request.nextUrl.searchParams.get('repo');

  if (!owner || !repo) {
    return NextResponse.json(
      { error: 'Missing required query parameters: owner, repo' },
      { status: 400 },
    );
  }

  if (!canReadLastCommitForOwner(owner, session.user.github_username)) {
    return NextResponse.json({ message: null }, { status: 404 });
  }

  const headers: Record<string, string> = {
    'User-Agent': 'vibecemetery-app',
    Accept: 'application/vnd.github.v3+json',
  };

  if (process.env.GITHUB_TOKEN) {
    headers['Authorization'] = `Bearer ${process.env.GITHUB_TOKEN}`;
  }

  try {
    const res = await fetch(
      `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/commits?per_page=1`,
      { headers, signal: AbortSignal.timeout(10_000) },
    );

    if (!res.ok) {
      return NextResponse.json({ message: null });
    }

    const commits = await res.json();
    const message = normalizeLastCommitMessage(commits?.[0]?.commit?.message);

    return NextResponse.json({ message });
  } catch {
    return NextResponse.json({ message: null });
  }
}
