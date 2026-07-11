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
    objectName: 'chapel_8d_160x256_lowdetail_palette_copy',
  },
  {
    id: 5001,
    name: 'Gravedigger Lodge',
    layerName: 'GravediggerLodgePreview_map4',
    objectName: 'gravedigger_lodge_sysadmin_complete_map4',
  },
  {
    id: 5002,
    name: 'Service Garage',
    layerName: 'ServiceBuildingsPreview_map4',
    objectName: 'service_garage_2x3_map4',
  },
  {
    id: 5003,
    name: 'Service Building',
    layerName: 'ServiceBuildingsPreview_map4',
    objectName: 'service_technical_building_4x5_map4',
  },
  {
    id: 5004,
    name: 'Main Gate',
    layerName: 'MainGate1dsQ4Preview_map4',
    objectName: 'main_gate_1ds_q4_full_320x160_map4_compare',
  },
  {
    id: 5005,
    name: 'Side Wicket',
    layerName: 'Side_map4',
    objectName: 'side_wicket_chek_q1_extensions_512x96_map4_compare',
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
    const object = layer?.objects.find((candidate) => candidate.name === source.objectName);
    if (!object?.gid) continue;

    // Tile objects use Tiled's bottom-left origin. Phaser has already applied
    // the object-layer offsets, so only the origin needs conversion.
    const bounds = getTiledObjectBounds(object);
    slots.set(source.id, {
      id: source.id,
      name: source.name,
      type: 'Building',
      ...bounds,
    });
  }

  return slots;
}
