import { NextResponse } from 'next/server'
import { supabaseAdmin } from './supabase'

export interface CremationWrite {
  author: string
  name: string
  cause: string
  source: 'github' | 'skill'
  projectKey: string | null
  githubUrl: string | null
  githubRepoId: number | null
  lastCommitMessage: string | null
}

type CremationRpc = (name: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }>

export async function writeCremation(
  input: CremationWrite,
  rpc: CremationRpc = (name, args) => supabaseAdmin.rpc(name, args),
) {
  const { data, error } = await rpc('create_cremation_once', {
    p_author_github: input.author,
    p_name: input.name,
    p_cause: input.cause,
    p_source: input.source,
    p_project_key: input.projectKey,
    p_github_url: input.githubUrl,
    p_github_repo_id: input.githubRepoId,
    p_last_commit_message: input.lastCommitMessage,
  })
  // Fail closed if the migration is missing; never fall back to an unguarded insert.
  if (error || !data || typeof data !== 'object') {
    return NextResponse.json({ error: 'Failed to create cremation', code: 'CREMATION_UNAVAILABLE' }, { status: 503 })
  }
  const result = data as { status?: string; record?: Record<string, unknown>; retry_after_seconds?: number }
  if (result.status === 'rate_limited') {
    return NextResponse.json(
      { error: 'Maximum 3 cremations per UTC day after the first 50.', code: 'DAILY_LIMIT' },
      { status: 429, headers: { 'Retry-After': String(Math.max(1, result.retry_after_seconds ?? 60)) } },
    )
  }
  if ((result.status === 'created' || result.status === 'existing') && result.record?.id != null) {
    return NextResponse.json(result.record, { status: result.status === 'created' ? 201 : 200 })
  }
  return NextResponse.json({ error: 'Invalid cremation result', code: 'CREMATION_UNAVAILABLE' }, { status: 503 })
}
