export interface SlotData {
  id: number;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  name: string;
}

export function parseSlots(map: Phaser.Tilemaps.Tilemap): Map<number, SlotData> {
  const slots = new Map<number, SlotData>();
  const objectLayer = map.getObjectLayer('slots');
  if (!objectLayer) return slots;

  for (const obj of objectLayer.objects) {
    slots.set(obj.id, {
      id: obj.id,
      type: obj.type ?? '',
      x: obj.x ?? 0,
      y: obj.y ?? 0,
      width: obj.width ?? 0,
      height: obj.height ?? 0,
      name: obj.name ?? '',
    });
  }

  return slots;
}

