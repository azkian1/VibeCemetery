import type { RenderGraveData } from './events';

export interface GraveReconciliationPlan {
  remove: number[];
  render: RenderGraveData[];
}

export function isSameRenderedGrave(
  current: RenderGraveData,
  next: RenderGraveData,
): boolean {
  return current.id === next.id
    && current.name === next.name
    && current.grave_gid === next.grave_gid;
}

/**
 * Plans the minimum scene operations needed to make rendered graves match a
 * React snapshot. A non-authoritative snapshot may add or refresh entries,
 * but cannot remove entries that may still be loading. Protected slots are
 * owned by an in-flight burial ceremony until that ceremony completes.
 */
export function planGraveReconciliation(
  rendered: ReadonlyMap<number, RenderGraveData>,
  desired: ReadonlyMap<number, RenderGraveData>,
  protectedSlotIds: Iterable<number>,
  allowRemovals: boolean,
): GraveReconciliationPlan {
  const protectedSlots = new Set(protectedSlotIds);
  const remove: number[] = [];
  const render: RenderGraveData[] = [];

  for (const [slotId, current] of rendered) {
    if (protectedSlots.has(slotId)) continue;

    const next = desired.get(slotId);
    if (!next) {
      if (allowRemovals) remove.push(slotId);
      continue;
    }

    if (!isSameRenderedGrave(current, next)) {
      remove.push(slotId);
      render.push(next);
    }
  }

  for (const [slotId, grave] of desired) {
    if (protectedSlots.has(slotId) || rendered.has(slotId)) continue;
    render.push(grave);
  }

  return { remove, render };
}
