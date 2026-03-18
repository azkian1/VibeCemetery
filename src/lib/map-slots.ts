import { readFileSync } from 'fs';
import { join } from 'path';

interface TmjObject {
  id: number;
  type: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface TmjLayer {
  name: string;
  type: string;
  objects?: TmjObject[];
}

interface TmjMap {
  layers: TmjLayer[];
}

let cachedSlotIds: number[] | null = null;

/** Returns all grave slot IDs from the Tiled map, sorted ascending. */
export function getGraveSlotIds(): number[] {
  if (cachedSlotIds) return cachedSlotIds;

  const mapPath = join(process.cwd(), 'public', 'map', 'az.tmj');
  const map: TmjMap = JSON.parse(readFileSync(mapPath, 'utf8'));
  const slotsLayer = map.layers.find((l) => l.name === 'slots');

  if (!slotsLayer?.objects) return [];

  cachedSlotIds = slotsLayer.objects
    .filter((o) => o.type.startsWith('grave'))
    .map((o) => o.id)
    .sort((a, b) => a - b);

  return cachedSlotIds;
}
