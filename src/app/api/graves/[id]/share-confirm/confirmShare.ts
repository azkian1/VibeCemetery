const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type ConfirmFirstGraveShareResult =
  | { status: 'unlocked'; x_first_grave_shared_at: string }
  | { status: 'already_unlocked'; x_first_grave_shared_at: string }
  | { status: 'invalid_grave_id' }
  | { status: 'not_found' }
  | { status: 'forbidden' }

export interface ConfirmFirstGraveShareDb {
  loadGraveOwner: (graveId: string) => Promise<string | null>
  loadUserShareTimestamp: (username: string) => Promise<string | null>
  markUserSharedFirstGrave: (username: string, sharedAt: string) => Promise<string>
}

export async function confirmFirstGraveShare({
  graveId,
  username,
  db,
  now = () => new Date(),
}: {
  graveId: string
  username: string
  db: ConfirmFirstGraveShareDb
  now?: () => Date
}): Promise<ConfirmFirstGraveShareResult> {
  if (!UUID_RE.test(graveId)) {
    return { status: 'invalid_grave_id' }
  }

  const graveOwner = await db.loadGraveOwner(graveId)
  if (!graveOwner) {
    return { status: 'not_found' }
  }

  if (graveOwner !== username) {
    return { status: 'forbidden' }
  }

  const existingSharedAt = await db.loadUserShareTimestamp(username)
  if (existingSharedAt) {
    return { status: 'already_unlocked', x_first_grave_shared_at: existingSharedAt }
  }

  const sharedAt = now().toISOString()
  const savedSharedAt = await db.markUserSharedFirstGrave(username, sharedAt)

  return { status: 'unlocked', x_first_grave_shared_at: savedSharedAt }
}
