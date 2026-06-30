'use client';

import { useRef, useEffect, useCallback, useMemo } from 'react';
import { cemeteryEvents, type CameraMoveData, type SlotPositionData, type MinimapTilesData } from '@/game/events';
import { useGame } from '@/context/GameContext';
import { useIsMobile } from '@/hooks/useIsMobile';

const V1_MAP_TILES_X = 40;
const V1_MAP_TILES_Y = 40;
const V1_WORLD = 1920;

const V2_MAP_TILES_X = 140;
const V2_MAP_TILES_Y = 104;
const V2_WORLD_W = 4480;
const V2_WORLD_H = 3328;

const SIZE = 140;

const TILE_COLORS: Record<number, string> = {
  0: '#1a1918',
  1: '#3d3d2e',
  2: '#6a6050',
  3: '#2e3d2e',
};

const BUILDING_COLOR = '#e8d5a3';

function getMapConfig(v: string) {
  if (v === 'v2') {
    const scaleX = SIZE / V2_WORLD_W;
    const scaleY = SIZE / V2_WORLD_H;
    return {
      worldW: V2_WORLD_W,
      worldH: V2_WORLD_H,
      scaleX,
      scaleY,
      tilePxX: SIZE / V2_MAP_TILES_X,
      tilePxY: SIZE / V2_MAP_TILES_Y,
    };
  }
  return {
    worldW: V1_WORLD,
    worldH: V1_WORLD,
    scaleX: SIZE / V1_WORLD,
    scaleY: SIZE / V1_WORLD,
    tilePxX: SIZE / V1_MAP_TILES_X,
    tilePxY: SIZE / V1_MAP_TILES_Y,
  };
}

export default function Minimap({ mapVersion = 'v1' }: { mapVersion?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewportRef = useRef<CameraMoveData | null>(null);
  const tileDataRef = useRef<MinimapTilesData | null>(null);
  const { state } = useGame();
  const isMobile = useIsMobile();

  const cfg = useMemo(() => getMapConfig(mapVersion), [mapVersion]);

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

    ctx.fillStyle = '#1a1918';
    ctx.fillRect(0, 0, SIZE, SIZE);

    const td = tileDataRef.current;
    if (td) {
      const tilePxX = cfg.tilePxX;
      const tilePxY = cfg.tilePxY;
      for (let y = 0; y < td.mapHeight; y++) {
        for (let x = 0; x < td.mapWidth; x++) {
          const val = td.tiles[y * td.mapWidth + x];
          if (val === 0) continue;
          ctx.fillStyle = TILE_COLORS[val] ?? TILE_COLORS[0];
          ctx.fillRect(
            Math.floor(x * tilePxX),
            Math.floor(y * tilePxY),
            Math.ceil(tilePxX),
            Math.ceil(tilePxY),
          );
        }
      }
    }

    for (const [slotId] of gravesRef.current) {
      const slot = slotMapRef.current.get(slotId);
      if (slot) {
        ctx.fillStyle = '#8a8';
        ctx.fillRect(slot.x * cfg.scaleX, slot.y * cfg.scaleY, 2, 2);
      }
    }

    for (const b of buildingsRef.current) {
      const bx = b.x * cfg.scaleX;
      const by = b.y * cfg.scaleY;
      const bw = b.width * cfg.scaleX;
      const bh = b.height * cfg.scaleY;
      ctx.fillStyle = BUILDING_COLOR;
      ctx.globalAlpha = 0.4;
      ctx.fillRect(bx, by, bw, bh);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = BUILDING_COLOR;
      ctx.lineWidth = 1;
      ctx.strokeRect(bx, by, bw, bh);
    }

    const vp = viewportRef.current;
    if (vp) {
      const cx = (vp.scrollX + vp.viewWidth / 2) * cfg.scaleX;
      const cy = (vp.scrollY + vp.viewHeight / 2) * cfg.scaleY;
      ctx.font = '12px serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#e8d5a3';
      ctx.fillText('\u{1F441}', cx, cy);
    }
  }, [cfg]);

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

  useEffect(() => {
    if (isMobile) return;
    draw();
  }, [state.slotPositions, state.graves, draw, isMobile]);

  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const canvasX = e.clientX - rect.left;
    const canvasY = e.clientY - rect.top;
    const worldX = canvasX / cfg.scaleX;
    const worldY = canvasY / cfg.scaleY;
    cemeteryEvents.emit('minimap_click', { worldX, worldY });
  }, [cfg.scaleX, cfg.scaleY]);

  if (isMobile) return null;

  return (
    <div
      data-testid="minimap-shell"
      style={{
        position: 'absolute',
        top: 12,
        left: 16,
        width: SIZE,
        height: SIZE,
        zIndex: 40,
        borderRadius: '50%',
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
