import * as Phaser from 'phaser';
import { parseSlots, SlotData } from '../utils/slotManager';
import { pickTileVariant, renderGrave } from '../utils/tileRegistry';
import { cemeteryEvents, SlotEventData, RenderGraveData, MinimapClickData } from '../events';

const TILESET_BASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/tilesets`
  : '/map';

const TILESET_NAMES = [
  'graveyard_ground',
  'Graveyard_B',
  'Graveyard_A2',
  'Graveyard_C',
  'non-rm-a1-square',
  'Graveyard_D',
  'Graveyard_A1',
  'Crypt_D',
  'Crypt_B',
];

// Fire torch animation frames (GIDs from Fire_Animation tileset)
const FIRE_TORCHES = [
  { x: 12, y: 1, offset: 0 },
  { x: 16, y: 1, offset: 1 },
];
const FIRE_FRAMES = [
  { top: 6173, bottom: 6176 },
  { top: 6174, bottom: 6177 },
  { top: 6175, bottom: 6178 },
];

// Crypt lamps near Mausoleum (GID 5713 top + 5729 bottom, each 1x2 tiles)
const MAUSOLEUM_LAMPS = [
  { x: 1248, y: 1656 }, // Left lamp
  { x: 1440, y: 1656 }, // Right lamp
];

// Blue lamp positions (extracted from az.tmj)
// Working lamps: GIDs 3698,3699,3700,3701,3702,3703,3704,3715,3956,3957,3960
const BLUE_LAMPS_WORKING: Array<{ x: number; y: number; bright: boolean }> = [
  // 3698 — Grass
  {x:288,y:336,bright:false},{x:432,y:336,bright:false},{x:480,y:528,bright:false},
  {x:576,y:624,bright:false},{x:672,y:720,bright:false},{x:768,y:768,bright:false},
  {x:1152,y:336,bright:false},{x:1296,y:288,bright:false},{x:1344,y:480,bright:false},
  {x:1440,y:240,bright:false},{x:1536,y:384,bright:false},{x:1632,y:192,bright:false},
  {x:1728,y:384,bright:false},
  // 3699 — Grass
  {x:240,y:1536,bright:false},{x:288,y:864,bright:false},{x:384,y:816,bright:false},
  {x:864,y:624,bright:false},
  // 3700 — Grass + Forest1
  {x:912,y:1632,bright:false},{x:960,y:144,bright:false},
  // 3701 — Grass
  {x:1248,y:1104,bright:false},{x:1296,y:1440,bright:false},
  // 3702 — Grass
  {x:1152,y:1488,bright:false},
  // 3703 — Grass (BRIGHT)
  {x:528,y:96,bright:true},{x:816,y:96,bright:true},
  // 3704 — Grass
  {x:96,y:672,bright:false},{x:192,y:672,bright:false},{x:1200,y:1632,bright:false},
  {x:1488,y:1632,bright:false},
  // 3715 — Grass + Forest1
  {x:48,y:288,bright:false},{x:96,y:1536,bright:false},{x:192,y:912,bright:false},
  {x:288,y:1056,bright:false},{x:432,y:1488,bright:false},{x:480,y:1152,bright:false},
  {x:624,y:1488,bright:false},{x:720,y:1680,bright:false},{x:816,y:1152,bright:false},
  {x:816,y:1392,bright:false},{x:1440,y:576,bright:false},{x:1440,y:1056,bright:false},
  {x:1440,y:1200,bright:false},{x:1440,y:1344,bright:false},{x:1440,y:1440,bright:false},
  {x:1488,y:816,bright:false},{x:1584,y:1536,bright:false},{x:1632,y:1344,bright:false},
  {x:1680,y:1056,bright:false},{x:1728,y:1200,bright:false},{x:1776,y:912,bright:false},
  {x:1776,y:1344,bright:false},{x:1872,y:1200,bright:false},
  // 3956, 3957 — Forest2
  {x:192,y:1872,bright:false},{x:240,y:1872,bright:false},
  // 3960 — Grass
  {x:144,y:480,bright:false},
];

// Broken lamps: GIDs 5333,5338,5339,5340,5366
const BLUE_LAMPS_BROKEN = [
  {x:1248,y:960},{x:1152,y:1200},{x:816,y:480},{x:912,y:384},
  {x:864,y:768},{x:1584,y:1104},
];

const TILE_LAYER_NAMES = [
  'Ground',
  'Roads',
  'Borders',
  'Grass',
  'Forest2',
  'Tail3',
  'Mid',
  'graves_dynamic',
  'Forest1',
];

export class CemeteryScene extends Phaser.Scene {
  private map!: Phaser.Tilemaps.Tilemap;
  private slots = new Map<number, SlotData>();
  private gravesLayer: Phaser.Tilemaps.TilemapLayer | null = null;
  private fireLayer: Phaser.Tilemaps.TilemapLayer | null = null;
  private fireFrame = 0;
  private lampGraphics: Phaser.GameObjects.Graphics[] = [];
  private timers: Phaser.Time.TimerEvent[] = [];
  private lastCamX = -1;
  private lastCamY = -1;
  private lastCamZoom = -1;
  private lastCamEmit = 0;
  private modalOpen = false;
  private pendingCeremony: { slot_id: number; id: string; name: string } | null = null;
  private ceremonyQueue: Array<{ slot_id: number; id: string; name: string }> = [];
  private ceremonyScheduled = false;
  private ceremonyInProgress = false;
  private ceremonyObjects: Phaser.GameObjects.GameObject[] = [];
  private buryModalOpen = false;
  private isDragging = false;
  private dragDistance = 0;
  private dragStartX = 0;
  private dragStartY = 0;
  private dragStartScrollX = 0;
  private dragStartScrollY = 0;
  private prevPinchDist = 0;
  private isMobile = false;
  private minZoom = 0;
  private assetLoadError: { assetKey: string; assetUrl: string } | null = null;
  private cleanedUp = false;

  constructor() {
    super({ key: 'CemeteryScene' });
  }

  preload() {
    this.assetLoadError = null;
    this.load.once('loaderror', (file: Phaser.Loader.File) => {
      if (this.assetLoadError) return;

      const assetUrl = typeof file.src === 'string' ? file.src : 'unknown asset URL';
      this.assetLoadError = { assetKey: file.key, assetUrl };
      cemeteryEvents.emit('load_error', this.assetLoadError);
    });

    this.load.tilemapTiledJSON('cemetery-map', '/map/az.tmj');
    for (const name of TILESET_NAMES) {
      this.load.image(name, `${TILESET_BASE_URL}/${name}.png`);
    }
    this.load.image('Fire_Animation', `${TILESET_BASE_URL}/Fire_Animation.png`);
  }

  create() {
    if (this.assetLoadError) {
      return;
    }

    this.renderedSlots.clear();
    this.cleanedUp = false;
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.shutdown, this);
    this.events.once(Phaser.Scenes.Events.DESTROY, this.shutdown, this);

    // Create tilemap
    this.map = this.make.tilemap({ key: 'cemetery-map' });

    // Add all tilesets
    const tilesets: Phaser.Tilemaps.Tileset[] = [];
    for (const name of TILESET_NAMES) {
      const ts = this.map.addTilesetImage(name, name);
      if (ts) tilesets.push(ts);
    }
    const fireTileset = this.map.addTilesetImage('Fire_Animation', 'Fire_Animation');
    if (fireTileset) tilesets.push(fireTileset);

    // Create tile layers in order
    for (const layerName of TILE_LAYER_NAMES) {
      const layer = this.map.createLayer(layerName, tilesets);
      if (layer && layerName === 'graves_dynamic') {
        this.gravesLayer = layer;
      }
      if (layer && layerName === 'Tail3') {
        this.fireLayer = layer;
      }
      // Parallax: foreground trees move slightly faster
      if (layer && layerName === 'Forest1') {
        layer.setScrollFactor(1.03);
      }
      if (layer && layerName === 'Forest2') {
        layer.setScrollFactor(1.015);
      }
    }

    // Emit simplified tile raster for minimap
    this.emitMinimapTiles();

    // Parse object layer
    this.slots = parseSlots(this.map);

    // Emit slot positions for minimap (includes dimensions for building outlines)
    const slotArr = Array.from(this.slots.values()).map(s => ({
      id: s.id, x: s.x, y: s.y, width: s.width, height: s.height, type: s.type, name: s.name,
    }));
    cemeteryEvents.emit('slots_ready', { slots: slotArr });

    // Camera setup — smooth intro (no hard bounds, elastic instead)
    const cam = this.cameras.main;
    const isMobile = this.scale.width < 640;
    this.isMobile = isMobile;
    cam.centerOn(960, 960);
    const fitZoom = Math.max(this.scale.width / 1920, this.scale.height / 1920);
    const minZoom = fitZoom;
    this.minZoom = minZoom;
    const startZoom = isMobile ? Math.max(fitZoom, 0.85) : fitZoom;
    cam.setZoom(startZoom);
    cam.zoomTo(1.0, 2000, 'Sine.easeInOut');

    // Elastic bounds helpers
    const ELASTIC = 0.3; // resistance when dragging past edge
    const getBounds = () => {
      const vw = cam.width / cam.zoom;
      const vh = cam.height / cam.zoom;
      return {
        minX: 0,
        minY: 0,
        maxX: Math.max(0, 1920 - vw),
        maxY: Math.max(0, 1920 - vh),
      };
    };

    const clampWithElastic = (val: number, min: number, max: number) => {
      if (val < min) return min + (val - min) * ELASTIC;
      if (val > max) return max + (val - max) * ELASTIC;
      return val;
    };

    const snapBack = () => {
      const b = getBounds();
      const targetX = Phaser.Math.Clamp(cam.scrollX, b.minX, b.maxX);
      const targetY = Phaser.Math.Clamp(cam.scrollY, b.minY, b.maxY);
      if (Math.abs(cam.scrollX - targetX) > 1 || Math.abs(cam.scrollY - targetY) > 1) {
        this.tweens.add({
          targets: cam,
          scrollX: targetX,
          scrollY: targetY,
          duration: 300,
          ease: 'Back.easeOut',
        });
      }
    };

    // Drag controls
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      // Second finger down → cancel drag, start pinch
      if (this.input.pointer1.isDown && this.input.pointer2.isDown) {
        this.isDragging = false;
        this.prevPinchDist = 0;
        return;
      }
      this.isDragging = true;
      this.dragDistance = 0;
      this.dragStartX = pointer.x;
      this.dragStartY = pointer.y;
      this.dragStartScrollX = cam.scrollX;
      this.dragStartScrollY = cam.scrollY;
    });

    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      // Pinch-to-zoom (two fingers)
      if (this.input.pointer1.isDown && this.input.pointer2.isDown) {
        this.isDragging = false;
        const p1 = this.input.pointer1;
        const p2 = this.input.pointer2;
        const dist = Phaser.Math.Distance.Between(p1.x, p1.y, p2.x, p2.y);
        if (this.prevPinchDist > 0) {
          const scale = dist / this.prevPinchDist;
          const newZoom = Phaser.Math.Clamp(cam.zoom * scale, minZoom, 2.0);
          cam.setZoom(newZoom);
        }
        this.prevPinchDist = dist;
        return;
      }

      // Single-finger drag
      if (!this.isDragging) return;
      const dx = pointer.x - this.dragStartX;
      const dy = pointer.y - this.dragStartY;
      this.dragDistance = Math.sqrt(dx * dx + dy * dy);
      const rawX = this.dragStartScrollX - dx / cam.zoom;
      const rawY = this.dragStartScrollY - dy / cam.zoom;
      const b = getBounds();
      cam.scrollX = clampWithElastic(rawX, b.minX, b.maxX);
      cam.scrollY = clampWithElastic(rawY, b.minY, b.maxY);
    });

    this.input.on('pointerup', () => {
      this.prevPinchDist = 0;
      // Transition from pinch to single-finger drag: re-anchor
      if (this.input.pointer1.isDown || this.input.pointer2.isDown) {
        const active = this.input.pointer1.isDown ? this.input.pointer1 : this.input.pointer2;
        this.isDragging = true;
        this.dragDistance = 0;
        this.dragStartX = active.x;
        this.dragStartY = active.y;
        this.dragStartScrollX = cam.scrollX;
        this.dragStartScrollY = cam.scrollY;
        return;
      }
      this.isDragging = false;
      snapBack();
    });

    // Zoom controls
    this.input.on('wheel', (_pointer: Phaser.Input.Pointer, _gameObjects: Phaser.GameObjects.GameObject[], _deltaX: number, deltaY: number) => {
      const newZoom = Phaser.Math.Clamp(cam.zoom - deltaY * 0.001, minZoom, 2.0);
      cam.setZoom(newZoom);
      snapBack();
    });

    // Interactive zones for slots
    this.setupInteractiveZones();

    // Listen for graves data from React (single source of truth)
    cemeteryEvents.on('render_graves', this.onRenderGraves);
    cemeteryEvents.on('render_grave', this.onRenderGrave);

    // Building labels
    this.createBuildingLabels();

    // Fog vignette around map edges
    this.createFogVignette();

    // Day/night cycle
    this.createDayNightCycle();

    // Ambient particles
    this.createAmbientParticles();

    // Fire animation — cycle frames every 350ms
    this.timers.push(this.time.addEvent({
      delay: 350,
      loop: true,
      callback: () => this.animateFire(),
    }));

    // Lamp glow near Mausoleum
    this.createLampGlow();

    // Minimap click → teleport camera
    cemeteryEvents.on('minimap_click', this.onMinimapClick);

    // Highlight a specific slot (from profile navigation)
    cemeteryEvents.on('highlight_slot', this.onHighlightSlot);

    // Modal state → block/unblock input
    cemeteryEvents.on('modal_state', this.onModalState);

    // Burial ceremony animation
    cemeteryEvents.on('burial_ceremony', this.onBurialCeremony);

    // Zoom buttons (mobile)
    cemeteryEvents.on('zoom_change', this.onZoomChange);

    // Signal React that scene is ready to receive data
    cemeteryEvents.emit('scene_ready', {} as Record<string, never>);

  }

  update() {
    const cam = this.cameras.main;
    const sx = cam.scrollX;
    const sy = cam.scrollY;
    const z = cam.zoom;
    if (
      Math.abs(sx - this.lastCamX) > 5 ||
      Math.abs(sy - this.lastCamY) > 5 ||
      Math.abs(z - this.lastCamZoom) > 0.01
    ) {
      const now = this.time.now;
      if (now - this.lastCamEmit < 50) return;
      this.lastCamEmit = now;
      this.lastCamX = sx;
      this.lastCamY = sy;
      this.lastCamZoom = z;
      cemeteryEvents.emit('camera_move', {
        scrollX: sx,
        scrollY: sy,
        viewWidth: cam.width / z,
        viewHeight: cam.height / z,
        zoom: z,
      });
    }
  }

  private emitMinimapTiles() {
    const w = this.map.width;   // 40
    const h = this.map.height;  // 40
    const tiles = new Uint8Array(w * h);

    // Priority: road > grass/border > ground
    const layerPriority: Array<{ name: string; value: number }> = [
      { name: 'Ground', value: 1 },
      { name: 'Grass', value: 3 },
      { name: 'Borders', value: 3 },
      { name: 'Roads', value: 2 },
    ];

    for (const { name, value } of layerPriority) {
      const layer = this.map.getLayer(name);
      if (!layer) continue;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const tile = layer.data[y]?.[x];
          if (tile && tile.index >= 0) {
            tiles[y * w + x] = value;
          }
        }
      }
    }

    cemeteryEvents.emit('minimap_tiles', { tiles, mapWidth: w, mapHeight: h });
  }

  private createAmbientParticles() {
    // Generate leaf texture (6x4 pixels)
    const leafGfx = this.add.graphics();
    leafGfx.fillStyle(0x8B7355, 1);
    leafGfx.fillRect(1, 0, 4, 1);
    leafGfx.fillRect(0, 1, 6, 2);
    leafGfx.fillRect(2, 3, 3, 1);
    leafGfx.generateTexture('leaf', 6, 4);
    leafGfx.destroy();

    // Generate dust texture (2x2 pixels)
    const dustGfx = this.add.graphics();
    dustGfx.fillStyle(0xddccaa, 1);
    dustGfx.fillRect(0, 0, 2, 2);
    dustGfx.generateTexture('dust', 2, 2);
    dustGfx.destroy();

    const cam = this.cameras.main;

    // Falling leaves
    const leaves = this.add.particles(0, 0, 'leaf', {
      lifespan: 10000,
      speedY: { min: 12, max: 25 },
      speedX: { min: -15, max: 15 },
      scale: { start: 1.5, end: 0.8 },
      alpha: { start: 0.7, end: 0 },
      rotate: { min: 0, max: 360 },
      frequency: -1, // manual emit
    });
    leaves.setDepth(850);

    // Floating dust
    const dust = this.add.particles(0, 0, 'dust', {
      lifespan: 6000,
      speedY: { min: -5, max: 5 },
      speedX: { min: -5, max: 5 },
      scale: { start: 1, end: 0.5 },
      alpha: { start: 0, end: 0.5, ease: 'Sine.easeInOut' },
      frequency: -1, // manual emit
    });
    dust.setDepth(850);

    // Emit particles within camera viewport (slower on mobile)
    const leafDelay = this.isMobile ? 400 : 200;
    const dustDelay = this.isMobile ? 800 : 400;

    this.timers.push(this.time.addEvent({
      delay: leafDelay,
      loop: true,
      callback: () => {
        const vw = cam.width / cam.zoom;
        const x = cam.scrollX + Math.random() * vw;
        const y = cam.scrollY - 10;
        leaves.emitParticleAt(x, y);
      },
    }));

    this.timers.push(this.time.addEvent({
      delay: dustDelay,
      loop: true,
      callback: () => {
        const vw = cam.width / cam.zoom;
        const vh = cam.height / cam.zoom;
        const x = cam.scrollX + Math.random() * vw;
        const y = cam.scrollY + Math.random() * vh;
        dust.emitParticleAt(x, y);
      },
    }));
  }

  private createDayNightCycle() {
    const overlay = this.add.rectangle(960, 960, 1920, 1920);
    overlay.setDepth(895);

    // Phases: [color, alpha, duration in ms]
    const phases: Array<{ color: number; alpha: number; hold: number }> = [
      { color: 0x191035, alpha: 0.18, hold: 15000 },  // Dusk — short
      { color: 0x0a0a20, alpha: 0.30, hold: 25000 },  // Night
      { color: 0x2a1525, alpha: 0.12, hold: 30000 },   // Dawn — 2x dusk
      { color: 0x000000, alpha: 0.0,  hold: 50000 },   // Day — 2x night
    ];

    const PHASE_NAMES = ['dusk', 'night', 'dawn', 'day'] as const;
    let phase = 0;
    cemeteryEvents.emit('day_phase', { phase: PHASE_NAMES[0] });
    const colorObj = { r: 0x19, g: 0x10, b: 0x35, a: 0.18 };

    const applyColor = () => {
      const c = Phaser.Display.Color.GetColor(
        Math.round(colorObj.r),
        Math.round(colorObj.g),
        Math.round(colorObj.b),
      );
      overlay.setFillStyle(c, colorObj.a);
    };

    applyColor();

    const setLampsVisible = (visible: boolean) => {
      for (const gfx of this.lampGraphics) gfx.setVisible(visible);
    };

    const transitionTo = (nextPhase: number) => {
      const p = phases[nextPhase];
      const r = (p.color >> 16) & 0xff;
      const g = (p.color >> 8) & 0xff;
      const b = p.color & 0xff;

      // Lamps off during day (phase 3), on otherwise
      setLampsVisible(nextPhase !== 3);
      cemeteryEvents.emit('day_phase', { phase: PHASE_NAMES[nextPhase] });

      this.tweens.add({
        targets: colorObj,
        r, g, b, a: p.alpha,
        duration: 5000,
        ease: 'Sine.easeInOut',
        onUpdate: applyColor,
        onComplete: () => {
          this.time.delayedCall(p.hold, () => {
            phase = (nextPhase + 1) % phases.length;
            transitionTo(phase);
          });
        },
      });
    };

    // Start cycle: hold first phase, then transition
    this.time.delayedCall(phases[0].hold, () => {
      phase = 1;
      transitionTo(phase);
    });
  }

  private createBuildingLabels() {
    const style: Phaser.Types.GameObjects.Text.TextStyle = {
      fontSize: '14px',
      fontFamily: "'Cinzel', Georgia, serif",
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 3,
      align: 'center',
    };

    // Wait for Cinzel to load before creating labels (canvas needs the font ready)
    document.fonts.load("14px Cinzel").then(() => {
      if (!this.scene.isActive()) return; // scene destroyed while font was loading
      for (const slot of this.slots.values()) {
        if (slot.type !== 'Building' || !slot.name) continue;
        const cx = slot.x + slot.width / 2;
        const ly = slot.name === 'Crematory' ? slot.y + 12 : slot.y - 8;
        const displayName = slot.name === 'Mausoleum' ? 'The Crypt' : slot.name;
        const label = this.add.text(cx, ly, displayName.toUpperCase(), style);
        label.setOrigin(0.5, slot.name === 'Crematory' ? 0 : 1);
        label.setDepth(800);
      }
    });
  }

  private createFogVignette() {
    const MAP = 1920;
    const DEPTH = 144; // 3 tiles of fog
    const STEPS = 24;
    const STEP_W = DEPTH / STEPS;
    const color = 0x1a1a2e;

    // Crematory light zone (torches at x:576 and x:768, building x:609-786)
    const LIGHT_X1 = 500;
    const LIGHT_X2 = 870;
    const LIGHT_Y = 240; // light reaches ~5 tiles down

    const fog = this.add.graphics();
    fog.setDepth(900);

    for (let i = 0; i < STEPS; i++) {
      const t = i / STEPS;
      const alpha = 0.8 * (1 - t) * (1 - t);
      const offset = Math.round(DEPTH * t);

      fog.fillStyle(color, alpha);

      // Left edge
      fog.fillRect(offset, 0, STEP_W, MAP);
      // Right edge
      fog.fillRect(MAP - offset - STEP_W, 0, STEP_W, MAP);

      // Top edge — split around crematory light zone
      if (offset < LIGHT_Y) {
        // Fade out near the light: reduce alpha as we get closer to the light zone
        const lightFade = Math.max(0, alpha * (1 - (LIGHT_Y - offset) / LIGHT_Y * 0.5));
        fog.fillStyle(color, alpha);
        fog.fillRect(0, offset, LIGHT_X1, STEP_W);
        fog.fillRect(LIGHT_X2, offset, MAP - LIGHT_X2, STEP_W);
        // Soft transition into light zone
        fog.fillStyle(color, lightFade * 0.3);
        fog.fillRect(LIGHT_X1, offset, LIGHT_X2 - LIGHT_X1, STEP_W);
      } else {
        fog.fillRect(0, offset, MAP, STEP_W);
      }

      // Bottom edge
      fog.fillRect(0, MAP - offset - STEP_W, MAP, STEP_W);
    }

    // Warm glow around fire torches
    const glow = this.add.graphics();
    glow.setDepth(899);
    const torchPixels = [
      { x: 600, y: 72 },  // left torch (tile 12,1)
      { x: 792, y: 72 },  // right torch (tile 16,1)
    ];
    const glowRadius = 120;
    const GLOW_STEPS = 16;
    for (const torch of torchPixels) {
      for (let i = GLOW_STEPS; i >= 0; i--) {
        const r = glowRadius * (i / GLOW_STEPS);
        const a = 0.07 * (1 - i / GLOW_STEPS);
        glow.fillStyle(0xff6600, a);
        glow.fillCircle(torch.x, torch.y, r);
      }
    }
  }

  private createLampGlow() {
    const GLOW_STEPS = 10;

    // Helper: draw radial glow on a graphics object
    const drawCircleGlow = (
      gfx: Phaser.GameObjects.Graphics,
      cx: number, cy: number,
      radius: number, color: number, intensity: number,
    ) => {
      for (let i = GLOW_STEPS; i >= 0; i--) {
        const r = radius * (i / GLOW_STEPS);
        const a = intensity * (1 - i / GLOW_STEPS);
        gfx.fillStyle(color, a);
        gfx.fillCircle(cx, cy, r);
      }
    };

    // --- Mausoleum lamps (warm orange, steady pulse, redrawn via timer) ---
    const mausGfx = this.add.graphics();
    mausGfx.setDepth(899);
    const mausPulse = { alpha: 1.0 };
    const drawMaus = () => {
      mausGfx.clear();
      for (const lamp of MAUSOLEUM_LAMPS) {
        drawCircleGlow(mausGfx, lamp.x, lamp.y, 80, 0xffaa44, 0.06 * mausPulse.alpha);
      }
    };
    drawMaus();
    this.tweens.add({ targets: mausPulse, alpha: 0.75, duration: 2000, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    this.timers.push(this.time.addEvent({ delay: this.isMobile ? 250 : 100, loop: true, callback: drawMaus }));

    // --- Blue working lamps (steady with subtle pulse, redrawn via timer not per-frame) ---
    const blueGfx = this.add.graphics();
    blueGfx.setDepth(899);
    const bluePulse = { alpha: 1.0 };
    const COLOR_BLUE = 0x88aadd;
    const drawAllBlue = () => {
      blueGfx.clear();
      for (const lamp of BLUE_LAMPS_WORKING) {
        const intensity = lamp.bright ? 0.07 : 0.045;
        const radius = lamp.bright ? 70 : 55;
        drawCircleGlow(blueGfx, lamp.x + 24, lamp.y + 24, radius, COLOR_BLUE, intensity * bluePulse.alpha);
      }
    };
    drawAllBlue();
    this.tweens.add({ targets: bluePulse, alpha: 0.8, duration: 3000, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    this.timers.push(this.time.addEvent({ delay: this.isMobile ? 250 : 100, loop: true, callback: drawAllBlue }));

    // --- Blue broken lamps (each flickers independently) ---
    const brokenGfx = this.add.graphics();
    brokenGfx.setDepth(899);
    const brokenAlphas = BLUE_LAMPS_BROKEN.map(() => 0.3);
    const drawBroken = () => {
      brokenGfx.clear();
      for (let i = 0; i < BLUE_LAMPS_BROKEN.length; i++) {
        const lamp = BLUE_LAMPS_BROKEN[i];
        drawCircleGlow(brokenGfx, lamp.x + 24, lamp.y + 24, 45, COLOR_BLUE, 0.03 * brokenAlphas[i]);
      }
    };
    drawBroken();
    this.timers.push(this.time.addEvent({
      delay: this.isMobile ? 300 : 120,
      loop: true,
      callback: () => {
        for (let i = 0; i < brokenAlphas.length; i++) {
          const roll = Math.random();
          if (roll < 0.12) brokenAlphas[i] = 0;
          else if (roll < 0.35) brokenAlphas[i] = 0.2 + Math.random() * 0.3;
          else if (roll < 0.65) brokenAlphas[i] = 0.5 + Math.random() * 0.3;
          else brokenAlphas[i] = 0.85 + Math.random() * 0.15;
        }
        drawBroken();
      },
    }));

    // Store references for day/night visibility control
    this.lampGraphics = [mausGfx, blueGfx, brokenGfx];
  }

  private animateFire() {
    if (!this.fireLayer) return;
    this.fireFrame = (this.fireFrame + 1) % FIRE_FRAMES.length;
    for (const torch of FIRE_TORCHES) {
      const frame = FIRE_FRAMES[(this.fireFrame + torch.offset) % FIRE_FRAMES.length];
      this.fireLayer.putTileAt(frame.top, torch.x, torch.y);
      this.fireLayer.putTileAt(frame.bottom, torch.x, torch.y + 1);
    }
  }

  private hoverHighlight: Phaser.GameObjects.Graphics | null = null;

  private setupInteractiveZones() {
    this.hoverHighlight = this.add.graphics();
    this.hoverHighlight.setDepth(1000);

    for (const slot of this.slots.values()) {
      const zone = this.add.zone(
        slot.x + slot.width / 2,
        slot.y + slot.height / 2,
        slot.width,
        slot.height,
      ).setInteractive();

      const getEventData = (): SlotEventData => {
        const cam = this.cameras.main;
        const centerX = slot.x + slot.width / 2;
        const topY = slot.y;
        return {
          slotId: slot.id,
          type: slot.type,
          name: slot.name,
          x: slot.x,
          y: slot.y,
          width: slot.width,
          height: slot.height,
          screenX: (centerX - cam.scrollX) * cam.zoom,
          screenY: (topY - cam.scrollY) * cam.zoom,
        };
      };

      const isInteractive = () =>
        slot.type === 'Building' || slot.type === 'meta_grave' || this.renderedSlots.has(slot.id);

      zone.on('pointerup', () => {
        if (this.dragDistance > 5) return;

        if (slot.type === 'Building') {
          cemeteryEvents.emit('building_click', getEventData());
        } else if (isInteractive()) {
          cemeteryEvents.emit('grave_click', getEventData());
        }
      });

      zone.on('pointerover', () => {
        if (!isInteractive()) return;
        this.drawSlotHighlight(slot.x, slot.y, slot.width, slot.height, slot.type);
        cemeteryEvents.emit('grave_hover', getEventData());
      });

      zone.on('pointerout', () => {
        this.hoverHighlight?.clear();
        cemeteryEvents.emit('grave_hover_end', getEventData());
      });
    }
  }

  private drawSlotHighlight(x: number, y: number, w: number, h: number, type: string) {
    if (!this.hoverHighlight) return;
    this.hoverHighlight.clear();

    const color = type === 'Building' ? 0xffcc00 : 0x44ff88;
    // Fill
    this.hoverHighlight.fillStyle(color, 0.15);
    this.hoverHighlight.fillRect(x, y, w, h);
    // Border
    this.hoverHighlight.lineStyle(1, color, 0.6);
    this.hoverHighlight.strokeRect(x, y, w, h);
  }

  private renderedSlots = new Set<number>();

  // Named EventBus handlers (for proper cleanup in shutdown)
  private onRenderGraves = (data: { graves: RenderGraveData[] }) => {
    for (const g of data.graves) this.renderGraveOnMap(g);
  };
  private onRenderGrave = (data: RenderGraveData) => {
    this.renderGraveOnMap(data);
  };

  private isCeremonyBlockingInput() {
    return this.ceremonyScheduled || this.ceremonyInProgress || !!this.pendingCeremony;
  }

  private onMinimapClick = (data: MinimapClickData) => {
    if (this.isCeremonyBlockingInput()) return;
    const cam = this.cameras?.main;
    if (!cam) return;
    const vw = cam.width / cam.zoom;
    const vh = cam.height / cam.zoom;
    const targetX = Phaser.Math.Clamp(data.worldX - vw / 2, 0, Math.max(0, 1920 - vw));
    const targetY = Phaser.Math.Clamp(data.worldY - vh / 2, 0, Math.max(0, 1920 - vh));
    this.tweens.add({
      targets: cam,
      scrollX: targetX,
      scrollY: targetY,
      duration: 300,
      ease: 'Sine.easeOut',
    });
  };

  private onModalState = (data: { open: boolean }) => {
    this.modalOpen = data.open;
    // Start ceremony after bury modal closes (200ms buffer for CSS fade-out)
    if (!data.open && this.pendingCeremony && this.buryModalOpen && !this.ceremonyScheduled) {
      const ceremonyData = this.pendingCeremony;
      this.pendingCeremony = null;
      this.buryModalOpen = false;
      this.ceremonyScheduled = true;
      this.input.enabled = false;
      this.timers.push(this.time.delayedCall(200, () => {
        this.playBurialCeremony(ceremonyData);
      }));
      return;
    }
    this.input.enabled = !data.open && !this.ceremonyScheduled && !this.ceremonyInProgress && !this.pendingCeremony;
  };

  private slotHighlightGfx: Phaser.GameObjects.Graphics | null = null;
  private slotHighlightTimer: Phaser.Time.TimerEvent | null = null;

  private onHighlightSlot = (data: { slotId: number }) => {
    const slot = this.slots.get(data.slotId);
    if (!slot) return;

    // Cancel previous highlight animation if still running
    if (this.slotHighlightTimer) {
      this.slotHighlightTimer.destroy();
      this.slotHighlightTimer = null;
    }

    if (!this.slotHighlightGfx) {
      this.slotHighlightGfx = this.add.graphics();
      this.slotHighlightGfx.setDepth(999);
    }

    const gfx = this.slotHighlightGfx;
    gfx.clear();
    const color = 0x44ff88;
    const { x, y, width: w, height: h } = slot;

    // Pulse 6 times over ~5s then fade out
    let elapsed = 0;
    const duration = 5000;
    const pulseFreq = 6;

    const timer = this.time.addEvent({
      delay: 30,
      loop: true,
      callback: () => {
        elapsed += 30;
        const t = elapsed / duration;
        if (t >= 1) {
          gfx.clear();
          timer.destroy();
          return;
        }
        // Pulse alpha: sin wave that fades out
        const pulse = Math.sin(t * pulseFreq * Math.PI * 2) * 0.5 + 0.5;
        const fadeOut = 1 - t;
        const alpha = pulse * fadeOut;

        gfx.clear();
        gfx.fillStyle(color, alpha * 0.25);
        gfx.fillRect(x, y, w, h);
        gfx.lineStyle(2, color, alpha * 0.8);
        gfx.strokeRect(x, y, w, h);
      },
    });
    this.slotHighlightTimer = timer;
  };


  private onZoomChange = (data: { delta: number }) => {
    if (this.isCeremonyBlockingInput()) return;
    const cam = this.cameras.main;
    if (!cam) return;
    this.stopCameraMotion(cam);
    const newZoom = Phaser.Math.Clamp(cam.zoom + data.delta, this.minZoom, 2.0);
    cam.setZoom(newZoom);
    // Clamp scroll into valid range after zoom change
    const vw = cam.width / newZoom;
    const vh = cam.height / newZoom;
    cam.scrollX = Phaser.Math.Clamp(cam.scrollX, 0, Math.max(0, 1920 - vw));
    cam.scrollY = Phaser.Math.Clamp(cam.scrollY, 0, Math.max(0, 1920 - vh));
  };

  private onBurialCeremony = (data: { slot_id: number; id: string; name: string }) => {
    if (this.ceremonyInProgress || this.ceremonyScheduled || this.pendingCeremony) {
      this.ceremonyQueue.push(data);
      return;
    }
    this.pendingCeremony = data;
    this.buryModalOpen = true; // track that the bury modal is the one currently open
    if (!this.modalOpen) {
      const ceremonyData = this.pendingCeremony;
      this.pendingCeremony = null;
      this.buryModalOpen = false;
      this.ceremonyScheduled = true;
      this.input.enabled = false;
      this.timers.push(this.time.delayedCall(200, () => {
        this.playBurialCeremony(ceremonyData);
      }));
    }
  };

  private stopCameraMotion(cam: Phaser.Cameras.Scene2D.Camera) {
    this.tweens.killTweensOf(cam);
    const cameraEffects = cam as Phaser.Cameras.Scene2D.Camera & {
      panEffect?: { reset: () => void };
      zoomEffect?: { reset: () => void };
    };
    cameraEffects.panEffect?.reset();
    cameraEffects.zoomEffect?.reset();
  }

  private clampCameraCenter(cam: Phaser.Cameras.Scene2D.Camera, targetX: number, targetY: number, zoom: number) {
    const halfW = cam.width / (zoom * 2);
    const halfH = cam.height / (zoom * 2);
    return {
      x: Phaser.Math.Clamp(targetX, halfW, 1920 - halfW),
      y: Phaser.Math.Clamp(targetY, halfH, 1920 - halfH),
    };
  }

  private finishBurialCeremony(slotId: number) {
    this.ceremonyInProgress = false;
    const next = this.ceremonyQueue.shift();
    const willContinue = Boolean(next);
    cemeteryEvents.emit('burial_ceremony_done', { slot_id: slotId, willContinue });
    if (next) {
      this.ceremonyScheduled = true;
      this.input.enabled = false;
      this.timers.push(this.time.delayedCall(200, () => {
        this.playBurialCeremony(next);
      }));
      return;
    }
    this.input.enabled = !this.modalOpen;
  }

  private playBurialCeremony(data: { slot_id: number; id: string; name: string }) {
    this.ceremonyScheduled = false;
    const slot = this.slots.get(data.slot_id);
    if (!slot) {
      // Fallback: render instantly
      this.renderGraveOnMap(data);
      this.finishBurialCeremony(data.slot_id);
      return;
    }

    this.ceremonyInProgress = true;
    // Disable input during ceremony
    this.input.enabled = false;

    const cam = this.cameras.main;
    this.stopCameraMotion(cam);
    const cx = slot.x + slot.width / 2;
    const cy = slot.y + slot.height / 2;
    const originalZoom = cam.zoom;
    const CEREMONY_ZOOM = 1.5;
    const dest = this.clampCameraCenter(cam, cx, cy, CEREMONY_ZOOM);

    // Phase 1: Camera pan + zoom to slot (1200ms)
    // Tween a proxy object, apply centerOn each frame so slot stays centered at any zoom
    const panTarget = { x: cam.midPoint.x, y: cam.midPoint.y, zoom: cam.zoom };
    this.tweens.add({
      targets: panTarget,
      x: dest.x,
      y: dest.y,
      zoom: CEREMONY_ZOOM,
      duration: 1200,
      ease: 'Sine.easeInOut',
      onUpdate: () => {
        cam.setZoom(panTarget.zoom);
        const clamped = this.clampCameraCenter(cam, panTarget.x, panTarget.y, panTarget.zoom);
        cam.centerOn(clamped.x, clamped.y);
      },
      onComplete: () => {
        // Phase 2: Dirt burst + shake (1000ms)
        this.playDirtBurst(cx, cy);
        cam.shake(300, 0.005);

        this.timers.push(this.time.delayedCall(1000, () => {
          // Phase 3: Render grave + reveal (800ms)
          this.renderGraveOnMap(data);
          this.playGraveReveal(slot, () => {
            // Phase 4: R.I.P. + gold glow (1600ms)
            this.playRIPGlow(slot, data.name, () => {
              // Phase 5: Zoom out (800ms) — keep centered on grave
              const zoomOut = { zoom: cam.zoom };
              this.tweens.add({
                targets: zoomOut,
                zoom: Math.max(originalZoom, 1.0),
                duration: 800,
                ease: 'Sine.easeInOut',
                onUpdate: () => {
                  cam.setZoom(zoomOut.zoom);
                  const clamped = this.clampCameraCenter(cam, cx, cy, zoomOut.zoom);
                  cam.centerOn(clamped.x, clamped.y);
                },
                onComplete: () => {
                  this.finishBurialCeremony(data.slot_id);
                },
              });
            });
          });
        }));
      },
    });
  }

  private playDirtBurst(cx: number, cy: number) {
    // Generate dirt texture if not already created
    if (!this.textures.exists('dirt')) {
      const gfx = this.add.graphics();
      gfx.fillStyle(0x8B6914, 1);
      gfx.fillRect(0, 0, 4, 4);
      gfx.generateTexture('dirt', 4, 4);
      gfx.destroy();
    }

    const particles = this.add.particles(cx, cy, 'dirt', {
      speed: { min: 80, max: 200 },
      angle: { min: 240, max: 300 },
      scale: { start: 1.5, end: 0.5 },
      alpha: { start: 1, end: 0 },
      lifespan: 800,
      gravityY: 300,
      quantity: 20,
      emitting: false,
    });
    particles.setDepth(920);
    particles.explode(20);
    this.ceremonyObjects.push(particles);

    this.timers.push(this.time.delayedCall(1000, () => {
      particles.destroy();
    }));
  }

  private playGraveReveal(slot: SlotData, onComplete: () => void) {
    const rect = this.add.rectangle(
      slot.x + slot.width / 2,
      slot.y + slot.height / 2,
      slot.width,
      slot.height,
      0x1a1a2e,
      1.0,
    );
    rect.setDepth(910);
    this.ceremonyObjects.push(rect);

    this.tweens.add({
      targets: rect,
      alpha: 0,
      duration: 800,
      ease: 'Sine.easeInOut',
      onComplete: () => {
        rect.destroy();
        onComplete();
      },
    });
  }

  private playRIPGlow(slot: SlotData, name: string, onComplete: () => void) {
    const cx = slot.x + slot.width / 2;
    const cy = slot.y + slot.height / 2;

    // Gold glow circle
    const GLOW_STEPS = 10;
    const glowGfx = this.add.graphics();
    glowGfx.setDepth(905);
    this.ceremonyObjects.push(glowGfx);
    const glowState = { intensity: 0 };

    const drawGlow = () => {
      glowGfx.clear();
      for (let i = GLOW_STEPS; i >= 0; i--) {
        const r = 60 * (i / GLOW_STEPS);
        const a = glowState.intensity * 0.08 * (1 - i / GLOW_STEPS);
        glowGfx.fillStyle(0xe8d5a3, a);
        glowGfx.fillCircle(cx, cy, r);
      }
    };

    // Glow tween: fade in → pulse → fade out
    this.tweens.add({
      targets: glowState,
      intensity: 1,
      duration: 400,
      ease: 'Sine.easeIn',
      onUpdate: drawGlow,
      onComplete: () => {
        this.tweens.add({
          targets: glowState,
          intensity: 0.6,
          duration: 600,
          yoyo: true,
          ease: 'Sine.easeInOut',
          onUpdate: drawGlow,
          onComplete: () => {
            this.tweens.add({
              targets: glowState,
              intensity: 0,
              duration: 400,
              ease: 'Sine.easeOut',
              onUpdate: drawGlow,
              onComplete: () => {
                glowGfx.destroy();
              },
            });
          },
        });
      },
    });

    // R.I.P. text
    const ripText = this.add.text(cx, cy - 10, 'R.I.P.', {
      fontSize: '16px',
      fontFamily: "'Cinzel', Georgia, serif",
      color: '#e8d5a3',
      stroke: '#000000',
      strokeThickness: 3,
      align: 'center',
    });
    ripText.setOrigin(0.5, 0.5);
    ripText.setDepth(915);
    ripText.setAlpha(0);
    this.ceremonyObjects.push(ripText);

    // Repo name text below R.I.P.
    const nameText = this.add.text(cx, cy + 8, name, {
      fontSize: '11px',
      fontFamily: "'Cinzel', Georgia, serif",
      color: '#e8d5a3',
      stroke: '#000000',
      strokeThickness: 2,
      align: 'center',
    });
    nameText.setOrigin(0.5, 0.5);
    nameText.setDepth(915);
    nameText.setAlpha(0);
    this.ceremonyObjects.push(nameText);

    // Float up + fade in, then fade out
    this.tweens.add({
      targets: [ripText, nameText],
      y: '-=30',
      alpha: 1,
      duration: 800,
      ease: 'Sine.easeOut',
      onComplete: () => {
        this.timers.push(this.time.delayedCall(200, () => {
          this.tweens.add({
            targets: [ripText, nameText],
            alpha: 0,
            duration: 600,
            ease: 'Sine.easeIn',
            onComplete: () => {
              ripText.destroy();
              nameText.destroy();
              onComplete();
            },
          });
        }));
      },
    });
  }

  private playCremationEffect(crematory: SlotData) {
    this.ceremonyInProgress = true;
    this.input.enabled = false;

    const cam = this.cameras.main;
    const cx = crematory.x + crematory.width / 2;
    const cy = crematory.y + crematory.height / 2;
    const originalZoom = cam.zoom;
    const CEREMONY_ZOOM = 1.4;

    // Generate smoke texture if needed
    if (!this.textures.exists('smoke')) {
      const gfx = this.add.graphics();
      gfx.fillStyle(0x888888, 1);
      gfx.fillCircle(4, 4, 4);
      gfx.generateTexture('smoke', 8, 8);
      gfx.destroy();
    }

    // Generate ember texture if needed
    if (!this.textures.exists('ember')) {
      const gfx = this.add.graphics();
      gfx.fillStyle(0xff6600, 1);
      gfx.fillRect(0, 0, 3, 3);
      gfx.generateTexture('ember', 3, 3);
      gfx.destroy();
    }

    // Clamp center so viewport stays within 0–1920 map bounds
    const clampCenter = (targetX: number, targetY: number, z: number) => {
      const halfW = cam.width / (z * 2);
      const halfH = cam.height / (z * 2);
      return {
        x: Phaser.Math.Clamp(targetX, halfW, 1920 - halfW),
        y: Phaser.Math.Clamp(targetY, halfH, 1920 - halfH),
      };
    };

    // Phase 1: Camera pan to crematory (1000ms)
    const panTarget = { x: cam.midPoint.x, y: cam.midPoint.y, zoom: cam.zoom };
    const dest = clampCenter(cx, cy, CEREMONY_ZOOM);
    this.tweens.add({
      targets: panTarget,
      x: dest.x,
      y: dest.y,
      zoom: CEREMONY_ZOOM,
      duration: 1000,
      ease: 'Sine.easeInOut',
      onUpdate: () => {
        const clamped = clampCenter(panTarget.x, panTarget.y, panTarget.zoom);
        cam.centerOn(clamped.x, clamped.y);
        cam.setZoom(panTarget.zoom);
      },
      onComplete: () => {
        // Chimney top — above the building
        const chimneyX = cx;
        const chimneyY = crematory.y - 10;

        // Phase 2: Fire burst from chimney (embers shooting up)
        const embers = this.add.particles(chimneyX, chimneyY, 'ember', {
          speed: { min: 60, max: 180 },
          angle: { min: 250, max: 290 },
          scale: { start: 1.5, end: 0.3 },
          alpha: { start: 1, end: 0 },
          lifespan: { min: 600, max: 1200 },
          gravityY: -50,
          quantity: 3,
          frequency: 50,
          tint: [0xff6600, 0xff4400, 0xffaa00, 0xff2200],
        });
        embers.setDepth(920);
        this.ceremonyObjects.push(embers);

        // Phase 2b: Smoke rising from chimney
        const smoke = this.add.particles(chimneyX, chimneyY - 20, 'smoke', {
          speed: { min: 15, max: 40 },
          angle: { min: 260, max: 280 },
          scale: { start: 0.5, end: 3 },
          alpha: { start: 0.4, end: 0 },
          lifespan: { min: 2000, max: 3500 },
          gravityY: -30,
          quantity: 1,
          frequency: 100,
          tint: [0x666666, 0x888888, 0x555555],
        });
        smoke.setDepth(919);
        this.ceremonyObjects.push(smoke);

        // Camera micro-shake
        cam.shake(500, 0.003);

        // Orange glow at chimney base
        const glowGfx = this.add.graphics();
        glowGfx.setDepth(905);
        this.ceremonyObjects.push(glowGfx);
        const glowState = { intensity: 0 };

        this.tweens.add({
          targets: glowState,
          intensity: 1,
          duration: 400,
          yoyo: true,
          hold: 1500,
          ease: 'Sine.easeInOut',
          onUpdate: () => {
            glowGfx.clear();
            for (let i = 10; i >= 0; i--) {
              const r = 50 * (i / 10);
              const a = glowState.intensity * 0.1 * (1 - i / 10);
              glowGfx.fillStyle(0xff6600, a);
              glowGfx.fillCircle(chimneyX, chimneyY, r);
            }
          },
          onComplete: () => glowGfx.destroy(),
        });

        // "ASHES TO ASHES" text
        const ashText = this.add.text(cx, cy - 20, 'ASHES TO ASHES', {
          fontSize: '14px',
          fontFamily: "'Cinzel', Georgia, serif",
          color: '#ff9944',
          stroke: '#000000',
          strokeThickness: 3,
          align: 'center',
        });
        ashText.setOrigin(0.5, 0.5);
        ashText.setDepth(915);
        ashText.setAlpha(0);
        this.ceremonyObjects.push(ashText);

        this.tweens.add({
          targets: ashText,
          y: cy - 50,
          alpha: 1,
          duration: 800,
          ease: 'Sine.easeOut',
          onComplete: () => {
            this.timers.push(this.time.delayedCall(1200, () => {
              this.tweens.add({
                targets: ashText,
                alpha: 0,
                duration: 600,
                ease: 'Sine.easeIn',
                onComplete: () => ashText.destroy(),
              });
            }));
          },
        });

        // Phase 3: Stop particles + zoom out after 3s
        this.timers.push(this.time.delayedCall(2500, () => {
          embers.stop();
          smoke.stop();
        }));

        this.timers.push(this.time.delayedCall(3500, () => {
          embers.destroy();
          smoke.destroy();

          const zoomOut = { zoom: cam.zoom };
          const targetZoom = Math.max(originalZoom, 1.0);
          this.tweens.add({
            targets: zoomOut,
            zoom: targetZoom,
            duration: 800,
            ease: 'Sine.easeInOut',
            onUpdate: () => {
              cam.setZoom(zoomOut.zoom);
              const clamped = clampCenter(cx, cy, zoomOut.zoom);
              cam.centerOn(clamped.x, clamped.y);
            },
            onComplete: () => {
              this.ceremonyInProgress = false;
              this.input.enabled = !this.modalOpen;
            },
          });
        }));
      },
    });
  }

  shutdown() {
    if (this.cleanedUp) return;
    this.cleanedUp = true;

    // EventBus listeners
    cemeteryEvents.off('render_graves', this.onRenderGraves);
    cemeteryEvents.off('render_grave', this.onRenderGrave);
    cemeteryEvents.off('minimap_click', this.onMinimapClick);
    cemeteryEvents.off('highlight_slot', this.onHighlightSlot);
    cemeteryEvents.off('modal_state', this.onModalState);
    cemeteryEvents.off('burial_ceremony', this.onBurialCeremony);
    cemeteryEvents.off('zoom_change', this.onZoomChange);
    this.pendingCeremony = null;
    this.ceremonyQueue = [];
    this.ceremonyScheduled = false;
    this.buryModalOpen = false;
    // Destroy any ceremony game objects left mid-animation
    for (const obj of this.ceremonyObjects) {
      if (obj && obj.active) obj.destroy();
    }
    this.ceremonyObjects = [];
    this.ceremonyInProgress = false;
    // Clean up generated textures from global TextureManager
    if (this.textures.exists('dirt')) {
      this.textures.remove('dirt');
    }
    if (this.textures.exists('smoke')) this.textures.remove('smoke');
    if (this.textures.exists('ember')) this.textures.remove('ember');
    if (this.textures.exists('leaf')) this.textures.remove('leaf');
    if (this.textures.exists('dust')) this.textures.remove('dust');

    // All looping timers (fire, particles, lamp glow)
    for (const t of this.timers) t.destroy();
    this.timers = [];

    // Slot highlight timer
    if (this.slotHighlightTimer) {
      this.slotHighlightTimer.destroy();
      this.slotHighlightTimer = null;
    }

    // Stop all tweens (day/night, lamp pulses, camera snaps)
    this.tweens.killAll();

    // Phaser input listeners (pointerdown, pointermove, pointerup, wheel)
    this.input.off('pointerdown');
    this.input.off('pointermove');
    this.input.off('pointerup');
    this.input.off('wheel');

    this.renderedSlots.clear();
    this.gravesLayer = null;
    this.fireLayer = null;
    this.slots.clear();
  }

  private renderGraveOnMap(grave: RenderGraveData) {
    if (this.renderedSlots.has(grave.slot_id)) return;
    const slot = this.slots.get(grave.slot_id);
    if (!slot || !this.gravesLayer) return;

    const tileX = Math.floor(slot.x / 48);
    const tileY = Math.floor(slot.y / 48);
    const variant = pickTileVariant(slot.type, grave.slot_id);
    renderGrave(this.gravesLayer, tileX, tileY, slot.type, variant);
    this.renderedSlots.add(grave.slot_id);
  }
}
