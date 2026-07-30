import * as Phaser from 'phaser';
import { parseSlotsV2, SlotData } from '../utils/slotManager-v2';
import { pickGraveGidV2 } from '../utils/tileRegistry-v2';
import { getTiledObjectBounds, getTiledObjectCenter } from '../utils/tiledObject';
import { paintMinimapLayer } from '../utils/minimapRaster';
import {
  CAMERA_FOG_OVERSCROLL_V2,
  CAMERA_FOG_REST_BUFFER_V2,
  constrainCameraScrollToFog,
  getPlayableCameraScrollBounds,
  type CameraScrollBounds,
  type FogClearAnchor,
} from '../utils/fogCameraBounds';
import { cemeteryEvents, SlotEventData, RenderGraveData, MinimapClickData, SyncGravesData } from '../events';
import { isSameRenderedGrave, planGraveReconciliation } from '../graveReconciliation';
import { CEMETERY_MAP_V2_URL } from '../../lib/map-version';

const MAP_TILES_X = 140;
const MAP_TILES_Y = 104;
const TILE_SIZE = 32;
const WORLD_W = MAP_TILES_X * TILE_SIZE;
const WORLD_H = MAP_TILES_Y * TILE_SIZE;
const CAMERA_FOG_SAFETY_WORLD_BOUNDS_V2 = {
  minX: -CAMERA_FOG_OVERSCROLL_V2,
  minY: -CAMERA_FOG_OVERSCROLL_V2,
  maxX: WORLD_W + CAMERA_FOG_OVERSCROLL_V2,
  maxY: WORLD_H + CAMERA_FOG_OVERSCROLL_V2,
};
const BUILDING_LABEL_GAP_V2 = 4;
const BUILDING_LABEL_STACK_GAP_V2 = 4;
// Stay over world sprites while still receiving the day/night overlay and fog.
const BUILDING_LABEL_DEPTH_V2 = 880;
const BUILDING_SHADOW_DEPTH_V2 = 699;
const BUILDING_PREVIEW_DEPTH_V2 = 700;
const MAIN_GATE_PREVIEW_DEPTH_V2 = 701;
const BUILDING_SHADOW_X_OFFSET_V2 = 5;
const BUILDING_SHADOW_Y_OFFSET_V2 = 2;
const BUILDING_SHADOW_TINT_V2 = 0x0b100c;
const BUILDING_SHADOW_ALPHA_V2 = 0.3;
// Dynamic grave sprites use a softer, smaller version of the same grounded
// silhouette treatment as buildings, so a freshly placed grave does not float.
const GRAVE_SHADOW_DEPTH_V2 = 799;
const GRAVE_SHADOW_X_OFFSET_V2 = 3;
const GRAVE_SHADOW_Y_OFFSET_V2 = 1;
const GRAVE_SHADOW_TINT_V2 = 0x0b100c;
const GRAVE_SHADOW_ALPHA_V2 = 0.3;
// The source PNGs have different transparent padding below their visible base.
// Keep each flattened silhouette grounded on the opaque pixels, not its frame edge.
const BUILDING_SHADOW_BASE_INSET_V2: Record<string, number> = {
  chapel_8d_160x256_lowdetail_palette: 1,
  gravedigger_lodge_sysadmin_complete_map4: 9,
  service_garage_2x3_map4: 10,
  service_technical_building_4x5_map4: 17,
  main_gate_1ds_q4_full_320x160_map4_compare: 9,
  side_wicket_chek_q1_extensions_512x96_map4_compare: 11,
};
const TREE_SHADOW_DEPTH_V2 = 599;
const TREE_SHADOW_Y_OFFSET_V2 = 2;
// Non-empty terrain extent in Cemetery Map 2.0. Camera movement must never expose the
// padded world grid around it.
const PLAYABLE_WORLD_BOUNDS_V2 = { minX: 800, minY: 1312, maxX: 3328, maxY: 3328 };
// These source PNGs retain different amounts of transparent padding below the
// visible roots. Anchor shadows at the opaque tree base, not the image edge.
const TREE_SHADOW_ROOT_INSET_V2: Record<number, number> = {
  35: 22,
  36: 18,
  37: 13,
  38: 5,
  39: 6,
  40: 9,
  41: 3,
  42: 11,
  43: 15,
  44: 14,
  45: 8,
  46: 10,
  47: 12,
  48: 9,
  49: 11,
  50: 13,
};

const TILESET_BASE_URL = '/map';

const TILESET_NAMES_V2 = [
  'red_road_line',
  'blockout_tiles',
  'grass_flagstone_spritesheet',
  'chapel_8d_160x256_preserve_aspect',
  'chapel_8d_160x256_lowdetail_palette',
  'gravedigger_lodge_sysadmin_complete_map4',
  'service_technical_building_4x5_map4',
  'service_garage_2x3_map4',
  'main_gate_1ds_q4_full_320x160_map4_compare',
  'side_wicket_chek_q1_extensions_512x96_map4_compare',
  'inner_wicket_gate_3x3_fc3701e6',
  'tree_cluster_b_dead_branch_cluster_96x96_672af227',
  'tree_cluster_c_mixed_moss_oaks_96x96_e61d00b7',
  'tree_tall_thin_cypress_c_dead_spire_32x96_387da91e',
  'tree_small_thin_a_crooked_sapling_32x64_2f5d3182_clean_no_soil',
  'tree_small_thin_b_dark_yew_32x64_066c250a_clean_no_soil',
  'tree_tall_thin_cypress_a_straight_32x96_533454c2_clean_no_soil',
  'tree_tall_thin_cypress_b_bent_32x96_59a95dc6_clean_no_soil',
  'tree_medium_c_dark_leafy_yew_64x96_b43f7f4d_clean_no_soil',
  'tree_round_leafy_large_a_old_oak_96x128_330f4e2f_clean_no_soil',
  'tree_hero_old_b_dead_witness_tree_96x160_2eccfb1a_clean_no_soil',
  'tree_small_thin_c_dead_shrub_tree_32x64_dac67e5b_clean_no_soil',
  'tree_medium_b_crooked_deadwood_64x96_9556f66f_clean_no_soil',
  'tree_round_leafy_large_b_broad_mossy_tree_96x128_802c5e35_clean_no_soil',
  'shrub_2x2_a_dense_yew_64x64_1c29a773',
  'shrub_2x2_b_dead_bramble_64x64_53a2a4a2',
  'shrub_2x2_e_mossy_thorn_retry_64x64_da8a43c3',
  'grave_1x2_batch08_del_key_cross_style_v2_586efee3',
  'grave_1x2_microchip_cross_090b565c',
  'grave_1x2_broken_keyboard_slab_63b07f55',
  'grave_1x2_dead_disk_slab_ce37aadc',
  'grave_1x2_server_panel_slab_c1262087',
  'grave_1x2_cracked_crt_slab_f4e23bcb',
  'grave_1x2_hourglass_inlay_slab_b9b476ad',
  'grave_1x2_concrete_capacitor_slab_44577a41',
  'grave_1x2_marble_iron_heatsink_slab_52a98cb4',
  'grave_1x2_iron_pci_slot_slab_99bbf84d',
  'grave_1x2_batch08_numpad_plus_key_cross_style_9a47775a',
  'grave_1x2_gpu_memory_slab_3d5b1ba6',
  'grave_1x2_atx_power_connector_slab_1d45172d',
  'batch06_01_laptop_4c95c269',
  'batch06_03_mvp_monolith_0351632b',
  'batch06_05_spinner_d80d6e79',
  'batch06_10_merge_conflict_7e179831',
  'batch06_15_zip_archive_df472bd8',
  'batch06_16_kanban_740c7863',
  'batch06_17_chatbot_08238e46',
  'batch06_18_api_endpoint_f7cdbd63',
  'batch06_19_deploy_badge_b34e2468',
  'batch06_24_almost_product_bca46cb2',
  'batch07_winrar_02_cracked_stack_5be922bb',
  'batch07_winrar_03_dark_archive_83e7003d',
  'grave_1x2_batch03_b_flat_cross_slab_32x64_a4654327',
  'grave_2x1_broken_keyboard_119f29ea',
  'grave_2x1_concrete_gpu_f659da76',
  'grave_2x1_router_slab_bc369ea5',
  'grave_2x1_404_slab_0a60d502',
  'grave_2x1_shift_key_7dd8c393',
  'grave_2x1_caps_key_7c778c3f',
  'grave_2x1_tab_key_ecf7d4f0',
  'grave_2x1_enter_key_caps_style_076aedb0',
  'grave_2x1_stone_keyboard_6a70d0a0',
  'grave_2x2_xl_concrete_gpu_20b21ad2',
  'grave_2x2_concrete_blue_screen_monitor_7b1b6556',
  'grave_2x2_pc_case_tomb_2dd577cb',
  'grave_2x2_deploy_rocket_crater_212f5865',
  'grave_2x2_router_monument_428c1528',
  'grave_2x2_database_collapse_4967252c',
  'grave_2x2_docker_whale_rubble_bfec4dbe',
  'grave_2x2_eternal_loading_spinner_3147adeb',
  'grave_2x2_broken_qr_slab_960bf698',
  'grave_2x2_neural_lattice_ossuary_c5a5aa0c',
  'grave_2x2_product_hunt_clone_b406f6d3',
  'grave_2x2_file_manager_cfa2a5a1',
];

