import { writeFile, rename } from 'node:fs/promises';

export async function atomicJson(path: string, data: unknown) {
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, JSON.stringify(data, null, 2) + '\n', { mode: 0o600 });
  await rename(temporary, path);
}

// Coalesce concurrent callers and never overlap writes to the same temporary file.
export function checkpointWriter(write: () => Promise<void>) {
  let pending: Promise<void> | undefined, dirty = false;
  return () => {
    dirty = true;
    if (!pending) pending = (async () => {
      while (dirty) { dirty = false; await write(); }
    })().finally(() => { pending = undefined; });
    return pending;
  };
}
