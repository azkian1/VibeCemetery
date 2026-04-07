import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

interface GitHubRepo {
  id: number;
  name: string;
  description: string | null;
  html_url: string;
  language: string | null;
  created_at: string;
  pushed_at: string;
  fork: boolean;
}

interface DeadRepo {
  id: number;
  name: string;
  description: string | null;
  html_url: string;
  language: string | null;
  created_at: string;
  pushed_at: string;
}

interface CachedScan {
  data: { dead_repos: DeadRepo[]; total_repos: number; dead_count: number };
  expiresAt: number;
}

const scanCache = new Map<string, CachedScan>();
const CACHE_TTL = 24 * 60 * 60 * 1000;
const MAX_CACHE_SIZE = 500;

function ghHeaders(): Record<string, string> {
  return {
    "User-Agent": "vibecemetery-app",
    Accept: "application/vnd.github.v3+json",
    ...(process.env.GITHUB_TOKEN
      ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` }
      : {}),
  };
}

// 10 requests per minute per IP
const SCAN_RATE_LIMIT = 10;
const SCAN_WINDOW_MS = 60_000;

export async function GET(request: NextRequest) {
  /* ── Auth: only logged-in user can scan, and only their own GitHub ── */
  const session = await getServerSession(authOptions);
  if (!session?.user?.github_username) {
    return NextResponse.json(
      { error: "Sign in with GitHub first" },
      { status: 401 },
    );
  }

  const ip = getClientIp(request);
  const rl = await checkRateLimit(`scan:${ip}`, SCAN_RATE_LIMIT, SCAN_WINDOW_MS);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429, headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) } },
    );
  }

  const rawUsername = request.nextUrl.searchParams.get("username");
  const forceRefresh = request.nextUrl.searchParams.get("refresh") === "1";

  if (!rawUsername) {
    return NextResponse.json(
      { error: "Missing required query parameter: username" },
      { status: 400 }
    );
  }

  // GitHub usernames are case-insensitive — normalize for cache/rate-limit
  const username = rawUsername.trim().toLowerCase();

  /* ── Only allow scanning your own GitHub ── */
  if (username !== session.user.github_username.toLowerCase()) {
    return NextResponse.json(
      { error: "You can only scan your own GitHub" },
      { status: 403 },
    );
  }

  const cached = scanCache.get(username);
  if (!forceRefresh && cached) {
    if (Date.now() < cached.expiresAt) {
      return NextResponse.json(cached.data);
    }
    scanCache.delete(username);
  }

  const allRepos: GitHubRepo[] = [];

  for (let page = 1; page <= 3; page++) {
    const url = `https://api.github.com/users/${encodeURIComponent(username)}/repos?per_page=100&sort=updated&page=${page}`;

    let response: Response;
    try {
      response = await fetch(url, { headers: ghHeaders(), signal: AbortSignal.timeout(15000) });
    } catch {
      return NextResponse.json(
        { error: "Failed to connect to GitHub API" },
        { status: 502 }
      );
    }

    if (response.status === 404) {
      return NextResponse.json(
        { error: `GitHub user "${username}" not found` },
        { status: 404 }
      );
    }

    if (response.status === 403 || response.status === 429) {
      return NextResponse.json(
        { error: "GitHub API rate limit exceeded. Please try again later." },
        { status: 429 }
      );
    }

    if (!response.ok) {
      return NextResponse.json(
        { error: "Failed to fetch GitHub data. Please try again later." },
        { status: 502 }
      );
    }

    const repos: GitHubRepo[] = await response.json();
    allRepos.push(...repos);

    if (repos.length < 100) break;
  }

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - 14);

  const nonForkRepos = allRepos.filter((repo) => !repo.fork);

  const deadRepos = nonForkRepos
    .filter((repo) => new Date(repo.pushed_at) < cutoffDate)
    .map((repo) => ({
      id: repo.id,
      name: repo.name,
      description: repo.description,
      html_url: repo.html_url,
      language: repo.language,
      created_at: repo.created_at,
      pushed_at: repo.pushed_at,
    }));

  const result = {
    dead_repos: deadRepos,
    total_repos: nonForkRepos.length,
    dead_count: deadRepos.length,
  };

  if (scanCache.size >= MAX_CACHE_SIZE) {
    const oldestKey = scanCache.keys().next().value;
    if (oldestKey) scanCache.delete(oldestKey);
  }
  scanCache.set(username, { data: result, expiresAt: Date.now() + CACHE_TTL });

  return NextResponse.json(result);
}
