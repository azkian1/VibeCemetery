'use client';

import { useRef, useEffect, useCallback, useMemo } from 'react';
import { cemeteryEvents, type CameraMoveData, type SlotPositionData, type MinimapTilesData } from '@/game/events';
import { useGame } from '@/context/GameContext';
import { useIsMobile } from '@/hooks/useIsMobile';
import {
  createMinimapProjection,
  isInsideMinimapLens,
  projectWorldPoint,
  type MinimapProjection,
  unprojectMinimapPoint,
} from '@/game/utils/minimapProjection';

const V1_WORLD = 1920;

const V2_WORLD_W = 4480;
const V2_WORLD_H = 3328;

const SIZE = 140;

const TILE_COLORS: Record<number, string> = {
  0: '#1a1918',
  1: '#3d3d2e',
  2: '#6a6050',
  3: '#2e3d2e',
  11: '#5d665f',
  12: '#60644d',
  13: '#5d5e34',
  14: '#5b6047',
  15: '#5d6046',
  16: '#5d5e34',
  17: '#5b5922',
  18: '#5b5c35',
  19: '#5e6862',
  20: '#5c614d',
  21: '#5c5d36',
  22: '#5f634a',
  23: '#677378',
  24: '#5b635d',
  25: '#5d6147',
  26: '#5d6661',
};

const FOG_COLORS: Record<number, string> = {
  1: 'rgba(42, 52, 69, 0.24)',
  2: 'rgba(20, 27, 40, 0.56)',
  3: 'rgba(5, 7, 12, 0.92)',
};

const BUILDING_COLOR = '#e8d5a3';

function clipToLens(ctx: CanvasRenderingContext2D, size: number) {
  const radius = size / 2;
  ctx.beginPath();
  ctx.arc(radius, radius, radius, 0, Math.PI * 2);
  ctx.clip();
}

function drawSmoothedRaster(
  ctx: CanvasRenderingContext2D,
  cfg: MinimapProjection,
  width: number,
  height: number,
  paint: (rasterCtx: CanvasRenderingContext2D) => void,
) {
  const raster = document.createElement('canvas');
  raster.width = width;
  raster.height = height;
  const rasterCtx = raster.getContext('2d');
  if (!rasterCtx) return;

  paint(rasterCtx);

  ctx.save();
  clipToLens(ctx, cfg.size);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(raster, cfg.offsetX, cfg.offsetY, cfg.contentW, cfg.contentH);
  ctx.restore();
}

function getMapConfig(v: string) {
  return v === 'v2'
    ? createMinimapProjection(V2_WORLD_W, V2_WORLD_H, SIZE)
    : createMinimapProjection(V1_WORLD, V1_WORLD, SIZE);
}