const TILE_LAYER_NAMES_V2 = [
  'pixellab_dualgrid_reconstructed',
  'Buildings',
  'fog_soft_inner',
  'fog_soft_outer',
  'fog_locked_blockout',
];

// Fog is a world-state overlay, not ground decoration. It must conceal every
// world object, including sprites, particles, labels, and hover highlights.
const FOG_LAYER_DEPTHS_V2: Record<string, number> = {
  fog_soft_inner: 2000,
  fog_soft_outer: 2001,
  fog_locked_blockout: 2002,
};
const FOG_VIGNETTE_DEPTH_V2 = 2003;

export class CemeterySceneV2 extends Phaser.Scene {
  private map!: Phaser.Tilemaps.Tilemap;
  private slots = new Map<number, SlotData>();
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
  private worldBounds = { ...PLAYABLE_WORLD_BOUNDS_V2 };
  private fogClearAnchors: FogClearAnchor[] = [];
  private assetLoadError: { assetKey: string; assetUrl: string } | null = null;
  private cleanedUp = false;
  private renderedSlots = new Set<number>();
  private renderedGraves = new Map<number, RenderGraveData>();
  private desiredGraves = new Map<number, RenderGraveData>();
  private graveSprites = new Map<number, Phaser.GameObjects.Sprite>();
  private graveShadows = new Map<number, Phaser.GameObjects.Sprite>();
  private ceremonySlotIds = new Set<number>();
  private snapshotProtectedSlotIds = new Set<number>();
  private graveSnapshotAuthoritative = false;
  private hoverHighlight: Phaser.GameObjects.Graphics | null = null;
  private slotHighlightGfx: Phaser.GameObjects.Graphics | null = null;
  private slotHighlightTimer: Phaser.Time.TimerEvent | null = null;
  private handleCameraResize = () => {
    const cam = this.cameras?.main;
    if (!cam) return;
    this.stopCameraMotion(cam);
    this.clampCameraToPlayableBounds(cam);
  };

  constructor() {
    super({ key: 'CemeterySceneV2' });
  }

  private scheduleDelayedCall(delay: number, callback: () => void) {
    const timer = this.time.delayedCall(delay, () => {
      this.untrackTimer(timer);
      callback();
    });
    this.timers.push(timer);
    return timer;
  }

  private untrackTimer(timer: Phaser.Time.TimerEvent) {
    const index = this.timers.indexOf(timer);
    if (index !== -1) this.timers.splice(index, 1);
  }

  private trackCeremonyObject<T extends Phaser.GameObjects.GameObject>(object: T): T {
    this.ceremonyObjects.push(object);
    object.once(Phaser.GameObjects.Events.DESTROY, () => {
      const index = this.ceremonyObjects.indexOf(object);
      if (index !== -1) this.ceremonyObjects.splice(index, 1);
    });
    return object;
  }

