import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import type { RenderGraveData } from '../src/game/events'
import { planGraveReconciliation } from '../src/game/graveReconciliation'
import { clearRenderedGrave, pickTileVariant } from '../src/game/utils/tileRegistry'

function grave(overrides: Partial<RenderGraveData> = {}): RenderGraveData {
  return {
    slot_id: 1,
    id: 'grave-1',
    name: 'Original project',
    grave_gid: null,
    ...overrides,
  }
}

test.describe('grave reconciliation', () => {
  test('adds new graves and removes graves absent from an authoritative snapshot', () => {
    const rendered = new Map([
      [1, grave({ slot_id: 1 })],
      [2, grave({ slot_id: 2, id: 'grave-2' })],
    ])
    const added = grave({ slot_id: 3, id: 'grave-3', name: 'Fresh project' })
    const desired = new Map([
      [2, grave({ slot_id: 2, id: 'grave-2' })],
      [3, added],
    ])

    expect(planGraveReconciliation(rendered, desired, [], true)).toEqual({
      remove: [1],
      render: [added],
    })
  })

  test('replaces an existing sprite or tile when its render data changes', () => {
    const oldGrave = grave({ slot_id: 8, id: 'grave-old', grave_gid: 101 })
    const replacement = grave({ slot_id: 8, id: 'grave-new', name: 'Renamed project', grave_gid: 202 })

    expect(planGraveReconciliation(
      new Map([[8, oldGrave]]),
      new Map([[8, replacement]]),
      [],
      true,
    )).toEqual({
      remove: [8],
      render: [replacement],
    })
  })

  test('leaves an in-flight ceremony slot untouched until the ceremony releases it', () => {
    const ceremonyGrave = grave({ slot_id: 11, id: 'ceremony-grave' })
    const laterGrave = grave({ slot_id: 12, id: 'later-grave' })

    expect(planGraveReconciliation(
      new Map([[11, ceremonyGrave]]),
      new Map([[12, laterGrave]]),
      [11, 12],
      true,
    )).toEqual({ remove: [], render: [] })
  })

  test('does not delete graves while the React snapshot is still loading', () => {
    const existing = grave({ slot_id: 21 })
    const incoming = grave({ slot_id: 22, id: 'incoming' })

    expect(planGraveReconciliation(
      new Map([[21, existing]]),
      new Map([[22, incoming]]),
      [],
      false,
    )).toEqual({ remove: [], render: [incoming] })
  })

  test('clears every dynamic tile occupied by a removed tall grave', () => {
    const removed: Array<[number, number]> = []
    const layer = {
      layer: {},
      removeTileAt: (x: number, y: number) => {
        removed.push([x, y])
      },
    }

    clearRenderedGrave(layer as never, 7, 9, pickTileVariant('grave_tall', 0))

    expect(removed).toEqual([[7, 9], [7, 10]])
  })
})

test('both map canvases and scenes use the full snapshot reconciliation contract', () => {
  const v1Canvas = readFileSync('src/components/PhaserCanvas.tsx', 'utf8')
  const v2Canvas = readFileSync('src/components/PhaserCanvasV2.tsx', 'utf8')
  const v1Scene = readFileSync('src/game/scenes/CemeteryScene.ts', 'utf8')
  const v2Scene = readFileSync('src/game/scenes/CemeterySceneV2.ts', 'utf8')

  for (const canvas of [v1Canvas, v2Canvas]) {
    expect(canvas).toContain("cemeteryEvents.emit('sync_graves'")
    expect(canvas).toContain('protectedSlotIds: [...ceremonySlotIdsRef.current]')
    expect(canvas).toContain('authoritative: !state.gravesLoading && !state.gravesError')
    expect(canvas).not.toContain('sentSlotIdsRef')
  }

  for (const scene of [v1Scene, v2Scene]) {
    expect(scene).toContain("cemeteryEvents.on('sync_graves', this.onSyncGraves)")
    expect(scene).toContain("cemeteryEvents.off('sync_graves', this.onSyncGraves)")
    expect(scene).toContain('private reconcileGraves()')
    expect(scene).toContain('this.ceremonySlotIds.add(data.slot_id)')
    expect(scene).toContain('this.reconcileGraves();')
  }
})
