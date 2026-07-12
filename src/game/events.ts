export interface SlotEventData {
  slotId: number;
  type: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  screenX: number;
  screenY: number;
}

export interface CameraMoveData {
  scrollX: number;
  scrollY: number;
  /** World-space viewport width (screen width / zoom) */
  viewWidth: number;
  /** World-space viewport height (screen height / zoom) */
  viewHeight: number;
  zoom: number;
  /** Lets a retained viewport be ignored after switching cemetery maps. */
  mapVersion?: string;
}

export interface MinimapClickData {
  worldX: number;
  worldY: number;
}

export interface SlotPositionData {
  id: number;
  x: number;
  y: number;
  width: number;
  height: number;
  type: string;
  name: string;
}

export interface SlotsReadyData {
  slots: SlotPositionData[];
}

// React → Phaser: render grave tiles
export interface RenderGraveData {
  slot_id: number;
  id: string;
  name: string;
  grave_gid?: number | null;
}

/**
 * Authoritative React snapshot for reconciling rendered graves in Phaser.
 * Slots protected by a pending burial ceremony are deliberately left to that
 * ceremony until it has finished rendering the grave.
 */
export interface SyncGravesData {
  graves: RenderGraveData[];
  protectedSlotIds: number[];
  authoritative: boolean;
}

// Minimap raster: Uint8Array where each byte is a terrain color index for a tile.
// V2 uses original terrain GIDs (11–26) so grass and flagstone stay distinct.
export interface MinimapTilesData {
  /** Color index per tile, row-major, mapWidth * mapHeight entries */
  tiles: Uint8Array;
  /**
   * Optional fog state per tile: 0 = open, 1 = inner soft fog,
   * 2 = outer soft fog, 3 = locked.
   */
  fog?: Uint8Array;
  mapWidth: number;
  mapHeight: number;
  /** Lets a retained minimap raster be ignored after switching cemetery maps. */
  mapVersion?: string;
}

// Event map: event name → payload type
export interface CemeteryEventMap {
  grave_click: SlotEventData;
  building_click: SlotEventData;
  grave_hover: SlotEventData;
  grave_hover_end: SlotEventData;
  camera_move: CameraMoveData;
  minimap_click: MinimapClickData;
  slots_ready: SlotsReadyData;
  // React → Phaser
  render_graves: { graves: RenderGraveData[] };
  render_grave: RenderGraveData;
  sync_graves: SyncGravesData;
  // Phaser → React: simplified tile raster for minimap
  minimap_tiles: MinimapTilesData;
  // React → Phaser: modal open/close state
  modal_state: { open: boolean };
  // Phaser → React: day/night cycle phase
  day_phase: { phase: 'dusk' | 'night' | 'dawn' | 'day' };
  // React → Phaser: highlight a specific slot (pulse effect)
  highlight_slot: { slotId: number };
  // Phaser → React: scene fully initialized
  scene_ready: Record<string, never>;
  // Phaser → React: critical asset failed to load
  load_error: { assetKey: string; assetUrl: string };
  // React → Phaser: trigger burial ceremony animation
  burial_ceremony: { slot_id: number; id: string; name: string; chatText: string; gravediggerPhrase: string };
  // Phaser → React: ceremony finished
  burial_ceremony_done: { slot_id: number; willContinue?: boolean };
  // React → Phaser: zoom buttons
  zoom_change: { delta: number };
}

export type CemeteryEventType = keyof CemeteryEventMap;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Callback = (data: any) => void;

class CemeteryEventBus {
  private listeners = new Map<CemeteryEventType, Set<Callback>>();
  private latest = new Map<CemeteryEventType, CemeteryEventMap[CemeteryEventType]>();

  on<E extends CemeteryEventType>(event: E, cb: (data: CemeteryEventMap[E]) => void) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(cb as Callback);
  }

  off<E extends CemeteryEventType>(event: E, cb: (data: CemeteryEventMap[E]) => void) {
    this.listeners.get(event)?.delete(cb as Callback);
  }

  emit<E extends CemeteryEventType>(event: E, data: CemeteryEventMap[E]) {
    if (event === 'minimap_tiles' || event === 'camera_move') {
      this.latest.set(event, data);
    }
    this.listeners.get(event)?.forEach((cb) => cb(data));
  }

  getLatest<E extends CemeteryEventType>(event: E): CemeteryEventMap[E] | undefined {
    return this.latest.get(event) as CemeteryEventMap[E] | undefined;
  }

  clear() {
    this.listeners.clear();
    this.latest.clear();
  }
}

export const cemeteryEvents = new CemeteryEventBus();