export default function Minimap({ mapVersion = 'v1' }: { mapVersion?: string }) {
  const terrainCanvasRef = useRef<HTMLCanvasElement>(null);
  const markersCanvasRef = useRef<HTMLCanvasElement>(null);
  const fogCanvasRef = useRef<HTMLCanvasElement>(null);
  const viewportCanvasRef = useRef<HTMLCanvasElement>(null);
  const viewportRef = useRef<CameraMoveData | null>(null);
  const tileDataRef = useRef<MinimapTilesData | null>(null);
  const { state } = useGame();
  const isMobile = useIsMobile();

  const cfg = useMemo(() => getMapConfig(mapVersion), [mapVersion]);

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

  // Terrain is immutable between minimap_tiles events. Keeping it in its own
  // canvas prevents a 140 by 104 raster pass on every camera_move event.
  const drawTerrain = useCallback(() => {
    const canvas = terrainCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, SIZE, SIZE);
    ctx.save();
    clipToLens(ctx, cfg.size);
    const background = ctx.createRadialGradient(
      cfg.size * 0.42,
      cfg.size * 0.36,
      2,
      cfg.size / 2,
      cfg.size / 2,
      cfg.size * 0.72,
    );
    background.addColorStop(0, '#38442a');
    background.addColorStop(0.62, '#27301f');
    background.addColorStop(1, '#151913');
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, cfg.size, cfg.size);
    ctx.restore();

    const td = tileDataRef.current;
    if (!td) return;

    drawSmoothedRaster(ctx, cfg, td.mapWidth, td.mapHeight, (rasterCtx) => {
      rasterCtx.globalAlpha = 0.9;
      for (let y = 0; y < td.mapHeight; y++) {
        for (let x = 0; x < td.mapWidth; x++) {
          const value = td.tiles[y * td.mapWidth + x];
          if (value === 0) continue;
          rasterCtx.fillStyle = TILE_COLORS[value] ?? TILE_COLORS[0];
          rasterCtx.fillRect(x, y, 1, 1);
        }
      }
    });
  }, [cfg]);

  // The fog is independent from terrain and markers. It stays above both so
  // closed sections do not leak grave or building locations.
  const drawFog = useCallback(() => {
    const canvas = fogCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, SIZE, SIZE);
    const td = tileDataRef.current;
    if (!td?.fog) return;
    const fog = td.fog;

    drawSmoothedRaster(ctx, cfg, td.mapWidth, td.mapHeight, (rasterCtx) => {
      for (let y = 0; y < td.mapHeight; y++) {
        for (let x = 0; x < td.mapWidth; x++) {
          const color = FOG_COLORS[fog[y * td.mapWidth + x]];
          if (!color) continue;
          rasterCtx.fillStyle = color;
          rasterCtx.fillRect(x, y, 1, 1);
        }
      }
    });
  }, [cfg]);

  // Graves and buildings are independent from the camera, so redraw this
  // layer only when their source state changes.
  const drawMarkers = useCallback(() => {
    const canvas = markersCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, SIZE, SIZE);
    ctx.save();
    clipToLens(ctx, cfg.size);

    for (const [slotId] of gravesRef.current) {
      const slot = slotMapRef.current.get(slotId);
      if (slot) {
        const point = projectWorldPoint(cfg, slot.x, slot.y);
        ctx.fillStyle = '#8a8';
        ctx.fillRect(point.x, point.y, 2, 2);
      }
    }

    for (const b of buildingsRef.current) {
      const point = projectWorldPoint(cfg, b.x, b.y);
      const bx = point.x;
      const by = point.y;
      const bw = Math.max(1, b.width * cfg.scale);
      const bh = Math.max(1, b.height * cfg.scale);
      ctx.fillStyle = BUILDING_COLOR;
      ctx.globalAlpha = 0.4;
      ctx.fillRect(bx, by, bw, bh);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = BUILDING_COLOR;
      ctx.lineWidth = 1;
      ctx.strokeRect(bx, by, bw, bh);
    }
    ctx.restore();
  }, [cfg]);

  // camera_move is emitted while panning. Its layer has only the current
  // viewport rectangle, making each update a clear plus two draw operations.
  const drawViewport = useCallback(() => {
    const canvas = viewportCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, SIZE, SIZE);
    const vp = viewportRef.current;
    if (!vp) return;

    const topLeft = projectWorldPoint(cfg, vp.scrollX, vp.scrollY);
    const bottomRight = projectWorldPoint(
      cfg,
      vp.scrollX + vp.viewWidth,
      vp.scrollY + vp.viewHeight,
    );
    const x = topLeft.x;
    const y = topLeft.y;
    const width = Math.max(1, bottomRight.x - topLeft.x);
    const height = Math.max(1, bottomRight.y - topLeft.y);

    ctx.save();
    clipToLens(ctx, cfg.size);
    ctx.fillStyle = 'rgba(232, 213, 163, 0.18)';
    ctx.fillRect(x, y, width, height);
    ctx.strokeStyle = '#f5e7ae';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, width, height);
    ctx.restore();
  }, [cfg]);

  useEffect(() => {
    if (isMobile) return;
    const onTiles = (data: MinimapTilesData) => {
      if (data.mapVersion && data.mapVersion !== mapVersion) return;
      tileDataRef.current = data;
      drawTerrain();
      drawFog();
    };

    cemeteryEvents.on('minimap_tiles', onTiles);
    const retained = cemeteryEvents.getLatest('minimap_tiles');
    if (retained && (!retained.mapVersion || retained.mapVersion === mapVersion)) {
      onTiles(retained);
    } else {
      tileDataRef.current = null;
      drawTerrain();
      drawFog();
    }

    return () => {
      cemeteryEvents.off('minimap_tiles', onTiles);
    };
  }, [drawFog, drawTerrain, isMobile, mapVersion]);

  useEffect(() => {
    gravesRef.current = state.graves;
    slotMapRef.current = slotMap;
    buildingsRef.current = buildings;
    if (!isMobile) drawMarkers();
  }, [state.graves, slotMap, buildings, drawMarkers, isMobile]);

  useEffect(() => {
    if (isMobile) return;
    viewportRef.current = null;
    const onCameraMove = (data: CameraMoveData) => {
      if (data.mapVersion && data.mapVersion !== mapVersion) return;
      viewportRef.current = data;
      drawViewport();
    };

    cemeteryEvents.on('camera_move', onCameraMove);
    const retained = cemeteryEvents.getLatest('camera_move');
    if (retained && (!retained.mapVersion || retained.mapVersion === mapVersion)) {
      onCameraMove(retained);
    } else {
      drawViewport();
    }

    return () => {
      cemeteryEvents.off('camera_move', onCameraMove);
    };
  }, [drawViewport, isMobile, mapVersion]);

  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = terrainCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const canvasX = (e.clientX - rect.left) * (SIZE / rect.width);
    const canvasY = (e.clientY - rect.top) * (SIZE / rect.height);
    if (!isInsideMinimapLens(canvasX, canvasY, SIZE)) return;
    const { worldX, worldY } = unprojectMinimapPoint(cfg, canvasX, canvasY);
    const tileData = tileDataRef.current;
    if (mapVersion === 'v2' && tileData) {
      const tileX = Math.floor(worldX / cfg.worldW * tileData.mapWidth);
      const tileY = Math.floor(worldY / cfg.worldH * tileData.mapHeight);
      if (tileX < 0 || tileX >= tileData.mapWidth || tileY < 0 || tileY >= tileData.mapHeight) return;
      const index = tileY * tileData.mapWidth + tileX;
      if (tileData.tiles[index] === 0 || tileData.fog?.[index] === 3) return;
    }
    cemeteryEvents.emit('minimap_click', { worldX, worldY });
  }, [cfg, mapVersion]);

  if (isMobile) return null;

  const sharedCanvasStyle = {
    position: 'absolute' as const,
    inset: 0,
    width: SIZE,
    height: SIZE,
    borderRadius: '50%',
  };

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
        ref={terrainCanvasRef}
        data-testid="minimap-terrain"
        width={SIZE}
        height={SIZE}
        onClick={handleClick}
        role="img"
        aria-label="Cemetery minimap"
        style={{
          ...sharedCanvasStyle,
          cursor: 'pointer',
          filter: 'saturate(0.84) contrast(0.92) blur(0.25px)',
        }}
      />
      <canvas
        ref={markersCanvasRef}
        data-testid="minimap-markers"
        width={SIZE}
        height={SIZE}
        aria-hidden="true"
        style={{ ...sharedCanvasStyle, pointerEvents: 'none' }}
      />
      <canvas
        ref={fogCanvasRef}
        data-testid="minimap-fog"
        width={SIZE}
        height={SIZE}
        aria-hidden="true"
        style={{
          ...sharedCanvasStyle,
          pointerEvents: 'none',
          filter: 'blur(0.35px)',
        }}
      />
      <canvas
        ref={viewportCanvasRef}
        data-testid="minimap-viewport"
        width={SIZE}
        height={SIZE}
        aria-hidden="true"
        style={{ ...sharedCanvasStyle, pointerEvents: 'none' }}
      />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: '50%',
          background: [
            'radial-gradient(circle at 50% 50%, transparent 52%, rgba(8,11,14,0.12) 72%, rgba(5,7,10,0.72) 100%)',
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
