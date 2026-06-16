/**
 * assetLibrary.ts
 *
 * Master registry of all injectable 3D assets available in the VenuePlatform
 * spatial scene editor.
 *
 * Taxonomy
 * ─────────
 * group    → top-level classification shown as parent tab buttons
 * category → granular sub-classification shown as scrollable sub-tab pills
 *
 * Group → sub-categories mapping
 * ┌──────────────────────────────────────────────────────────────────────┐
 * │ technical    │  audio · lighting · led                               │
 * │ staging      │  trussing · scaffolding · stage · risers              │
 * │ construction │  tin_barricade · mojo_barricade · welfare             │
 * └──────────────────────────────────────────────────────────────────────┘
 */

/* ─── Taxonomy types ──────────────────────────────────────────────────────── */

/** Top-level organisational group — drives parent tab buttons in the panel. */
export type AssetGroup =
  | 'technical'    // Production technology: audio, lighting, LED
  | 'staging'      // Physical staging: decks, trussing, scaffolding
  | 'construction'; // Venue build-out: barricading and welfare

/**
 * Granular sub-category — drives scrollable pill tabs within each group.
 * Matches the user-defined classification spec exactly.
 */
export type AssetCategory =
  | 'audio'          // Speaker systems, mixing consoles
  | 'lighting'       // Moving heads, atmospheric FX
  | 'led'            // LED screen panels / walls
  | 'trussing'       // Goalpost rigs and rigging towers
  | 'scaffolding'    // PA delay towers and scaffold blocks
  | 'stage'          // Flat stage decks
  | 'risers'         // Drum risers and raised platforms
  | 'tin_barricade'  // Galvanized tin perimeter barricading
  | 'mojo_barricade' // Mojo crowd-control barricade lines
  | 'welfare';       // Sanitation and welfare units

/* ─── Asset interface ─────────────────────────────────────────────────────── */

export interface InjectableAsset {
  /** Unique catalogue ID. */
  id:            string;
  /** Human-readable product name. */
  name:          string;
  /** Parent group for the top-level tab. */
  group:         AssetGroup;
  /** Granular sub-classification for the sub-tab strip. */
  category:      AssetCategory;
  /** Short ALL-CAPS code used as the thumbnail fallback label. */
  thumbnailText: string;
  /** Path to the glTF/glb model file in the public asset directory. */
  modelUrl:      string;
  /** Real-world footprint and height in metres. */
  dimensions: {
    width:  number;
    length: number;
    height: number;
  };
}

/* ─── Master asset list ───────────────────────────────────────────────────── */

