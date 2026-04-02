'use client';

import { useRef, useEffect, useCallback, useMemo } from 'react';
import { cemeteryEvents, type CameraMoveData, type SlotPositionData, type MinimapTilesData } from '@/game/events';
import { useGame } from '@/context/GameContext';
import { useIsMobile } from '@/hooks/useIsMobile';

// Map is 40x40 tiles × 48px = 1920×1920 (square)
const WORLD = 1920;
const SIZE = 140;
const SCALE = SIZE / WORLD;
const TILE_PX = SIZE / 40; // pixels per tile on minimap (~3.5)

// Tile color palette: index → color (lighter)
const TILE_COLORS: Record<number, string> = {
  0: '#1a1918',  // empty — dark void
  1: '#3d3d2e',  // ground — earth
  2: '#6a6050',  // roads — sandy path
  3: '#2e3d2e',  // grass/decoration — green
};

const BUILDING_COLOR = '#e8d5a3';

export default function Minimap() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewportRef = useRef<CameraMoveData | null>(null);
  const tileDataRef = useRef<MinimapTilesData | null>(null);
  const { state } = useGame();
  const isMobile = useIsMobile();

  const slotsRef = useRef(state.slotPositions);
  const gravesRef = useRef(state.graves);

  const slotMap = useMemo(() => {
    const m = new Map<number, SlotPositionData>();
    for (const s of state.slotPositions) m.set(s.id, s);
    return m;
  }, [state.slotPositions]);
  const slotMapRef = useRef(slotMap);

  const buildings = useMemo(() =>
    state.slotPositions.filter(s => s.type === 'Building'),
  [state.slotPositions]);
  const buildingsRef = useRef(buildings);

  useEffect(() => {
    slotsRef.current = state.slotPositions;
    gravesRef.current = state.graves;
    slotMapRef.current = slotMap;
    buildingsRef.current = buildings;
  }, [state.slotPositions, state.graves, slotMap, buildings]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Background
    ctx.fillStyle = '#1a1918';
    ctx.fillRect(0, 0, SIZE, SIZE);

    // Draw tile raster (ground, roads, grass)
    const td = tileDataRef.current;
    if (td) {
      for (let y = 0; y < td.mapHeight; y++) {
        for (let x = 0; x < td.mapWidth; x++) {
          const val = td.tiles[y * td.mapWidth + x];
          if (val === 0) continue;
          ctx.fillStyle = TILE_COLORS[val] ?? TILE_COLORS[0];
          ctx.fillRect(
            Math.floor(x * TILE_PX),
            Math.floor(y * TILE_PX),
            Math.ceil(TILE_PX),
            Math.ceil(TILE_PX),
          );
        }
      }
    }

    // Occupied graves as small bright dots
    for (const [slotId] of gravesRef.current) {
      const slot = slotMapRef.current.get(slotId);
      if (slot) {
        ctx.fillStyle = '#8a8';
        ctx.fillRect(slot.x * SCALE, slot.y * SCALE, 2, 2);
      }
    }

    // Buildings — filled + outlined
    for (const b of buildingsRef.current) {
      const bx = b.x * SCALE;
      const by = b.y * SCALE;
      const bw = b.width * SCALE;
      const bh = b.height * SCALE;
      ctx.fillStyle = BUILDING_COLOR;
      ctx.globalAlpha = 0.4;
      ctx.fillRect(bx, by, bw, bh);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = BUILDING_COLOR;
      ctx.lineWidth = 1;
      ctx.strokeRect(bx, by, bw, bh);
    }

    // Center marker — eye icon
    const vp = viewportRef.current;
    if (vp) {
      const cx = (vp.scrollX + vp.viewWidth / 2) * SCALE;
      const cy = (vp.scrollY + vp.viewHeight / 2) * SCALE;
      ctx.font = '12px serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#e8d5a3';
      ctx.fillText('\u{1F441}', cx, cy);
    }
  }, []);

  // Listen for tile raster from Phaser scene
  useEffect(() => {
    if (isMobile) return;
    const onTiles = (data: MinimapTilesData) => {
      tileDataRef.current = data;
      draw();
    };
    cemeteryEvents.on('minimap_tiles', onTiles);
    return () => {
      cemeteryEvents.off('minimap_tiles', onTiles);
    };
  }, [draw, isMobile]);

  // Listen for camera moves
  useEffect(() => {
    if (isMobile) return;
    const onCameraMove = (data: CameraMoveData) => {
      viewportRef.current = data;
      draw();
    };
    cemeteryEvents.on('camera_move', onCameraMove);
    return () => {
      cemeteryEvents.off('camera_move', onCameraMove);
    };
  }, [draw, isMobile]);

  // Redraw when slots or graves change
  useEffect(() => {
    if (isMobile) return;
    draw();
  }, [state.slotPositions, state.graves, draw, isMobile]);

  // Click → teleport camera
  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const canvasX = e.clientX - rect.left;
    const canvasY = e.clientY - rect.top;
    const worldX = canvasX / SCALE;
    const worldY = canvasY / SCALE;
    cemeteryEvents.emit('minimap_click', { worldX, worldY });
  }, []);

  if (isMobile) return null;

  return (
    <div
      style={{
        position: 'absolute',
        top: 12,
        left: 16,
        width: SIZE,
        height: SIZE,
        zIndex: 40,
        borderRadius: '50%',
        // Double ring frame: inner gold + outer dark
        boxShadow: [
          'inset 0 0 0 2px rgba(232, 213, 163, 0.7)',
          '0 0 0 2px rgba(40, 30, 15, 0.9)',
          '0 0 0 4px rgba(232, 213, 163, 0.4)',
          '0 0 12px rgba(0, 0, 0, 0.6)',
        ].join(', '),
        overflow: 'hidden',
      }}
    >
      <canvas
        ref={canvasRef}
        width={SIZE}
        height={SIZE}
        onClick={handleClick}
        role="img"
        aria-label="Cemetery minimap"
        style={{
          display: 'block',
          width: SIZE,
          height: SIZE,
          borderRadius: '50%',
          cursor: 'pointer',
          imageRendering: 'pixelated',
        }}
      />
      {/* Glass glare overlay */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: '50%',
          background: [
            'radial-gradient(ellipse 70% 50% at 30% 25%, rgba(255,255,255,0.15) 0%, transparent 60%)',
            'radial-gradient(ellipse 40% 20% at 65% 75%, rgba(255,255,255,0.04) 0%, transparent 50%)',
            'linear-gradient(160deg, rgba(255,255,255,0.05) 0%, transparent 40%)',
          ].join(', '),
          pointerEvents: 'none',
        }}
      />
    </div>
  );
}
