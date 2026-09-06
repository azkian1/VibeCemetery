// Never expose local project identity hashes through public read/write responses.
export const PUBLIC_GRAVE_FIELDS = 'id,name,born_at,died_at,cause,epitaph,description,stack,github_url,github_repo_id,author_github,slot_id,tier,f_count,last_commit_message,grave_gid,map_version,created_at,source'
export function publicGrave<T extends Record<string, unknown>>(grave: T) {
  return Object.fromEntries(PUBLIC_GRAVE_FIELDS.split(',').filter(key => Object.hasOwn(grave, key)).map(key => [key, grave[key]]))
}