  preload() {
    this.assetLoadError = null;
    this.load.once('loaderror', (file: Phaser.Loader.File) => {
      // Only bail on TMJ load failure; individual tileset errors are non-fatal
      if (file.key === 'cemetery-map-v2') {
        const assetUrl = typeof file.src === 'string' ? file.src : 'unknown asset URL';
        this.assetLoadError = { assetKey: file.key, assetUrl };
        cemeteryEvents.emit('load_error', this.assetLoadError);
      }
    });

    this.load.tilemapTiledJSON('cemetery-map-v2', CEMETERY_MAP_V2_URL);

    // Load tilesets using actual image paths from TMJ (not just name + '.png')
    // Skip SVG files (red_road_line, blockout_tiles) — planning layers are hidden
    const TILESET_IMAGE: Record<string, string> = {
      red_road_line: 'planning_tiles.png',
      blockout_tiles: 'blockout_tiles.png',
      grass_flagstone_spritesheet: 'tilesets/grass_flagstone_spritesheet.png',
      chapel_8d_160x256_preserve_aspect: 'pixellab/chapel_8d_160x256_preserve_aspect.png',
      chapel_8d_160x256_lowdetail_palette: 'pixellab/chapel_8d_160x256_lowdetail_palette.png',
      gravedigger_lodge_sysadmin_complete_map4: 'pixellab/gravedigger_lodge_mcp_20260604/gravedigger_lodge_sysadmin_complete_map4.png',
      service_technical_building_4x5_map4: 'pixellab/service_buildings_mcp_20260604/service_technical_building_4x5_map4.png',
      service_garage_2x3_map4: 'pixellab/service_buildings_mcp_20260604/service_garage_2x3_map4.png',
      main_gate_1ds_q4_full_320x160_map4_compare: 'pixellab/main_gate_1ds_20260605/main_gate_1ds_q4_full_320x160_map4_compare.png',
      side_wicket_chek_q1_extensions_512x96_map4_compare: 'pixellab/side_wicket_chek_20260605/side_wicket_chek_q1_extensions_512x96_map4_compare.png',
      inner_wicket_gate_3x3_fc3701e6: 'pixellab/inner_wicket_gate_mcp_20260604/rusty_iron_inner_wicket_gate_3x3_fc3701e6.png',
      tree_cluster_b_dead_branch_cluster_96x96_672af227: 'pixellab/tree_batch_mcp_20260605/source/tree_cluster_b_dead_branch_cluster_96x96_672af227.png',
      tree_cluster_c_mixed_moss_oaks_96x96_e61d00b7: 'pixellab/tree_batch_mcp_20260605/source/tree_cluster_c_mixed_moss_oaks_96x96_e61d00b7.png',
      tree_tall_thin_cypress_c_dead_spire_32x96_387da91e: 'pixellab/tree_batch_mcp_20260605/source/tree_tall_thin_cypress_c_dead_spire_32x96_387da91e.png',
      tree_small_thin_a_crooked_sapling_32x64_2f5d3182_clean_no_soil: 'pixellab/tree_batch_mcp_20260605/cleaned_no_soil/tree_small_thin_a_crooked_sapling_32x64_2f5d3182_clean_no_soil.png',
      tree_small_thin_b_dark_yew_32x64_066c250a_clean_no_soil: 'pixellab/tree_batch_mcp_20260605/cleaned_no_soil/tree_small_thin_b_dark_yew_32x64_066c250a_clean_no_soil.png',
      tree_tall_thin_cypress_a_straight_32x96_533454c2_clean_no_soil: 'pixellab/tree_batch_mcp_20260605/cleaned_no_soil/tree_tall_thin_cypress_a_straight_32x96_533454c2_clean_no_soil.png',
      tree_tall_thin_cypress_b_bent_32x96_59a95dc6_clean_no_soil: 'pixellab/tree_batch_mcp_20260605/cleaned_no_soil/tree_tall_thin_cypress_b_bent_32x96_59a95dc6_clean_no_soil.png',
      tree_medium_c_dark_leafy_yew_64x96_b43f7f4d_clean_no_soil: 'pixellab/tree_batch_mcp_20260605/cleaned_no_soil/tree_medium_c_dark_leafy_yew_64x96_b43f7f4d_clean_no_soil.png',
      tree_round_leafy_large_a_old_oak_96x128_330f4e2f_clean_no_soil: 'pixellab/tree_batch_mcp_20260605/cleaned_no_soil/tree_round_leafy_large_a_old_oak_96x128_330f4e2f_clean_no_soil.png',
      tree_hero_old_b_dead_witness_tree_96x160_2eccfb1a_clean_no_soil: 'pixellab/tree_batch_mcp_20260605/cleaned_no_soil/tree_hero_old_b_dead_witness_tree_96x160_2eccfb1a_clean_no_soil.png',
      tree_small_thin_c_dead_shrub_tree_32x64_dac67e5b_clean_no_soil: 'pixellab/tree_batch_mcp_20260605/cleaned_no_soil/tree_small_thin_c_dead_shrub_tree_32x64_dac67e5b_clean_no_soil.png',
      tree_medium_b_crooked_deadwood_64x96_9556f66f_clean_no_soil: 'pixellab/tree_batch_mcp_20260605/cleaned_no_soil/tree_medium_b_crooked_deadwood_64x96_9556f66f_clean_no_soil.png',
      tree_round_leafy_large_b_broad_mossy_tree_96x128_802c5e35_clean_no_soil: 'pixellab/tree_batch_mcp_20260605/cleaned_no_soil/tree_round_leafy_large_b_broad_mossy_tree_96x128_802c5e35_clean_no_soil.png',
      shrub_2x2_a_dense_yew_64x64_1c29a773: 'pixellab/shrubs_2x2_mcp_20260620/source/shrub_2x2_a_dense_yew_64x64_1c29a773.png',
      shrub_2x2_b_dead_bramble_64x64_53a2a4a2: 'pixellab/shrubs_2x2_mcp_20260620/source/shrub_2x2_b_dead_bramble_64x64_53a2a4a2.png',
      shrub_2x2_e_mossy_thorn_retry_64x64_da8a43c3: 'pixellab/shrubs_2x2_mcp_20260620/source/shrub_2x2_e_mossy_thorn_retry_64x64_da8a43c3.png',
      grave_1x2_batch08_del_key_cross_style_v2_586efee3: 'pixellab/graves_1x2_mcp_20260620/source/grave_1x2_batch08_03_del_key_cross_style_v2_32x64_586efee3.png',
      grave_1x2_microchip_cross_090b565c: 'pixellab/graves_1x2_mcp_20260620/source/grave_1x2_batch05_02_microchip_cross_32x64_090b565c.png',
      grave_1x2_broken_keyboard_slab_63b07f55: 'pixellab/graves_1x2_mcp_20260620/source/grave_1x2_batch05_03_broken_keyboard_slab_32x64_63b07f55.png',
      grave_1x2_dead_disk_slab_ce37aadc: 'pixellab/graves_1x2_mcp_20260620/source/grave_1x2_batch05_09_dead_disk_slab_32x64_ce37aadc.png',
      grave_1x2_server_panel_slab_c1262087: 'pixellab/graves_1x2_mcp_20260620/source/grave_1x2_batch05_12_server_panel_slab_32x64_c1262087.png',
      grave_1x2_cracked_crt_slab_f4e23bcb: 'pixellab/graves_1x2_mcp_20260620/source/grave_1x2_batch05_13_cracked_crt_slab_32x64_f4e23bcb.png',
      grave_1x2_hourglass_inlay_slab_b9b476ad: 'pixellab/graves_1x2_mcp_20260620/source/grave_1x2_batch05_19_hourglass_inlay_slab_32x64_b9b476ad.png',
      grave_1x2_concrete_capacitor_slab_44577a41: 'pixellab/graves_1x2_mcp_20260620/source/grave_1x2_batch05_22_concrete_capacitor_slab_32x64_44577a41.png',
      grave_1x2_marble_iron_heatsink_slab_52a98cb4: 'pixellab/graves_1x2_mcp_20260620/source/grave_1x2_batch05_25_marble_iron_heatsink_slab_32x64_52a98cb4.png',
      grave_1x2_iron_pci_slot_slab_99bbf84d: 'pixellab/graves_1x2_mcp_20260620/source/grave_1x2_batch05_26_iron_pci_slot_slab_32x64_99bbf84d.png',
      grave_1x2_batch08_numpad_plus_key_cross_style_9a47775a: 'pixellab/graves_1x2_mcp_20260620/source/grave_1x2_batch08_02_numpad_plus_key_cross_style_32x64_9a47775a.png',
      grave_1x2_gpu_memory_slab_3d5b1ba6: 'pixellab/graves_1x2_mcp_20260620/source/grave_1x2_batch05_33_gpu_memory_slab_32x64_3d5b1ba6.png',
      grave_1x2_atx_power_connector_slab_1d45172d: 'pixellab/graves_1x2_mcp_20260620/source/grave_1x2_batch05_34_atx_power_connector_slab_32x64_1d45172d.png',
      batch06_01_laptop_4c95c269: 'pixellab/graves_1x2_mcp_20260620/source/batch06_01_laptop_4c95c269.png',
      batch06_03_mvp_monolith_0351632b: 'pixellab/graves_1x2_mcp_20260620/source/batch06_03_mvp_monolith_0351632b.png',
      batch06_05_spinner_d80d6e79: 'pixellab/graves_1x2_mcp_20260620/source/batch06_05_spinner_d80d6e79.png',
      batch06_10_merge_conflict_7e179831: 'pixellab/graves_1x2_mcp_20260620/source/batch06_10_merge_conflict_7e179831.png',
      batch06_15_zip_archive_df472bd8: 'pixellab/graves_1x2_mcp_20260620/source/batch06_15_zip_archive_df472bd8.png',
      batch06_16_kanban_740c7863: 'pixellab/graves_1x2_mcp_20260620/source/batch06_16_kanban_740c7863.png',
      batch06_17_chatbot_08238e46: 'pixellab/graves_1x2_mcp_20260620/source/batch06_17_chatbot_08238e46.png',
      batch06_18_api_endpoint_f7cdbd63: 'pixellab/graves_1x2_mcp_20260620/source/batch06_18_api_endpoint_f7cdbd63.png',
      batch06_19_deploy_badge_b34e2468: 'pixellab/graves_1x2_mcp_20260620/source/batch06_19_deploy_badge_b34e2468.png',
      batch06_24_almost_product_bca46cb2: 'pixellab/graves_1x2_mcp_20260620/source/batch06_24_almost_product_bca46cb2.png',
      batch07_winrar_02_cracked_stack_5be922bb: 'pixellab/graves_1x2_mcp_20260620/source/batch07_winrar_02_cracked_stack_5be922bb.png',
      batch07_winrar_03_dark_archive_83e7003d: 'pixellab/graves_1x2_mcp_20260620/source/batch07_winrar_03_dark_archive_83e7003d.png',
      grave_1x2_batch03_b_flat_cross_slab_32x64_a4654327: 'pixellab/graves_1x2_mcp_20260620/source/grave_1x2_batch03_b_flat_cross_slab_32x64_a4654327.png',
      grave_2x1_broken_keyboard_119f29ea: 'pixellab/graves_2x1_mcp_20260620/source/grave_2x1_batch01_02_broken_keyboard_64x32_119f29ea.png',
      grave_2x1_concrete_gpu_f659da76: 'pixellab/graves_2x1_mcp_20260620/source/grave_2x1_batch01_04_concrete_gpu_64x32_f659da76.png',
      grave_2x1_router_slab_bc369ea5: 'pixellab/graves_2x1_mcp_20260620/source/grave_2x1_batch01_06_router_slab_64x32_bc369ea5.png',
      grave_2x1_404_slab_0a60d502: 'pixellab/graves_2x1_mcp_20260620/source/grave_2x1_batch01_07_404_slab_64x32_0a60d502.png',
      grave_2x1_shift_key_7dd8c393: 'pixellab/graves_2x1_mcp_20260620/source/grave_2x1_batch01_10_shift_key_64x32_7dd8c393.png',
      grave_2x1_caps_key_7c778c3f: 'pixellab/graves_2x1_mcp_20260620/source/grave_2x1_batch01_11_caps_key_64x32_7c778c3f.png',
      grave_2x1_tab_key_ecf7d4f0: 'pixellab/graves_2x1_mcp_20260620/source/grave_2x1_batch01_12_tab_key_64x32_ecf7d4f0.png',
      grave_2x1_enter_key_caps_style_076aedb0: 'pixellab/graves_2x1_mcp_20260620/source/grave_2x1_batch02_caps_style_01_enter_key_64x32_076aedb0.png',
      grave_2x1_stone_keyboard_6a70d0a0: 'pixellab/graves_2x1_mcp_20260620/source/grave_1x2_batch04_a_stone_keyboard_32x64_6a70d0a0.png',
      grave_2x2_xl_concrete_gpu_20b21ad2: 'pixellab/graves_2x2_mcp_20260620/source/grave_2x2_batch01_03_xl_concrete_gpu_64x64_20b21ad2.png',
      grave_2x2_concrete_blue_screen_monitor_7b1b6556: 'pixellab/graves_2x2_mcp_20260620/source/grave_2x2_batch02_strict_01_concrete_blue_screen_monitor_64x64_7b1b6556.png',
      grave_2x2_pc_case_tomb_2dd577cb: 'pixellab/graves_2x2_mcp_20260620/source/grave_2x2_batch02_strict_02_pc_case_tomb_64x64_2dd577cb.png',
      grave_2x2_deploy_rocket_crater_212f5865: 'pixellab/graves_2x2_mcp_20260620/source/grave_2x2_batch02_strict_07_deploy_rocket_crater_64x64_212f5865.png',
      grave_2x2_router_monument_428c1528: 'pixellab/graves_2x2_mcp_20260620/source/grave_2x2_batch02_strict_08_router_monument_64x64_428c1528.png',
      grave_2x2_database_collapse_4967252c: 'pixellab/graves_2x2_mcp_20260620/source/grave_2x2_batch02_strict_09_database_collapse_64x64_4967252c.png',
      grave_2x2_docker_whale_rubble_bfec4dbe: 'pixellab/graves_2x2_mcp_20260620/source/grave_2x2_batch02_strict_10_docker_whale_rubble_64x64_bfec4dbe.png',
      grave_2x2_eternal_loading_spinner_3147adeb: 'pixellab/graves_2x2_mcp_20260620/source/grave_2x2_batch02_strict_14_eternal_loading_spinner_64x64_3147adeb.png',
      grave_2x2_broken_qr_slab_960bf698: 'pixellab/graves_2x2_mcp_20260620/source/grave_2x2_batch02_strict_18_broken_qr_slab_64x64_960bf698.png',
      grave_2x2_neural_lattice_ossuary_c5a5aa0c: 'pixellab/graves_2x2_mcp_20260620/source/grave_2x2_batch02_strict_33_neural_lattice_ossuary_64x64_c5a5aa0c.png',
      grave_2x2_product_hunt_clone_b406f6d3: 'pixellab/graves_2x2_mcp_20260620/source/grave_2x2_batch03_saas_games_21_product_hunt_clone_64x64_b406f6d3.png',
      grave_2x2_file_manager_cfa2a5a1: 'pixellab/graves_2x2_mcp_20260620/source/grave_2x2_batch03_saas_games_48_file_manager_64x64_cfa2a5a1.png',
    };

    for (const name of TILESET_NAMES_V2) {
      const img = TILESET_IMAGE[name];
      if (!img) continue;
      this.load.image(name, `${TILESET_BASE_URL}/${img}`);
    }
  }