export const assetLibrary: InjectableAsset[] = [

  /* ══ TECHNICAL ELEMENTS ════════════════════════════════════════════════════ */

  /* ── audio ──────────────────────────────────────────────────────────────── */
  {
    id:            'tech-audio-db-v-series',
    name:          'd&b audiotechnik V-Series Module',
    group:         'technical',
    category:      'audio',
    thumbnailText: 'AUDIO',
    modelUrl:      '/assets/models/technical/audio/db_v_series.glb',
    dimensions:    { width: 0.34, length: 0.4,  height: 0.38 },
  },
  {
    id:            'tech-audio-digico-q338',
    name:          'DiGiCo Quantum338 Console Desk',
    group:         'technical',
    category:      'audio',
    thumbnailText: 'FOH',
    modelUrl:      '/assets/models/technical/audio/digico_q338.glb',
    dimensions:    { width: 1.85, length: 0.85, height: 0.95 },
  },

  /* ── lighting ────────────────────────────────────────────────────────────── */
  {
    id:            'tech-lght-moving-head-profile',
    name:          'Moving Head Profile Fixture',
    group:         'technical',
    category:      'lighting',
    thumbnailText: 'LGHT',
    modelUrl:      '/assets/models/technical/lighting/moving_head_profile.glb',
    dimensions:    { width: 0.45, length: 0.45, height: 0.68 },
  },
  {
    id:            'tech-lght-haze-machine',
    name:          'Haze Machine Generator',
    group:         'technical',
    category:      'lighting',
    thumbnailText: 'HAZE',
    modelUrl:      '/assets/models/technical/lighting/haze_machine.glb',
    dimensions:    { width: 0.55, length: 0.55, height: 0.85 },
  },

  /* ── led ─────────────────────────────────────────────────────────────────── */
  {
    id:            'tech-led-p3-9-panel',
    name:          'P3.9 High-Definition LED Screen Panel (1×0.5m)',
    group:         'technical',
    category:      'led',
    thumbnailText: 'LED',
    modelUrl:      '/assets/models/technical/led/p3_9_panel.glb',
    dimensions:    { width: 1.0, length: 0.125, height: 0.5 },
  },

  /* ══ STAGING ELEMENTS ══════════════════════════════════════════════════════ */

  /* ── trussing ────────────────────────────────────────────────────────────── */
  {
    id:            'stg-truss-goalpost-system',
    name:          'Aluminum Truss Goalpost System',
    group:         'staging',
    category:      'trussing',
    thumbnailText: 'TRUSS',
    modelUrl:      '/assets/models/staging/trussing/truss_goalpost.glb',
    dimensions:    { width: 8.0, length: 0.3, height: 6.0 },
  },
  {
    id:            'stg-truss-rigging-tower',
    name:          'Heavy-Duty Roof Rigging Tower',
    group:         'staging',
    category:      'trussing',
    thumbnailText: 'TOWER',
    modelUrl:      '/assets/models/staging/trussing/rigging_tower.glb',
    dimensions:    { width: 1.5, length: 1.5, height: 9.0 },
  },

  /* ── scaffolding ─────────────────────────────────────────────────────────── */
  {
    id:            'stg-scaff-pa-delay-tower',
    name:          'Industrial PA Delay Tower Scaffolding Block',
    group:         'staging',
    category:      'scaffolding',
    thumbnailText: 'SCAFF',
    modelUrl:      '/assets/models/staging/scaffolding/pa_delay_tower.glb',
    dimensions:    { width: 2.0, length: 2.0, height: 7.5 },
  },

  /* ── stage ───────────────────────────────────────────────────────────────── */
  {
    id:            'stg-stage-concert-deck-4x4',
    name:          'Concert Stage Deck (4×4m)',
    group:         'staging',
    category:      'stage',
    thumbnailText: 'DECK',
    modelUrl:      '/assets/models/staging/stage/concert_deck_4x4.glb',
    dimensions:    { width: 4.0, length: 4.0, height: 1.0 },
  },

  /* ── risers ──────────────────────────────────────────────────────────────── */
  {
    id:            'stg-riser-drum-2x2',
    name:          'Heavy-Duty Drum Riser (2×2m)',
    group:         'staging',
    category:      'risers',
    thumbnailText: 'RISER',
    modelUrl:      '/assets/models/staging/stage/drum_riser_2x2.glb',
    dimensions:    { width: 2.0, length: 2.0, height: 0.6 },
  },

  /* ══ VENUE CONSTRUCTION ═════════════════════════════════════════════════════ */

  /* ── tin_barricade ───────────────────────────────────────────────────────── */
  {
    id:            'con-tin-perimeter',
    name:          'Galvanized Tin Perimeter Barricading',
    group:         'construction',
    category:      'tin_barricade',
    thumbnailText: 'TIN',
    modelUrl:      '/assets/models/build/construction/tin_perimeter.glb',
    dimensions:    { width: 2.4, length: 0.05, height: 2.0 },
  },

  /* ── mojo_barricade ──────────────────────────────────────────────────────── */
  {
    id:            'con-mojo-barricade',
    name:          'Mojo Crowd Control Barricade Line',
    group:         'construction',
    category:      'mojo_barricade',
    thumbnailText: 'MOJO',
    modelUrl:      '/assets/models/build/construction/mojo_barricade.glb',
    dimensions:    { width: 2.5, length: 0.25, height: 1.1 },
  },

  /* ── welfare ─────────────────────────────────────────────────────────────── */
  {
    id:            'con-welf-mobile-toilets',
    name:          'Modular Mobile Toilets Container Block',
    group:         'construction',
    category:      'welfare',
    thumbnailText: 'WC',
    modelUrl:      '/assets/models/build/welfare/mobile_toilets.glb',
    dimensions:    { width: 6.0, length: 2.4, height: 2.8 },
  },
];

/* ─── Filtered convenience views ─────────────────────────────────────────── */

/** All assets belonging to a given top-level group. */
export function assetsByGroup(group: AssetGroup): InjectableAsset[] {
  return assetLibrary.filter((a) => a.group === group);
}

/** All assets belonging to a given granular sub-category. */
export function assetsByCategory(category: AssetCategory): InjectableAsset[] {
  return assetLibrary.filter((a) => a.category === category);
}

/** Pre-filtered group views for direct consumption. */
export const technicalAssets:    InjectableAsset[] = assetsByGroup('technical');
export const stagingAssets:      InjectableAsset[] = assetsByGroup('staging');
export const constructionAssets: InjectableAsset[] = assetsByGroup('construction');

/** Sub-category lookup map: category → assets[]. */
export const assetCategoryMap: Record<AssetCategory, InjectableAsset[]> = {
  audio:          assetsByCategory('audio'),
  lighting:       assetsByCategory('lighting'),
  led:            assetsByCategory('led'),
  trussing:       assetsByCategory('trussing'),
  scaffolding:    assetsByCategory('scaffolding'),
  stage:          assetsByCategory('stage'),
  risers:         assetsByCategory('risers'),
  tin_barricade:  assetsByCategory('tin_barricade'),
  mojo_barricade: assetsByCategory('mojo_barricade'),
  welfare:        assetsByCategory('welfare'),
};

/** Which sub-categories belong to each group (ordered for display). */
export const groupSubCategories: Record<AssetGroup, AssetCategory[]> = {
  technical:    ['audio', 'lighting', 'led'],
  staging:      ['trussing', 'scaffolding', 'stage', 'risers'],
  construction: ['tin_barricade', 'mojo_barricade', 'welfare'],
};
