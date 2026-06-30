export interface SlotData {
  id: number;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  name: string;
}

function inferGraveType(w: number, h: number): string {
  if (w === 32 && h === 64) return 'grave_tall';
  if (w === 64 && h === 32) return 'grave_wide';
  if (w === 64 && h === 64) return 'grave_large';
  return 'grave';
}

// Building world coordinates (after applying layer offsets from TMJ)
const BUILDINGS: SlotData[] = [
  // Chapel: raw (2160,1664) + offset (-480,160) = world (1680,1824)
  { id: 5000, name: 'Chapel', type: 'Building', x: 1680, y: 1824, width: 160, height: 256 },
  // Gravedigger Lodge: raw (2272,3104) + offset (-64,-32) = world (2208,3072)
  { id: 5001, name: 'Gravedigger Lodge', type: 'Building', x: 2208, y: 3072, width: 160, height: 160 },
  // Service: no offset — raw = world
  { id: 5002, name: 'Service Garage', type: 'Building', x: 2880, y: 2880, width: 64, height: 96 },
  { id: 5003, name: 'Service Building', type: 'Building', x: 2944, y: 2880, width: 128, height: 160 },
  // Main Gate: no offset
  { id: 5004, name: 'Main Gate', type: 'Building', x: 1600, y: 3136, width: 320, height: 160 },
  { id: 5005, name: 'Side Wicket', type: 'Building', x: 1504, y: 3136, width: 512, height: 96 },
];

const GRAVE_OFFSET_X = 768;
const GRAVE_OFFSET_Y = 1312;

export function parseSlotsV2(map: Phaser.Tilemaps.Tilemap): Map<number, SlotData> {
  const slots = new Map<number, SlotData>();

  const graveLayer = map.getObjectLayer('GraveObj');
  if (graveLayer) {
    for (const obj of graveLayer.objects) {
      const type = inferGraveType(obj.width ?? 0, obj.height ?? 0);
      slots.set(obj.id, {
        id: obj.id,
        type,
        x: (obj.x ?? 0) + GRAVE_OFFSET_X,
        y: (obj.y ?? 0) + GRAVE_OFFSET_Y,
        width: obj.width ?? 0,
        height: obj.height ?? 0,
        name: '',
      });
    }
  }

  for (const b of BUILDINGS) {
    slots.set(b.id, b);
  }

  return slots;
}
