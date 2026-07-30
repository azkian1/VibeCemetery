import fs from 'fs';
import path from 'path';

const tmxPath = process.argv[2];
const tmjPath = process.argv[3] || path.join(process.cwd(), 'public', 'map', 'cemetery-v2.tmj');

if (!tmxPath) {
  console.error('Usage: node scripts/convert-tmx-to-tmj.mjs <source.tmx> [public/map/cemetery-v2.tmj]');
  process.exit(1);
}

console.log(`Reading: ${tmxPath}`);
let xml = fs.readFileSync(tmxPath, 'utf-8');

// Parse using regex — no external dependencies
const parseAttrs = (s) => {
  const attrs = {};
  const re = /(\w+)="([^"]*)"/g;
  let m;
  while ((m = re.exec(s)) !== null) {
    let val = m[2];
    if (/^-?\d+(?:\.\d+)?$/.test(val)) val = Number(val);
    else if (val === 'true') val = true;
    else if (val === 'false') val = false;
    attrs[m[1]] = val;
  }
  return attrs;
};

// --- Top-level map ---
const mapMatch = /<map\b([^>]*)>/.exec(xml);
const mapAttrs = parseAttrs(mapMatch[1]);
delete mapAttrs.version;
delete mapAttrs.tiledversion;

// --- Tilesets ---
const tilesets = [];
const tsRe = /<tileset\b([^>]*)>([\s\S]*?)<\/tileset>/g;
let tsMatch;
while ((tsMatch = tsRe.exec(xml)) !== null) {
  const attrs = parseAttrs(tsMatch[1]);
  const inner = tsMatch[2];
  const imgMatch = /<image\b([^>]*)\/>/.exec(inner);
  if (imgMatch) {
    const imgAttrs = parseAttrs(imgMatch[1]);
    attrs.image = imgAttrs.source || '';
    attrs.imagewidth = imgAttrs.width;
    attrs.imageheight = imgAttrs.height;
  }
  tilesets.push(attrs);
}

// --- Extract body between <map ...> and </map> ---
const mapTagEnd = mapMatch.index + mapMatch[0].length;
const mapCloseIdx = xml.lastIndexOf('</map>');
const body = xml.slice(mapTagEnd, mapCloseIdx);

// --- Layers and objectgroups ---
const layers = [];

// Match all layer start tags and objectgroup start tags, find their content
const tagPattern = /<(layer|objectgroup)\b([^>]*)>/g;
let tagMatch;
const tags = [];
while ((tagMatch = tagPattern.exec(body)) !== null) {
  tags.push({ tag: tagMatch[1], attrs: parseAttrs(tagMatch[2]), start: tagMatch.index + tagMatch[0].length, fullStart: tagMatch.index });
}
tags.sort((a, b) => a.fullStart - b.fullStart);

for (let i = 0; i < tags.length; i++) {
  const t = tags[i];
  const closeTag = `</${t.tag}>`;
  // Find matching close tag
  let depth = 1;
  let searchFrom = t.start;
  while (depth > 0) {
    const openIdx = body.indexOf(`<${t.tag}`, searchFrom);
    const closeIdx = body.indexOf(closeTag, searchFrom);
    // Self-closing check
    const openTagEnd = body.indexOf('>', openIdx);
    const isSelfClosing = openIdx !== -1 && body[openTagEnd - 1] === '/';
    if (!isSelfClosing && openIdx !== -1 && openIdx < (closeIdx === -1 ? Infinity : closeIdx)) {
      depth++;
      searchFrom = openIdx + 1;
    } else {
      if (closeIdx !== -1) {
        depth--;
        if (depth === 0) {
          const content = body.slice(t.start, closeIdx);
          const layerType = t.tag === 'layer' ? 'tilelayer' : 'objectgroup';
          // Normalize visible: default to true when absent, convert 0→false, 1→true
          const visible = t.attrs.visible === false || t.attrs.visible === 0 ? false : true;
          const rawAttrs = { ...t.attrs };
          delete rawAttrs.visible;
          const layer = { ...rawAttrs, type: layerType, visible };

          if (layerType === 'tilelayer') {
            if (layer.x === undefined) layer.x = 0;
            if (layer.y === undefined) layer.y = 0;
            // Parse data
            const dataMatch = /<data\s+encoding="csv">\s*([\s\S]*?)\s*<\/data>/.exec(content);
            if (dataMatch) {
              const csv = dataMatch[1].replace(/[\r\n]+/g, '').trim();
              layer.data = csv.split(',').map(v => Number(v.trim()));
            }
          } else {
            layer.objects = [];
            const objRe = /<object\b([^>]*?)(?:\/>|>)/g;
            let objMatch;
            while ((objMatch = objRe.exec(content)) !== null) {
              const objAttrs = parseAttrs(objMatch[1]);
              layer.objects.push(objAttrs);
            }
          }
          layers.push(layer);
          break;
        }
      }
      searchFrom = closeIdx + closeTag.length;
    }
  }
}

// Sort layers by their id for stable output
layers.sort((a, b) => (a.id || 0) - (b.id || 0));

const output = {
  ...mapAttrs,
  infinite: false,
  tilesets,
  layers,
};

fs.writeFileSync(tmjPath, JSON.stringify(output, null, 2), 'utf-8');
console.log(`Written: ${tmjPath}`);
console.log(`Tilesets: ${tilesets.length}`);
console.log(`Layers (tile + objectgroup): ${layers.length}`);

// Count subtypes
const tileLayers = layers.filter(l => l.type === 'tilelayer');
const objectGroups = layers.filter(l => l.type === 'objectgroup');
console.log(`  Tile layers: ${tileLayers.length}`);
console.log(`  Object groups: ${objectGroups.length}`);

// Validate — try parsing back
try {
  const check = JSON.parse(fs.readFileSync(tmjPath, 'utf-8'));
  console.log(`JSON valid: yes (${Object.keys(check).length} top-level keys)`);
  console.log(`Map: ${check.width}x${check.height}, tile: ${check.tilewidth}x${check.tileheight}`);
} catch (e) {
  console.error(`JSON validation failed: ${e.message}`);
}
