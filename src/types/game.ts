export interface GraveData {
  id: string;
  name: string;
  born_at: string | null;
  died_at: string | null;
  cause: string | null;
  epitaph: string | null;
  description: string | null;
  stack: string | null;
  github_url: string | null;
  github_repo_id: number | null;
  map_version?: 'v1' | 'v2';
  source?: 'github' | 'local';
  author_github: string | null;
  slot_id: number;
  tier: number;
  f_count?: number;
  last_commit_message?: string;
  grave_gid?: number | null;
}

export interface BuryResult {
  name: string;
  success: boolean;
  type: 'grave';
  grave?: GraveData;
  error?: string;
}

export interface DeadRepo {
  id: number;
  name: string;
  description: string | null;
  html_url: string;
  language: string | null;
  created_at: string;
  pushed_at: string;
}

export interface GitHubScanResult {
  dead_repos: DeadRepo[];
  total_repos: number;
  dead_count: number;
}