  create() {
    if (this.assetLoadError) return;

    this.renderedSlots.clear();
    this.renderedGraves.clear();
    this.desiredGraves.clear();
    this.graveSprites.clear();
    this.graveShadows.clear();
    this.ceremonySlotIds.clear();
    this.snapshotProtectedSlotIds.clear();
    this.graveSnapshotAuthoritative = false;
    this.cleanedUp = false;
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.shutdown, this);
    this.events.once(Phaser.Scenes.Events.DESTROY, this.shutdown, this);

    this.map = this.make.tilemap({ key: 'cemetery-map-v2' });

    const tilesets: Phaser.Tilemaps.Tileset[] = [];
    for (const name of TILESET_NAMES_V2) {
      const ts = this.map.addTilesetImage(name, name);
      if (ts) tilesets.push(ts);
    }

    for (const layerName of TILE_LAYER_NAMES_V2) {
      const layer = this.map.createLayer(layerName, tilesets);
      if (!layer) continue;
      const fogDepth = FOG_LAYER_DEPTHS_V2[layerName];
      if (fogDepth !== undefined) layer.setDepth(fogDepth);
    }
    this.buildFogCameraAnchors();

    // Render building preview sprites from object layers
    this.renderBuildingPreviews();

    // Render tree sprites from TreeObj layer
    this.renderTreeSprites();

    // Emit minimap tile raster for v2 (140x104)
    this.emitMinimapTiles();

    this.slots = parseSlotsV2(this.map);

    const slotArr = Array.from(this.slots.values()).map(s => ({
      id: s.id, x: s.x, y: s.y, width: s.width, height: s.height, type: s.type, name: s.name,
    }));
    cemeteryEvents.emit('slots_ready', { slots: slotArr });

    const cam = this.cameras.main;
    this.scale.on(Phaser.Scale.Events.RESIZE, this.handleCameraResize);
    const isMobile = this.scale.width < 640;
    this.isMobile = isMobile;

    // Bounds match the authored terrain footprint, keeping the padded tilemap
    // grid behind the fog outside the camera view.
    this.worldBounds = { ...PLAYABLE_WORLD_BOUNDS_V2 };

    // Start camera on main gate with tighter zoom
    cam.centerOn(1760, 3100);
    const fitZoom = Math.max(this.scale.width / WORLD_W, this.scale.height / WORLD_H);
    this.minZoom = Math.max(fitZoom, 0.9);
    cam.setZoom(Math.max(fitZoom, 0.8));
    this.clampCameraToPlayableBounds(cam);
    cam.zoomTo(this.minZoom, 2000, 'Sine.easeInOut');

    const getBounds = () => this.getCameraScrollBounds(cam);

