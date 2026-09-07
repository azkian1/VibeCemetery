import { getTiledObjectBounds } from './tiledObject';

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

const BUILDING_SOURCES = [
  {
    id: 5000,
    name: 'Chapel',
    layerName: 'ChapelPreview_8d_lowdetail_palette_copy',
    objectNames: ['chapel_8d_160x256_lowdetail_palette_copy'],
  },
  {
    id: 5001,
    name: 'Gravedigger Lodge',
    layerName: 'GravediggerLodgePreview_map4',
    objectNames: ['gravedigger_lodge_sysadmin_complete_map4'],
  },
  {
    id: 5003,
    name: 'Crematory',
    layerName: 'ServiceBuildingsPreview_map4',
    objectNames: ['service_garage_2x3_map4', 'service_technical_building_4x5_map4'],
  },
] as const;

export function parseSlotsV2(map: Phaser.Tilemaps.Tilemap): Map<number, SlotData> {
  const slots = new Map<number, SlotData>();

  const graveLayer = map.getObjectLayer('GraveObj');
  if (graveLayer) {
    for (const obj of graveLayer.objects) {
      const type = inferGraveType(obj.width ?? 0, obj.height ?? 0);
      // Phaser applies Tiled object-layer offsets while parsing the TMJ.
      slots.set(obj.id, {
        id: obj.id,
        type,
        x: obj.x ?? 0,
        y: obj.y ?? 0,
        width: obj.width ?? 0,
        height: obj.height ?? 0,
        name: '',
      });
    }
  }

  for (const source of BUILDING_SOURCES) {
    const layer = map.getObjectLayer(source.layerName);
    const objects = source.objectNames.map((name) => layer?.objects.find((candidate) => candidate.name === name));
    if (objects.some((object) => !object?.gid)) continue;

    // Tile objects use Tiled's bottom-left origin. Phaser has already applied
    // the layer offsets. Both crematory sprites form one interactive building;
    // gates and fences stay decorative and never enter the slot collection.
    const bounds = objects.map((object) => getTiledObjectBounds(object!));
    const x = Math.min(...bounds.map((part) => part.x));
    const y = Math.min(...bounds.map((part) => part.y));
    slots.set(source.id, {
      id: source.id,
      name: source.name,
      type: 'Building',
      x,
      y,
      width: Math.max(...bounds.map((part) => part.x + part.width)) - x,
      height: Math.max(...bounds.map((part) => part.y + part.height)) - y,
    });
  }

  return slots;
}
