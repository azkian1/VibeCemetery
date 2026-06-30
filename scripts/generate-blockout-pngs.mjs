// scripts/generate-blockout-pngs.mjs
// Generate PNG replacements for planning_tiles.svg and blockout_tiles.svg
// These are simple solid-color tilesets used by hidden planning/fog layers

import { writeFileSync } from 'fs';
import { deflateSync } from 'zlib';

function createPNG(width, height, pixels) {
  // PNG signature
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR chunk
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type: RGB
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  // Raw image data with filter bytes
  const rawData = Buffer.alloc(height * (1 + width * 3));
  for (let y = 0; y < height; y++) {
    rawData[y * (1 + width * 3)] = 0; // filter: none
    for (let x = 0; x < width; x++) {
      const pi = (y * width + x) * 3;
      const ri = y * (1 + width * 3) + 1 + x * 3;
      rawData[ri] = pixels[pi];     // R
      rawData[ri + 1] = pixels[pi + 1]; // G
      rawData[ri + 2] = pixels[pi + 2]; // B
    }
  }

  const compressed = deflateSync(rawData);

  // Build chunks
  function chunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const typeB = Buffer.from(type, 'ascii');
    const crcData = Buffer.concat([typeB, data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(crcData), 0);
    return Buffer.concat([len, typeB, data, crc]);
  }

  function crc32(buf) {
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < buf.length; i++) {
      crc ^= buf[i];
      for (let j = 0; j < 8; j++) {
        crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
      }
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }

  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', compressed),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function hexToRgb(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 0xFF, (n >> 8) & 0xFF, n & 0xFF];
}

// planning_tiles: 32x32 red square
const planW = 32, planH = 32;
const planPixels = new Uint8Array(planW * planH * 3);
const [r, g, b] = hexToRgb('#e00000');
for (let i = 0; i < planW * planH; i++) {
  planPixels[i * 3] = r;
  planPixels[i * 3 + 1] = g;
  planPixels[i * 3 + 2] = b;
}
writeFileSync('public/map/planning_tiles.png', createPNG(planW, planH, planPixels));
console.log('Created planning_tiles.png (32x32)');

// blockout_tiles: 288x32, 9 tiles (32x32 each)
const boW = 288, boH = 32;
const boPixels = new Uint8Array(boW * boH * 3);
const tileColors = [
  '#7fa35a', // tile 0: green (grass)
  '#d8c28f', // tile 1: sand
  '#d6d6c8', // tile 2: light gray
  '#aa8d5d', // tile 3: brown
  '#43546b', // tile 4: blue-gray
  '#2d2d33', // tile 5: dark
  '#1a1a2e', // tile 6: fog color (was purple, now dark blue-gray overlay)
  '#16162a', // tile 7: fog locked (dark but not near-black)
  '#ff8a00', // tile 8: orange
];

for (let ty = 0; ty < boH; ty++) {
  for (let tx = 0; tx < boW; tx++) {
    const tileIdx = Math.floor(tx / 32);
    const [cr, cg, cb] = hexToRgb(tileColors[tileIdx]);
    const pi = (ty * boW + tx) * 3;
    // Grid lines: darken edges
    const inTileX = tx % 32;
    const inTileY = ty % 32;
    const isEdge = inTileX === 0 || inTileY === 0;
    if (isEdge) {
      boPixels[pi] = Math.floor(cr * 0.75);
      boPixels[pi + 1] = Math.floor(cg * 0.75);
      boPixels[pi + 2] = Math.floor(cb * 0.75);
    } else {
      boPixels[pi] = cr;
      boPixels[pi + 1] = cg;
      boPixels[pi + 2] = cb;
    }
  }
}
writeFileSync('public/map/blockout_tiles.png', createPNG(boW, boH, boPixels));
console.log('Created blockout_tiles.png (288x32)');