    const snapBack = () => {
      const b = getBounds();
      const target = this.getCameraFogSnapTarget(cam, b);
      const targetX = target.x;
      const targetY = target.y;
      if (Math.abs(cam.scrollX - targetX) > 1 || Math.abs(cam.scrollY - targetY) > 1) {
        this.tweens.add({
          targets: cam,
          scrollX: targetX,
          scrollY: targetY,
          duration: 220,
          ease: 'Sine.easeOut',
        });
      }
    };

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (this.input.pointer1.isDown && this.input.pointer2.isDown) {
        this.isDragging = false;
        this.prevPinchDist = 0;
        return;
      }
      this.stopCameraMotion(cam);
      const b = getBounds();
      const settled = this.constrainCameraDrag(cam.scrollX, cam.scrollY, cam, b);
      cam.scrollX = settled.x;
      cam.scrollY = settled.y;
      this.isDragging = true;
      this.dragDistance = 0;
      this.dragStartX = pointer.x;
      this.dragStartY = pointer.y;
      this.dragStartScrollX = cam.scrollX;
      this.dragStartScrollY = cam.scrollY;
    });

    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (this.input.pointer1.isDown && this.input.pointer2.isDown) {
        this.isDragging = false;
        const p1 = this.input.pointer1;
        const p2 = this.input.pointer2;
        const dist = Phaser.Math.Distance.Between(p1.x, p1.y, p2.x, p2.y);
        if (this.prevPinchDist > 0) {
          const scale = dist / this.prevPinchDist;
          this.stopCameraMotion(cam);
          const newZoom = Phaser.Math.Clamp(cam.zoom * scale, this.minZoom, 2.0);
          cam.setZoom(newZoom);
          this.clampCameraToPlayableBounds(cam);
        }
        this.prevPinchDist = dist;
        return;
      }

      if (!this.isDragging) return;
      const dx = pointer.x - this.dragStartX;
      const dy = pointer.y - this.dragStartY;
      this.dragDistance = Math.sqrt(dx * dx + dy * dy);
      const rawX = this.dragStartScrollX - dx / cam.zoom;
      const rawY = this.dragStartScrollY - dy / cam.zoom;
      const b = getBounds();
      const constrained = this.constrainCameraDrag(rawX, rawY, cam, b);
      cam.scrollX = constrained.x;
      cam.scrollY = constrained.y;
    });

    this.input.on('pointerup', () => {
      this.prevPinchDist = 0;
      if (this.input.pointer1.isDown || this.input.pointer2.isDown) {
        const active = this.input.pointer1.isDown ? this.input.pointer1 : this.input.pointer2;
        this.isDragging = true;
        this.dragDistance = 0;
        this.dragStartX = active.x;
        this.dragStartY = active.y;
        const b = getBounds();
        const settled = this.constrainCameraDrag(cam.scrollX, cam.scrollY, cam, b);
        cam.scrollX = settled.x;
        cam.scrollY = settled.y;
        this.dragStartScrollX = cam.scrollX;
        this.dragStartScrollY = cam.scrollY;
        return;
      }
      this.isDragging = false;
      snapBack();
    });

    this.input.on('wheel', (_pointer: Phaser.Input.Pointer, _gameObjects: Phaser.GameObjects.GameObject[], _deltaX: number, deltaY: number) => {
      this.stopCameraMotion(cam);
      const newZoom = Phaser.Math.Clamp(cam.zoom - deltaY * 0.001, this.minZoom, 2.0);
      cam.setZoom(newZoom);
      this.clampCameraToPlayableBounds(cam);
    });

    this.setupInteractiveZones();

    cemeteryEvents.on('render_graves', this.onRenderGraves);
    cemeteryEvents.on('render_grave', this.onRenderGrave);
    cemeteryEvents.on('sync_graves', this.onSyncGraves);

    this.createBuildingLabels();
    this.createFogOverscrollBackdrop();
    this.createFogVignette();
    this.createDayNightCycle();
    this.createAmbientParticles();

    cemeteryEvents.on('minimap_click', this.onMinimapClick);
    cemeteryEvents.on('highlight_slot', this.onHighlightSlot);
    cemeteryEvents.on('modal_state', this.onModalState);
    cemeteryEvents.on('burial_ceremony', this.onBurialCeremony);
    cemeteryEvents.on('zoom_change', this.onZoomChange);

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
        mapVersion: 'v2',
      });
    }
  }

  private renderBuildingPreviews() {
    const previewLayers = [
      { name: 'ChapelPreview_8d_lowdetail_palette_copy', depth: BUILDING_PREVIEW_DEPTH_V2 },
      { name: 'GravediggerLodgePreview_map4', depth: BUILDING_PREVIEW_DEPTH_V2 },
      { name: 'ServiceBuildingsPreview_map4', depth: BUILDING_PREVIEW_DEPTH_V2 },
      { name: 'MainGate1dsQ4Preview_map4', depth: MAIN_GATE_PREVIEW_DEPTH_V2 },
      { name: 'Side_map4', depth: BUILDING_PREVIEW_DEPTH_V2 },
    ];

    for (const { name: layerName, depth } of previewLayers) {
      const layer = this.map.getObjectLayer(layerName);
      if (!layer) continue;

      for (const obj of layer.objects) {
        if (!obj.gid) continue;
        const ts = this.map.tilesets.find(t => t.firstgid === obj.gid);
        if (!ts) continue;
        const bounds = getTiledObjectBounds(obj);
        const position = getTiledObjectCenter(obj);
        this.renderBuildingGroundShadow(bounds, ts.name, obj.gid - ts.firstgid);
        this.add.sprite(
          position.x,
          position.y,
          ts.name,
          obj.gid - ts.firstgid,
        ).setDepth(depth);
      }
    }
  }

  private renderBuildingGroundShadow(
    bounds: { x: number; y: number; width: number; height: number },
    textureKey: string,
    frame: number,
  ) {
    // A squashed copy of the exact building frame preserves the silhouette of
    // the chapel, gates, and service buildings instead of using one generic oval.
    const shadowWidth = Phaser.Math.Clamp(bounds.width * 0.94, 32, 512);
    const shadowHeight = Phaser.Math.Clamp(bounds.height * 0.18, 12, 48);
    const baseInset = BUILDING_SHADOW_BASE_INSET_V2[textureKey] ?? Math.round(bounds.height * 0.08);
    const visualBaseY = bounds.y + bounds.height - baseInset;
    const shadow = this.add.sprite(
      bounds.x + bounds.width / 2 + BUILDING_SHADOW_X_OFFSET_V2,
      visualBaseY - shadowHeight / 2 + BUILDING_SHADOW_Y_OFFSET_V2,
      textureKey,
      frame,
    );
    shadow.setDisplaySize(shadowWidth, shadowHeight);
    shadow.setTintFill(BUILDING_SHADOW_TINT_V2);
    shadow.setAlpha(BUILDING_SHADOW_ALPHA_V2);
    shadow.setDepth(BUILDING_SHADOW_DEPTH_V2);
  }

  private renderTreeSprites() {
    const treeLayer = this.map.getObjectLayer('TreeObj');
    if (!treeLayer) return;
    const treeShadows = this.add.graphics().setDepth(TREE_SHADOW_DEPTH_V2);
    treeShadows.fillStyle(0x0b100c, 0.15);

    for (const obj of treeLayer.objects) {
      if (!obj.gid) continue;
      const ts = this.map.tilesets.find(t => t.firstgid === obj.gid);
      if (!ts) continue;
      const position = getTiledObjectCenter(obj);
      this.drawTreeGroundShadow(treeShadows, getTiledObjectBounds(obj), obj.gid);
      this.add.sprite(
        position.x,
        position.y,
        ts.name,
        obj.gid - ts.firstgid,
      ).setDepth(600);
    }
  }

  private drawTreeGroundShadow(
    shadowLayer: Phaser.GameObjects.Graphics,
    bounds: { x: number; y: number; width: number; height: number },
    gid: number,
  ) {
    const shadowWidth = Phaser.Math.Clamp(bounds.width * 0.68, 16, 72);
    const shadowHeight = Phaser.Math.Clamp(bounds.height * 0.19, 10, 26);
    const rootX = bounds.x + bounds.width / 2;
    const rootInset = TREE_SHADOW_ROOT_INSET_V2[gid] ?? Math.round(bounds.height * 0.12);
    const visualRootY = bounds.y + bounds.height - rootInset;
    // Keep the whole shadow slightly above the lowest visible root. This
    // avoids turning a long root tip into an accidental ground anchor.
    const shadowClearance = Phaser.Math.Clamp(bounds.height * 0.01, 1, 2);
    const shadowY = visualRootY - shadowHeight / 2 - shadowClearance + TREE_SHADOW_Y_OFFSET_V2;
    shadowLayer.fillEllipse(
      rootX,
      shadowY,
      shadowWidth,
      shadowHeight,
    );
  }

  private emitMinimapTiles() {
    const w = this.map.width;
    const h = this.map.height;
    const tiles = new Uint8Array(w * h);
    const fog = new Uint8Array(w * h);

    // LayerData.x/y already contains Tiled offsetx/offsety in pixels. The
    // raster helper translates it back to map cells, keeping this schematic
    // aligned with the actual Phaser world.
    const terrainLayer = this.map.getLayer('pixellab_dualgrid_reconstructed');
    paintMinimapLayer(tiles, w, h, terrainLayer, (tile) => tile.index);

    const fogLayers: Array<{ name: string; value: number }> = [
      { name: 'fog_soft_inner', value: 1 },
      { name: 'fog_soft_outer', value: 2 },
      { name: 'fog_locked_blockout', value: 3 },
    ];
    for (const { name, value } of fogLayers) {
      paintMinimapLayer(fog, w, h, this.map.getLayer(name), value);
    }

    cemeteryEvents.emit('minimap_tiles', {
      tiles,
      fog,
      mapWidth: w,
      mapHeight: h,
      mapVersion: 'v2',
    });
  }

  private createAmbientParticles() {
    const leafGfx = this.add.graphics();
    leafGfx.fillStyle(0x8B7355, 1);
    leafGfx.fillRect(1, 0, 4, 1);
    leafGfx.fillRect(0, 1, 6, 2);
    leafGfx.fillRect(2, 3, 3, 1);
    leafGfx.generateTexture('leaf_v2', 6, 4);
    leafGfx.destroy();

    const dustGfx = this.add.graphics();
    dustGfx.fillStyle(0xddccaa, 1);
    dustGfx.fillRect(0, 0, 2, 2);
    dustGfx.generateTexture('dust_v2', 2, 2);
    dustGfx.destroy();

    const cam = this.cameras.main;

    const leaves = this.add.particles(0, 0, 'leaf_v2', {
      lifespan: 10000,
      speedY: { min: 12, max: 25 },
      speedX: { min: -15, max: 15 },
      scale: { start: 1.5, end: 0.8 },
      alpha: { start: 0.7, end: 0 },
      rotate: { min: 0, max: 360 },
      frequency: -1,
    });
    leaves.setDepth(850);

    const dust = this.add.particles(0, 0, 'dust_v2', {
      lifespan: 6000,
      speedY: { min: -5, max: 5 },
      speedX: { min: -5, max: 5 },
      scale: { start: 1, end: 0.5 },
      alpha: { start: 0, end: 0.5, ease: 'Sine.easeInOut' },
      frequency: -1,
    });
    dust.setDepth(850);

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
    const overlay = this.add.rectangle(WORLD_W / 2, WORLD_H / 2, WORLD_W, WORLD_H);
    overlay.setDepth(895);

    const phases: Array<{ color: number; alpha: number; hold: number }> = [
      { color: 0x191035, alpha: 0.18, hold: 15000 },
      { color: 0x0a0a20, alpha: 0.30, hold: 25000 },
      { color: 0x2a1525, alpha: 0.12, hold: 30000 },
      { color: 0x000000, alpha: 0.0, hold: 50000 },
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

    const transitionTo = (nextPhase: number) => {
      const p = phases[nextPhase];
      const r = (p.color >> 16) & 0xff;
      const g = (p.color >> 8) & 0xff;
      const b = p.color & 0xff;

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

    document.fonts.load("14px Cinzel").then(() => {
      if (!this.scene.isActive()) return;
      const buildingSlots = Array.from(this.slots.values())
        .filter((slot) => slot.type === 'Building' && !!slot.name)
        .sort((left, right) => left.y - right.y || left.x - right.x || left.id - right.id);
      const placedLabels: Phaser.GameObjects.Text[] = [];

      for (const slot of buildingSlots) {
        const cx = slot.x + slot.width / 2;
        let ly = slot.y - BUILDING_LABEL_GAP_V2;

        // A wide object layer can overlap another building (the two gate
        // previews do). Keep its label above that neighbouring sprite too.
        while (true) {
          const blockingTop = buildingSlots
            .filter((candidate) => candidate.id !== slot.id)
            .filter((candidate) => {
              const overlapsHorizontally = slot.x < candidate.x + candidate.width
                && slot.x + slot.width > candidate.x;
              return overlapsHorizontally
                && ly > candidate.y
                && ly <= candidate.y + candidate.height;
            })
            .reduce<number | null>(
              (top, candidate) => top === null ? candidate.y : Math.min(top, candidate.y),
              null,
            );
          if (blockingTop === null) break;
          ly = blockingTop - BUILDING_LABEL_GAP_V2;
        }

        const label = this.add.text(cx, ly, slot.name.toUpperCase(), style);
        label.setOrigin(0.5, 1);
        label.setDepth(BUILDING_LABEL_DEPTH_V2);

        // Labels sharing the same clear space (such as Main Gate and Side
        // Wicket) are stacked rather than drawn on top of each other.
        for (const placedLabel of placedLabels) {
          const bounds = label.getBounds();
          const placedBounds = placedLabel.getBounds();
          const overlapsHorizontally = bounds.left < placedBounds.right
            && bounds.right > placedBounds.left;
          const overlapsVertically = bounds.top < placedBounds.bottom + BUILDING_LABEL_STACK_GAP_V2
            && bounds.bottom > placedBounds.top - BUILDING_LABEL_STACK_GAP_V2;
          if (overlapsHorizontally && overlapsVertically) {
            label.setY(placedBounds.top - BUILDING_LABEL_STACK_GAP_V2);
          }
        }
        placedLabels.push(label);
      }
    });
  }

  private createFogOverscrollBackdrop() {
    // Cemetery Map 2.0's locked fog ends at the tilemap edges. Extend it by the same short
    // camera buffer on every side so a centred wide viewport cannot show canvas.
    const fog = this.add.graphics();
    fog.setDepth(FOG_VIGNETTE_DEPTH_V2);
    fog.fillStyle(0x050505, 0.85);
    fog.fillRect(-CAMERA_FOG_OVERSCROLL_V2, -CAMERA_FOG_OVERSCROLL_V2, WORLD_W + CAMERA_FOG_OVERSCROLL_V2 * 2, CAMERA_FOG_OVERSCROLL_V2);
    fog.fillRect(-CAMERA_FOG_OVERSCROLL_V2, WORLD_H, WORLD_W + CAMERA_FOG_OVERSCROLL_V2 * 2, CAMERA_FOG_OVERSCROLL_V2);
    fog.fillRect(-CAMERA_FOG_OVERSCROLL_V2, 0, CAMERA_FOG_OVERSCROLL_V2, WORLD_H);
    fog.fillRect(WORLD_W, 0, CAMERA_FOG_OVERSCROLL_V2, WORLD_H);
  }

  private createFogVignette() {
    const DEPTH = 96;
    const STEPS = 16;
    const STEP_W = DEPTH / STEPS;
    const color = 0x1a1a2e;

    const fog = this.add.graphics();
    fog.setDepth(FOG_VIGNETTE_DEPTH_V2);

    for (let i = 0; i < STEPS; i++) {
      const t = i / STEPS;
      const alpha = 0.8 * (1 - t) * (1 - t);
      const offset = Math.round(DEPTH * t);

      fog.fillStyle(color, alpha);

      fog.fillRect(offset, 0, STEP_W, WORLD_H);
      fog.fillRect(WORLD_W - offset - STEP_W, 0, STEP_W, WORLD_H);

      fog.fillRect(0, offset, WORLD_W, STEP_W);
      fog.fillRect(0, WORLD_H - offset - STEP_W, WORLD_W, STEP_W);
    }
  }

  private isCeremonyBlockingInput() {
    return this.ceremonyScheduled || this.ceremonyInProgress || !!this.pendingCeremony;
  }

  private clampCameraCenter(cam: Phaser.Cameras.Scene2D.Camera, targetX: number, targetY: number, zoom: number) {
    const halfW = cam.width / (zoom * 2);
    const halfH = cam.height / (zoom * 2);
    return {
      x: Phaser.Math.Clamp(targetX, halfW, WORLD_W - halfW),
      y: Phaser.Math.Clamp(targetY, halfH, WORLD_H - halfH),
    };
  }

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
        slot.type === 'Building' || this.renderedSlots.has(slot.id);

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
    this.hoverHighlight.fillStyle(color, 0.15);
    this.hoverHighlight.fillRect(x, y, w, h);
    this.hoverHighlight.lineStyle(1, color, 0.6);
    this.hoverHighlight.strokeRect(x, y, w, h);
  }

  private removeGraveFromMap(slotId: number) {
    const shadow = this.graveShadows.get(slotId);
    if (shadow?.active) shadow.destroy();
    this.graveShadows.delete(slotId);
    const sprite = this.graveSprites.get(slotId);
    if (sprite?.active) sprite.destroy();
    this.graveSprites.delete(slotId);
    this.renderedSlots.delete(slotId);
    this.renderedGraves.delete(slotId);
  }

  private renderGraveOnMap(grave: RenderGraveData) {
    const current = this.renderedGraves.get(grave.slot_id);
    if (current && isSameRenderedGrave(current, grave)) return;

    const slot = this.slots.get(grave.slot_id);
    if (!slot) return;

    // Use server-picked GID if available, otherwise fall back to deterministic pick
    const gid = grave.grave_gid ?? pickGraveGidV2(slot.type, grave.slot_id);
    const tileset = gid ? this.map.tilesets.find(ts => ts.firstgid === gid) : null;
    if (!gid || !tileset) {
      this.removeGraveFromMap(grave.slot_id);
      return;
    }

    if (current || this.renderedSlots.has(grave.slot_id)) {
      this.removeGraveFromMap(grave.slot_id);
    }
    const shadowHeight = Phaser.Math.Clamp(slot.height * 0.16, 7, 14);
    const shadow = this.add.sprite(
      slot.x + slot.width / 2 + GRAVE_SHADOW_X_OFFSET_V2,
      slot.y + slot.height - shadowHeight / 2 + GRAVE_SHADOW_Y_OFFSET_V2,
      tileset.name,
      gid - tileset.firstgid,
    );
    shadow.setDisplaySize(Phaser.Math.Clamp(slot.width * 0.9, 18, 64), shadowHeight);
    shadow.setTintFill(GRAVE_SHADOW_TINT_V2);
    shadow.setAlpha(GRAVE_SHADOW_ALPHA_V2);
    shadow.setDepth(GRAVE_SHADOW_DEPTH_V2);

    const sprite = this.add.sprite(
      slot.x + slot.width / 2,
      slot.y + slot.height / 2,
      tileset.name,
      gid - tileset.firstgid,
    );
    sprite.setDepth(800);
    this.graveShadows.set(grave.slot_id, shadow);
    this.graveSprites.set(grave.slot_id, sprite);
    this.renderedSlots.add(grave.slot_id);
    this.renderedGraves.set(grave.slot_id, grave);
  }

  private onRenderGraves = (data: { graves: RenderGraveData[] }) => {
    for (const g of data.graves) this.renderGraveOnMap(g);
  };
  private onRenderGrave = (data: RenderGraveData) => {
    this.renderGraveOnMap(data);
  };

  private onSyncGraves = (data: SyncGravesData) => {
    this.desiredGraves = new Map<number, RenderGraveData>();
    for (const grave of data.graves) {
      this.desiredGraves.set(grave.slot_id, grave);
    }
    this.snapshotProtectedSlotIds = new Set(data.protectedSlotIds);
    this.graveSnapshotAuthoritative = data.authoritative;
    this.reconcileGraves();
  };

  private reconcileGraves() {
    const protectedSlotIds = new Set([
      ...this.ceremonySlotIds,
      ...this.snapshotProtectedSlotIds,
    ]);
    const plan = planGraveReconciliation(
      this.renderedGraves,
      this.desiredGraves,
      protectedSlotIds,
      this.graveSnapshotAuthoritative,
    );

    for (const slotId of plan.remove) this.removeGraveFromMap(slotId);
    for (const grave of plan.render) this.renderGraveOnMap(grave);
  }

  private onMinimapClick = (data: MinimapClickData) => {
    if (this.isCeremonyBlockingInput()) return;
    const cam = this.cameras?.main;
    if (!cam) return;
    const vw = cam.width / cam.zoom;
    const vh = cam.height / cam.zoom;
    const bounds = this.getCameraScrollBounds(cam);
    const targetX = Phaser.Math.Clamp(data.worldX - vw / 2, bounds.minX, bounds.maxX);
    const targetY = Phaser.Math.Clamp(data.worldY - vh / 2, bounds.minY, bounds.maxY);
    this.stopCameraMotion(cam);
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
    if (!data.open && this.pendingCeremony && this.buryModalOpen && !this.ceremonyScheduled) {
      const ceremonyData = this.pendingCeremony;
      this.pendingCeremony = null;
      this.buryModalOpen = false;
      this.ceremonyScheduled = true;
      this.input.enabled = false;
      this.scheduleDelayedCall(200, () => {
        this.playBurialCeremony(ceremonyData);
      });
      return;
    }
    this.input.enabled = !data.open && !this.ceremonyScheduled && !this.ceremonyInProgress && !this.pendingCeremony;
  };

  private onHighlightSlot = (data: { slotId: number }) => {
    const slot = this.slots.get(data.slotId);
    if (!slot) return;

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
    this.clampCameraToPlayableBounds(cam);
  };

  private buildFogCameraAnchors() {
    const lockedFog = this.map.getLayer('fog_locked_blockout');
    this.fogClearAnchors = [];
    if (!lockedFog) return;

    const tileWidth = lockedFog.tileWidth || TILE_SIZE;
    const tileHeight = lockedFog.tileHeight || TILE_SIZE;
    for (let y = 0; y < lockedFog.height; y++) {
      for (let x = 0; x < lockedFog.width; x++) {
        const tile = lockedFog.data[y]?.[x];
        if (tile?.index !== undefined && tile.index >= 0) continue;

        const left = lockedFog.x + x * tileWidth;
        const top = lockedFog.y + y * tileHeight;
        this.fogClearAnchors.push({
          left,
          top,
          right: left + tileWidth,
          bottom: top + tileHeight,
        });
      }
    }
  }

  private constrainCameraDrag(
    scrollX: number,
    scrollY: number,
    cam: Phaser.Cameras.Scene2D.Camera,
    strictBounds: CameraScrollBounds,
  ) {
    return constrainCameraScrollToFog({
      scrollX,
      scrollY,
      viewWidth: cam.width / cam.zoom,
      viewHeight: cam.height / cam.zoom,
      strictBounds,
      cameraSafeWorldBounds: CAMERA_FOG_SAFETY_WORLD_BOUNDS_V2,
      fogClearAnchors: this.fogClearAnchors,
    });
  }

  private getCameraFogSnapTarget(
    cam: Phaser.Cameras.Scene2D.Camera,
    strictBounds: CameraScrollBounds,
  ) {
    return constrainCameraScrollToFog({
      scrollX: cam.scrollX,
      scrollY: cam.scrollY,
      viewWidth: cam.width / cam.zoom,
      viewHeight: cam.height / cam.zoom,
      strictBounds,
      cameraSafeWorldBounds: CAMERA_FOG_SAFETY_WORLD_BOUNDS_V2,
      fogClearAnchors: this.fogClearAnchors,
      maxFogDistance: CAMERA_FOG_REST_BUFFER_V2,
      freeFogDistance: CAMERA_FOG_REST_BUFFER_V2,
      resistance: 0,
    });
  }

  private getCameraScrollBounds(cam: Phaser.Cameras.Scene2D.Camera) {
    return getPlayableCameraScrollBounds(
      this.worldBounds,
      cam.width / cam.zoom,
      cam.height / cam.zoom,
      WORLD_W,
      WORLD_H,
    );
  }

  private clampCameraToPlayableBounds(cam: Phaser.Cameras.Scene2D.Camera) {
    const bounds = this.getCameraScrollBounds(cam);
    cam.scrollX = Phaser.Math.Clamp(cam.scrollX, bounds.minX, bounds.maxX);
    cam.scrollY = Phaser.Math.Clamp(cam.scrollY, bounds.minY, bounds.maxY);
  }

  private onBurialCeremony = (data: { slot_id: number; id: string; name: string }) => {
    this.ceremonySlotIds.add(data.slot_id);
    if (this.ceremonyInProgress || this.ceremonyScheduled || this.pendingCeremony) {
      this.ceremonyQueue.push(data);
      return;
    }
    this.pendingCeremony = data;
    this.buryModalOpen = true;
    if (!this.modalOpen) {
      const ceremonyData = this.pendingCeremony;
      this.pendingCeremony = null;
      this.buryModalOpen = false;
      this.ceremonyScheduled = true;
      this.input.enabled = false;
      this.scheduleDelayedCall(200, () => {
        this.playBurialCeremony(ceremonyData);
      });
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

  private playBurialCeremony(data: { slot_id: number; id: string; name: string }) {
    this.ceremonyScheduled = false;
    const slot = this.slots.get(data.slot_id);
    if (!slot) {
      this.renderGraveOnMap(data);
      this.finishBurialCeremony(data.slot_id);
      return;
    }

    this.ceremonyInProgress = true;
    this.input.enabled = false;

    const cam = this.cameras.main;
    this.stopCameraMotion(cam);
    const cx = slot.x + slot.width / 2;
    const cy = slot.y + slot.height / 2;
    const originalZoom = cam.zoom;
    const CEREMONY_ZOOM = 1.5;
    const dest = this.clampCameraCenter(cam, cx, cy, CEREMONY_ZOOM);

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
        this.playDirtBurst(cx, cy);
        cam.shake(300, 0.005);

        this.scheduleDelayedCall(1000, () => {
          this.renderGraveOnMap(data);
          this.playGraveReveal(slot, () => {
            this.playRIPGlow(slot, data.name, () => {
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
        });
      },
    });
  }

  private playDirtBurst(cx: number, cy: number) {
    if (!this.textures.exists('dirt_v2')) {
      const gfx = this.add.graphics();
      gfx.fillStyle(0x8B6914, 1);
      gfx.fillRect(0, 0, 4, 4);
      gfx.generateTexture('dirt_v2', 4, 4);
      gfx.destroy();
    }

    const particles = this.add.particles(cx, cy, 'dirt_v2', {
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
    this.trackCeremonyObject(particles);

    this.scheduleDelayedCall(1000, () => {
      particles.destroy();
    });
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
    this.trackCeremonyObject(rect);

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

    const GLOW_STEPS = 10;
    const glowGfx = this.add.graphics();
    glowGfx.setDepth(905);
    this.trackCeremonyObject(glowGfx);
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
    this.trackCeremonyObject(ripText);

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
    this.trackCeremonyObject(nameText);

    this.tweens.add({
      targets: [ripText, nameText],
      y: '-=30',
      alpha: 1,
      duration: 800,
      ease: 'Sine.easeOut',
      onComplete: () => {
        this.scheduleDelayedCall(200, () => {
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
        });
      },
    });
  }

  private finishBurialCeremony(slotId: number) {
    this.ceremonyInProgress = false;
    this.ceremonySlotIds.delete(slotId);
    this.snapshotProtectedSlotIds.delete(slotId);
    this.reconcileGraves();
    const next = this.ceremonyQueue.shift();
    const willContinue = Boolean(next);
    cemeteryEvents.emit('burial_ceremony_done', { slot_id: slotId, willContinue });
    if (next) {
      this.ceremonyScheduled = true;
      this.input.enabled = false;
      this.scheduleDelayedCall(200, () => {
        this.playBurialCeremony(next);
      });
      return;
    }
    this.input.enabled = !this.modalOpen;
  }

  shutdown() {
    if (this.cleanedUp) return;
    this.cleanedUp = true;

    this.scale.off(Phaser.Scale.Events.RESIZE, this.handleCameraResize);

    cemeteryEvents.off('render_graves', this.onRenderGraves);
    cemeteryEvents.off('render_grave', this.onRenderGrave);
    cemeteryEvents.off('sync_graves', this.onSyncGraves);
    cemeteryEvents.off('minimap_click', this.onMinimapClick);
    cemeteryEvents.off('highlight_slot', this.onHighlightSlot);
    cemeteryEvents.off('modal_state', this.onModalState);
    cemeteryEvents.off('burial_ceremony', this.onBurialCeremony);
    cemeteryEvents.off('zoom_change', this.onZoomChange);
    this.pendingCeremony = null;
    this.ceremonyQueue = [];
    this.ceremonyScheduled = false;
    this.buryModalOpen = false;
    for (const obj of [...this.ceremonyObjects]) {
      if (obj && obj.active) obj.destroy();
    }
    this.ceremonyObjects = [];
    this.ceremonyInProgress = false;
    if (this.textures.exists('dirt_v2')) this.textures.remove('dirt_v2');
    if (this.textures.exists('leaf_v2')) this.textures.remove('leaf_v2');
    if (this.textures.exists('dust_v2')) this.textures.remove('dust_v2');

    for (const t of this.timers) t.destroy();
    this.timers = [];

    if (this.slotHighlightTimer) {
      this.slotHighlightTimer.destroy();
      this.slotHighlightTimer = null;
    }

    this.tweens.killAll();

    this.input.off('pointerdown');
    this.input.off('pointermove');
    this.input.off('pointerup');
    this.input.off('wheel');

    for (const sprite of this.graveSprites.values()) {
      if (sprite.active) sprite.destroy();
    }
    this.renderedSlots.clear();
    this.renderedGraves.clear();
    this.desiredGraves.clear();
    this.graveSprites.clear();
    this.ceremonySlotIds.clear();
    this.snapshotProtectedSlotIds.clear();
    this.graveSnapshotAuthoritative = false;
    this.fogClearAnchors = [];
    this.slots.clear();
  }
}
