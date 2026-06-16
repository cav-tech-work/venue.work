import * as pc from 'playcanvas';

/* ═══════════════════════════════════════════════════════════════════════════
   PUBLIC API SURFACE
   All exports remain stable across rewrites — React consumers, the viewer
   page, and the editor page depend on this surface.
 ══════════════════════════════════════════════════════════════════════════ */

export interface EngineConfig {
  canvas: HTMLCanvasElement;
  debug?: boolean;
}

/**
 * World-space coordinate produced by a raycaster.
 * All floats are rounded to 4 decimal places for ledger display.
 */
export interface SpatialCoordinate {
  x:          number;
  y:          number;
  z:          number;
  /** Canvas-relative pixel X of the originating click. */
  screenX:    number;
  /** Canvas-relative pixel Y of the originating click. */
  screenY:    number;
  /** 'GroundPlane::Y=0' for mathematical hits, mesh name for proxy hits. */
  entityName: string;
  timestamp:  string;
}

/**
 * Completed measurement pair: two anchor coordinates and their Euclidean
 * distance in metres.
 */
export interface SpatialMeasurement {
  anchorA:   SpatialCoordinate;
  anchorB:   SpatialCoordinate;
  /** √(Δx²+Δy²+Δz²) in metres, rounded to 4 d.p. */
  distance:  number;
  timestamp: string;
}

/**
 * Screen-space projection of the active measurement midpoint.
 * Dispatched every animation frame as `spatial-midpoint-moved` while a
 * complete A–B anchor pair is held in memory.
 */
export interface SpatialMidpoint {
  /** CSS-pixel X — position HTML badge at this coordinate. */
  screenX: number;
  /** CSS-pixel Y — position HTML badge at this coordinate. */
  screenY: number;
  worldX:  number;
  worldY:  number;
  worldZ:  number;
  /** False when midpoint is behind the camera — hide HTML label when so. */
  visible: boolean;
}

/** Metadata broadcast when an injected model is selected or deselected. */
export interface InjectedModelHandle {
  id:       string;
  modelUrl: string;
  position: { x: number; y: number; z: number };
}

/**
 * Serialised asset record used as input to `loadSavedLayoutBuild`.
 *
 * Compatible with `SceneAssetRecord` from `exportEngine.ts` — both shapes
 * share `modelUrl`, `name`, `group`, and `category`.  Position and rotation
 * are optional; when absent the engine stagger-places models along the X axis
 * so they never overlap.
 *
 * Position may be stored as either an object `{ x, y, z }` or a tuple
 * `[x, y, z]` — the engine normalises both.
 */
export interface SavedAssetRecord {
  /** Relative URL to the glTF / glb model file (required). */
  modelUrl:   string;
  /** Human-readable product name — used only for logging. */
  name?:      string;
  /** Top-level group: 'technical' | 'staging' | 'construction'. */
  group?:     string;
  /** Granular sub-category slug. */
  category?:  string;
  /**
   * World-space position in metres.
   * Object form: `{ x, y, z }` — written by the viewer's export pipeline.
   * Tuple form:  `[x, y, z]`   — accepted for third-party serialisers.
   */
  position?:  { x: number; y: number; z: number } | [number, number, number];
  /**
   * Euler rotation angles in degrees (yaw/pitch/roll → Y/X/Z in PlayCanvas).
   * Same dual-form support as `position`.
   */
  rotation?:  { x: number; y: number; z: number } | [number, number, number];
  /** Allow any other fields carried by the originating manifest. */
  [key: string]: unknown;
}

/**
 * Active interaction mode.
 *  - 'navigate' — FPS drag + scroll zoom; zero selection logic.
 *  - 'measure'  — click-to-anchor pipeline; guide line + badge on every frame.
 *  - 'inject'   — model selection / placement recording.
 */
export type InteractionMode = 'navigate' | 'measure' | 'inject';

/** Direct callback fired on every successful coordinate capture. */
export type CoordinateCallback = (coord: SpatialCoordinate) => void;

/* ─── Event name constants ────────────────────────────────────────────────── */

export const SPATIAL_METRIC_EVENT         = 'spatial-metric-logged'  as const;
export const SPATIAL_MODEL_SELECTED_EVENT = 'spatial-model-selected' as const;
export const SPATIAL_MIDPOINT_EVENT       = 'spatial-midpoint-moved' as const;

/* ─── WindowEventMap augmentation ────────────────────────────────────────── */

declare global {
  interface WindowEventMap {
    'spatial-metric-logged':  CustomEvent<SpatialMeasurement>;
    'spatial-model-selected': CustomEvent<InjectedModelHandle | null>;
    'spatial-midpoint-moved': CustomEvent<SpatialMidpoint>;
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   TUNING CONSTANTS
 ══════════════════════════════════════════════════════════════════════════ */

/**
 * Camera navigation constants.
 * All speeds are intentionally low — they are multiplied by raw pixel deltas
 * so even small constants yield visible motion.
 */
const CAM = {
  /** Degrees of yaw per pixel of horizontal mouse drag. */
  YAW_SPEED:         0.25,
  /** Degrees of pitch per pixel of vertical mouse drag. */
  PITCH_SPEED:       0.25,
  /**
   * Local-Z units moved per normalised wheel tick (1 tick ≈ 100 px delta).
   * Positive = backward, negative = forward (PlayCanvas camera local-Z convention).
   */
  ZOOM_SPEED:        0.5,
  /** Hard pitch clamp in degrees — prevents camera flipping over the top. */
  PITCH_LIMIT:       88,
  /** px² squared-distance threshold below which mouse-down+up is a click. */
  CLICK_MAX_DRAG_SQ: 16,
} as const;

const INJECT = {
  TRANSLATE_SPEED: 0.25,
} as const;

/* ═══════════════════════════════════════════════════════════════════════════
   SplatEngine
 ══════════════════════════════════════════════════════════════════════════ */

export class SplatEngine {
  private app:             pc.Application | null = null;
  private cameraEntity:    pc.Entity      | null = null;
  private splatEntity:     pc.Entity      | null = null;
  private proxyMeshEntity: pc.Entity      | null = null;
  private canvas:          HTMLCanvasElement;

  /* ── Interaction mode ──────────────────────────────────────────────────── */

  private interactionMode:    InteractionMode    = 'navigate';
  private coordinateCallback: CoordinateCallback | null = null;

  /* ── FPS camera Euler state ────────────────────────────────────────────── */

  /**
   * Accumulated yaw angle in degrees (rotation around world Y axis).
   * Updated every drag frame; applied atomically via `setEulerAngles` —
   * equivalent to calling `rotateLocal(0, yawDelta, 0)` each frame but
   * without floating-point drift across thousands of frames.
   */
  private cameraYaw   = 0;

  /**
   * Accumulated pitch angle in degrees (rotation around local X axis).
   * Clamped to ±PITCH_LIMIT before every `setEulerAngles` application —
   * equivalent to calling `rotateLocal(pitchDelta, 0, 0)` each frame but
   * prevents gimbal-lock flip at ±90°.
   */
  private cameraPitch = -10;

  /* ── Raw input state (fed directly by native DOM listeners) ────────────── */

  private isDragging = false;
  private lastMouseX = 0;
  private lastMouseY = 0;
  /**
   * Squared pixel distance accumulated during the current press.
   * Compared against CLICK_MAX_DRAG_SQ to distinguish a click from a drag.
   * Read by `_onSelectionMouseUp` (canvas target phase) before being reset
   * by `_onMouseUp` (window bubble phase).
   */
  private dragDistSq = 0;

  /* ── Measurement anchors ───────────────────────────────────────────────── */

  /**
   * First anchor of the active measurement pair.
   * Cleared when the user starts a new pair (next first click).
   */
  private anchorA: SpatialCoordinate | null = null;

  /**
   * Second anchor of the most recently completed measurement pair.
   * Kept in memory after the pair completes so `tickMeasureLine` can
   * render the guide line and badge every frame until a new pair begins.
   */
  private anchorB: SpatialCoordinate | null = null;

  /** Purple RGBA colour for the immediate-mode WebGL guide line. */
  private readonly _measureLineColor = new pc.Color(0.502, 0, 0.502, 1);

  /* ── Injection subsystem ───────────────────────────────────────────────── */

  private injectedModels:        Map<string, pc.Entity> = new Map();
  private activeSelection:       pc.Entity | null = null;
  private activeSelectionHandle: string   | null = null;
  private lastGroundHit:         pc.Vec3 = new pc.Vec3(0, 0, 0);

  /* ── Bound handler references (one allocation, stable for add/remove) ──── */

  /**
   * Persistent navigation handlers — always attached for the engine lifetime.
   * Bound directly to the native canvas DOM node, bypassing PlayCanvas's
   * high-level input hooks entirely.
   */
  private readonly _onMouseDown:        (e: MouseEvent)    => void;
  private readonly _onMouseMove:        (e: MouseEvent)    => void;
  private readonly _onMouseUp:          (e: MouseEvent)    => void;
  private readonly _onWheel:            (e: WheelEvent)    => void;
  private readonly _onKeyDown:          (e: KeyboardEvent) => void;
  private readonly _onResize:           ()                 => void;

  /**
   * Mode-scoped selection handler — attached to the canvas only when the
   * interaction mode is 'measure' or 'inject'.
   * Explicitly removed via `canvas.removeEventListener` when reverting to
   * 'navigate' so zero selection logic runs in navigation-only mode.
   */
  private readonly _onSelectionMouseUp: (e: MouseEvent)    => void;

  /* ═══════════════════════════════════════════════════════════════════════
     Constructor
   ══════════════════════════════════════════════════════════════════════ */

  constructor(config: EngineConfig) {
    console.log('[SplatEngine] Initializing isolated native-input spatial context…');
    this.canvas = config.canvas;

    /*
     * PlayCanvas Application with NO input device objects passed.
     * All mouse and keyboard input is handled by raw DOM listeners below,
     * completely bypassing PlayCanvas's high-level input hooks.
     */
    this.app = new pc.Application(config.canvas, {});
    this.app.start();
    this.setupCoreEnvironment();

    /* Pre-bind every handler reference once — required for stable add/remove. */
    this._onMouseDown        = this.handleMouseDown.bind(this);
    this._onMouseMove        = this.handleMouseMove.bind(this);
    this._onMouseUp          = this.handleMouseUp.bind(this);
    this._onWheel            = this.handleWheel.bind(this);
    this._onKeyDown          = this.handleKeyDown.bind(this);
    this._onResize           = () => this.app?.resizeCanvas();
    this._onSelectionMouseUp = this.handleSelectionMouseUp.bind(this);

    /*
     * Attach core navigation listeners DIRECTLY to the canvas DOM node.
     * `window` is used for mouseup and keydown so events are captured even
     * when the pointer leaves the canvas mid-drag.
     */
    this.attachCoreListeners();

    /* Per-frame hook: measure guide-line rendering + badge broadcast. */
    this.app.on('update', () => this.tickMeasureLine());
  }

  /* ═══════════════════════════════════════════════════════════════════════
     Scene Setup
   ══════════════════════════════════════════════════════════════════════ */

  private setupCoreEnvironment(): void {
    if (!this.app) return;
    const app = this.app;

    app.setCanvasFillMode(pc.FILLMODE_FILL_WINDOW);
    app.setCanvasResolution(pc.RESOLUTION_AUTO);

    const camera = new pc.Entity('MainCamera');
    camera.addComponent('camera', {
      clearColor: new pc.Color(0, 0, 0, 1),
      farClip:    500,
      nearClip:   0.1,
    });

    /* Start position: elevated, looking slightly downward into the scene. */
    camera.setPosition(0, 3, 8);
    camera.setEulerAngles(this.cameraPitch, this.cameraYaw, 0);
    app.root.addChild(camera);
    this.cameraEntity = camera;

    const light = new pc.Entity('KeyLight');
    light.addComponent('light', {
      type:      'directional',
      color:     new pc.Color(1, 1, 1),
      intensity: 1.5,
    });
    light.setEulerAngles(45, 45, 0);
    app.root.addChild(light);
  }

  /* ═══════════════════════════════════════════════════════════════════════
     Native DOM Listener Management
   ══════════════════════════════════════════════════════════════════════ */

  /**
   * Binds the persistent input listener set directly to the canvas DOM node
   * and window — completely bypassing PlayCanvas's internal input pipeline.
   * Called once from the constructor; listeners live for the engine lifetime.
   */
  private attachCoreListeners(): void {
    this.canvas.addEventListener('mousedown', this._onMouseDown);
    this.canvas.addEventListener('mousemove', this._onMouseMove);
    window.addEventListener('mouseup',        this._onMouseUp);
    this.canvas.addEventListener('wheel',     this._onWheel, { passive: false });
    window.addEventListener('keydown',        this._onKeyDown);
    window.addEventListener('resize',         this._onResize);
  }

  /** Detaches all persistent listeners. Called only from `destroy()`. */
  private detachCoreListeners(): void {
    this.canvas.removeEventListener('mousedown', this._onMouseDown);
    this.canvas.removeEventListener('mousemove', this._onMouseMove);
    window.removeEventListener('mouseup',         this._onMouseUp);
    this.canvas.removeEventListener('wheel',      this._onWheel);
    window.removeEventListener('keydown',         this._onKeyDown);
    window.removeEventListener('resize',          this._onResize);
  }

  /** Attaches the mode-scoped selection listener. Called when entering measure/inject. */
  private attachSelectionListener(): void {
    this.canvas.addEventListener('mouseup', this._onSelectionMouseUp);
  }

  /**
   * Removes the mode-scoped selection listener from the canvas DOM node.
   * Called when reverting to 'navigate' — ensures zero selection logic
   * executes while the engine is in navigation-only mode.
   */
  private detachSelectionListener(): void {
    this.canvas.removeEventListener('mouseup', this._onSelectionMouseUp);
  }

  /* ═══════════════════════════════════════════════════════════════════════
     Navigation Handlers (persistent — always attached)
   ══════════════════════════════════════════════════════════════════════ */

  private handleMouseDown(e: MouseEvent): void {
    if (e.button !== 0) return;
    this.isDragging = true;
    this.lastMouseX = e.clientX;
    this.lastMouseY = e.clientY;
    this.dragDistSq = 0;

    if (this.interactionMode === 'navigate') {
      this.canvas.style.cursor = 'grabbing';
    }
  }

  /**
   * Navigation drag handler — Direct Camera Engine.
   *
   * When mode is 'navigate', calculates the pixel delta from the previous
   * frame and transforms the camera entity's pan (yaw) and tilt (pitch)
   * rotation parameters:
   *
   *   Horizontal mouse delta (dx) → yaw  around world Y
   *   Vertical   mouse delta (dy) → pitch around local X (clamped)
   *
   * This is equivalent to calling:
   *   cameraEntity.rotateLocal(pitchDelta * speed, yawDelta * speed, 0)
   * each frame, but applied atomically via `setEulerAngles` to prevent
   * floating-point drift and guarantee clean pitch clamping at ±PITCH_LIMIT.
   *
   * Drag accumulation runs unconditionally so `dragDistSq` is always valid
   * for click detection in `_onSelectionMouseUp`.
   */
  private handleMouseMove(e: MouseEvent): void {
    if (!this.isDragging) return;

    const dx = e.clientX - this.lastMouseX;
    const dy = e.clientY - this.lastMouseY;

    this.dragDistSq += dx * dx + dy * dy;
    this.lastMouseX  = e.clientX;
    this.lastMouseY  = e.clientY;

    if (this.interactionMode !== 'navigate' || !this.cameraEntity) return;

    /* Pan:  horizontal drag → yaw delta (degrees). */
    this.cameraYaw -= dx * CAM.YAW_SPEED;

    /* Tilt: vertical drag → pitch delta, hard-clamped to ±PITCH_LIMIT. */
    this.cameraPitch -= dy * CAM.PITCH_SPEED;
    this.cameraPitch  = Math.max(-CAM.PITCH_LIMIT, Math.min(CAM.PITCH_LIMIT, this.cameraPitch));

    /* Apply accumulated Euler state — equivalent to per-frame rotateLocal calls. */
    this.cameraEntity.setEulerAngles(this.cameraPitch, this.cameraYaw, 0);
  }

  /**
   * Navigation mouseup (window) — resets drag state and cursor.
   * Fires in the BUBBLE PHASE, after `_onSelectionMouseUp` (canvas target
   * phase) has already read `dragDistSq`, so the reset here is safe.
   */
  private handleMouseUp(e: MouseEvent): void {
    if (e.button !== 0) return;
    this.isDragging = false;
    this.dragDistSq = 0;

    if (this.interactionMode === 'navigate') {
      this.canvas.style.cursor = 'grab';
    }
  }

  /**
   * Mode-scoped selection mouseup (canvas target phase).
   *
   * Fires BEFORE `_onMouseUp` (window bubble phase), so `dragDistSq` is
   * still the accumulated drag distance from this press when we read it.
   * Only attached when mode is 'measure' or 'inject'.
   */
  private handleSelectionMouseUp(e: MouseEvent): void {
    if (e.button !== 0) return;
    if (this.dragDistSq < CAM.CLICK_MAX_DRAG_SQ) {
      this.dispatchRaycast(e.clientX, e.clientY);
    }
  }

  /**
   * Scroll-wheel zoom — Direct forward/backward focal translation.
   *
   * Translates the camera along its LOCAL −Z axis (the look direction) by
   * calling `translateLocal(0, 0, step)` where step > 0 = backward, < 0 = forward.
   * This keeps the dolly axis perfectly aligned to wherever the camera is
   * pointing regardless of pan or tilt angle.
   *
   *   Scroll up   (deltaY < 0) → forward  → step < 0
   *   Scroll down (deltaY > 0) → backward → step > 0
   */
  private handleWheel(e: WheelEvent): void {
    e.preventDefault();
    if (!this.cameraEntity) return;

    const rawDelta = e.deltaMode === WheelEvent.DOM_DELTA_LINE
      ? e.deltaY * 16   // normalise line-scroll to pixel-scroll magnitude
      : e.deltaY;

    /* One normalised scroll tick (100 px) moves ZOOM_SPEED world units. */
    const step = (rawDelta / 100) * CAM.ZOOM_SPEED;

    /* translateLocal: positive Z = backward (local −Z is forward in PlayCanvas). */
    this.cameraEntity.translateLocal(0, 0, step);
  }

  /* ═══════════════════════════════════════════════════════════════════════
     Arrow-Key Translation (inject mode)
   ══════════════════════════════════════════════════════════════════════ */

  private handleKeyDown(e: KeyboardEvent): void {
    if (this.interactionMode !== 'inject' || !this.activeSelection) return;

    const isArrow =
      e.key === 'ArrowLeft'  || e.key === 'ArrowRight' ||
      e.key === 'ArrowUp'    || e.key === 'ArrowDown';
    if (!isArrow) return;
    e.preventDefault();

    const step = INJECT.TRANSLATE_SPEED;
    const pos  = this.activeSelection.getPosition();

    switch (e.key) {
      case 'ArrowLeft':  this.activeSelection.setPosition(pos.x - step, pos.y, pos.z); break;
      case 'ArrowRight': this.activeSelection.setPosition(pos.x + step, pos.y, pos.z); break;
      case 'ArrowUp':    this.activeSelection.setPosition(pos.x, pos.y, pos.z - step); break;
      case 'ArrowDown':  this.activeSelection.setPosition(pos.x, pos.y, pos.z + step); break;
    }
  }

  /* ═══════════════════════════════════════════════════════════════════════
     Interaction Mode API
   ══════════════════════════════════════════════════════════════════════ */

  /**
   * Switches the active interaction mode.
   *
   * 'navigate':
   *   • `canvas.removeEventListener('mouseup', _onSelectionMouseUp)` —
   *     all custom selection click listeners are thoroughly detached.
   *   • Both measurement anchors are cleared (stops guide-line rendering).
   *   • Any active inject selection is deselected.
   *   • Cursor reverts to 'grab'.
   *
   * 'measure' / 'inject':
   *   • `canvas.addEventListener('mouseup', _onSelectionMouseUp)` —
   *     the mode-scoped selection pipeline is re-engaged.
   *   • Cursor switches to 'crosshair'.
   */
  public setInteractionMode(mode: InteractionMode): void {
    this.interactionMode = mode;

    if (mode === 'navigate') {
      this.detachSelectionListener();
      this.canvas.style.cursor = 'grab';
      this.anchorA = null;
      this.anchorB = null;
      this.applyDeselection();
      console.log('[SplatEngine] Mode → navigate. Selection listeners detached from canvas.');
    } else {
      this.attachSelectionListener();
      this.canvas.style.cursor = 'crosshair';
      console.log(`[SplatEngine] Mode → ${mode}. Selection listener attached to canvas.`);
    }
  }

  /** Public alias — satisfies both naming conventions used across viewer/editor. */
  public setEngineMode(mode: InteractionMode): void {
    this.setInteractionMode(mode);
  }

  public onCoordinateCapture(callback: CoordinateCallback): void {
    this.coordinateCallback = callback;
  }

  /* ═══════════════════════════════════════════════════════════════════════
     Bulletproof Ground Raycasting
   ══════════════════════════════════════════════════════════════════════ */

  /**
   * Routes a validated click to the correct handler based on mode.
   * In both measure and inject modes the primary raycaster is the
   * mathematical ground plane intersector which never fails on a miss
   * (unlike mesh-based raycasts that require geometry to be loaded).
   */
  private dispatchRaycast(clientX: number, clientY: number): void {
    if (this.interactionMode === 'inject') {
      /* Try to pick an existing injected model first. */
      const picked = this.pickInjectedEntity(clientX, clientY);
      if (picked !== null) { this.applySelection(picked); return; }

      /* No model hit → record ground position as next placement target. */
      const coord = this.intersectGroundPlane(clientX, clientY)
                 ?? this.performProxyMeshRaycast(clientX, clientY);
      if (coord) this.handleInjectGroundCapture(coord);
      return;
    }

    if (this.interactionMode === 'measure') {
      /*
       * Project a screen-space line vector directly into the solid infinite
       * mathematical ground plane fixed at Y = 0.  Falls back to proxy mesh
       * AABB raycast if the camera is pointing upward and misses the plane.
       */
      const coord = this.intersectGroundPlane(clientX, clientY)
                 ?? this.performProxyMeshRaycast(clientX, clientY);
      if (coord) {
        this.handleMeasurementCapture(coord);
      } else {
        console.log('[SplatEngine] Raycast: no ground or mesh intersection.');
      }
    }
  }

  /**
   * Bulletproof solid infinite ground-plane intersection.
   *
   * Casts a camera ray through the clicked screen pixel and solves for its
   * intersection with the mathematical plane Y = 0.
   *
   * Derivation (no mesh required):
   *   Ray:   P(t) = origin + t · direction
   *   Plane: Y = 0  →  origin.y + t · direction.y = 0
   *   ∴  t = −origin.y / direction.y
   *   Hit: X = origin.x + t·direction.x,  Z = origin.z + t·direction.z
   *
   * Returns null when:
   *   • |direction.y| < ε   (ray nearly parallel to the plane)
   *   • t < 0               (intersection is behind the camera)
   */
  private intersectGroundPlane(clientX: number, clientY: number): SpatialCoordinate | null {
    if (!this.app || !this.cameraEntity?.camera) return null;

    const camera = this.cameraEntity.camera;
    const rect   = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width  / rect.width;
    const scaleY = this.canvas.height / rect.height;
    const px     = (clientX - rect.left) * scaleX;
    const py     = (clientY - rect.top)  * scaleY;

    const origin = camera.screenToWorld(px, py, camera.nearClip);
    const farPt  = camera.screenToWorld(px, py, camera.farClip);
    const dir    = new pc.Vec3().sub2(farPt, origin).normalize();

    const EPSILON = 1e-6;
    if (Math.abs(dir.y) < EPSILON) return null; // ray nearly parallel to plane
    const t = -origin.y / dir.y;
    if (t < 0) return null;                      // intersection behind camera

    return {
      x:          parseFloat((origin.x + t * dir.x).toFixed(4)),
      y:          0,
      z:          parseFloat((origin.z + t * dir.z).toFixed(4)),
      screenX:    clientX,
      screenY:    clientY,
      entityName: 'GroundPlane::Y=0',
      timestamp:  new Date().toISOString(),
    };
  }

  /* ─── Proxy mesh AABB fallback ──────────────────────────────────────────── */

  private performProxyMeshRaycast(clientX: number, clientY: number): SpatialCoordinate | null {
    if (!this.cameraEntity?.camera || !this.proxyMeshEntity) return null;

    const { ray, origin } = this.buildCameraRay(clientX, clientY);
    const aabbs           = this.collectEntityAABBs(this.proxyMeshEntity);
    const hitPoint        = this.closestAABBHit(ray, aabbs, origin);
    if (!hitPoint) return null;

    return {
      x:          parseFloat(hitPoint.x.toFixed(4)),
      y:          parseFloat(hitPoint.y.toFixed(4)),
      z:          parseFloat(hitPoint.z.toFixed(4)),
      screenX:    clientX,
      screenY:    clientY,
      entityName: this.proxyMeshEntity.name,
      timestamp:  new Date().toISOString(),
    };
  }

  private pickInjectedEntity(clientX: number, clientY: number): pc.Entity | null {
    if (!this.cameraEntity?.camera || this.injectedModels.size === 0) return null;

    const { ray, origin } = this.buildCameraRay(clientX, clientY);
    let closestDistSq = Infinity;
    let hitEntity: pc.Entity | null = null;
    const candidate = new pc.Vec3();

    for (const [, entity] of this.injectedModels) {
      for (const aabb of this.collectEntityAABBs(entity)) {
        if (aabb.intersectsRay(ray, candidate)) {
          const d = candidate.clone().sub(origin).lengthSq();
          if (d < closestDistSq) { closestDistSq = d; hitEntity = entity; }
        }
      }
    }
    return hitEntity;
  }

  /* ─── Shared raycast helpers ────────────────────────────────────────────── */

  private buildCameraRay(clientX: number, clientY: number): { ray: pc.Ray; origin: pc.Vec3 } {
    const camera = this.cameraEntity!.camera!;
    const rect   = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width  / rect.width;
    const scaleY = this.canvas.height / rect.height;
    const px     = (clientX - rect.left) * scaleX;
    const py     = (clientY - rect.top)  * scaleY;

    const origin = camera.screenToWorld(px, py, camera.nearClip);
    const farPt  = camera.screenToWorld(px, py, camera.farClip);
    const dir    = new pc.Vec3().sub2(farPt, origin).normalize();

    return { ray: new pc.Ray(origin.clone(), dir), origin };
  }

  private closestAABBHit(ray: pc.Ray, aabbs: pc.BoundingBox[], from: pc.Vec3): pc.Vec3 | null {
    let closestDistSq = Infinity;
    let hitPoint: pc.Vec3 | null = null;
    const candidate = new pc.Vec3();

    for (const aabb of aabbs) {
      if (aabb.intersectsRay(ray, candidate)) {
        const d = candidate.clone().sub(from).lengthSq();
        if (d < closestDistSq) { closestDistSq = d; hitPoint = candidate.clone(); }
      }
    }
    return hitPoint;
  }

  private collectEntityAABBs(entity: pc.Entity): pc.BoundingBox[] {
    const boxes: pc.BoundingBox[] = [];
    const walk = (e: pc.Entity): void => {
      const render = e.render as pc.RenderComponent | undefined;
      if (render?.meshInstances) {
        for (const mi of render.meshInstances) boxes.push(mi.aabb);
      }
      for (let i = 0; i < e.children.length; i++) {
        const child = e.children[i];
        if (child instanceof pc.Entity) walk(child);
      }
    };
    walk(entity);
    return boxes;
  }

  /* ═══════════════════════════════════════════════════════════════════════
     Measurement Capture Pipeline
   ══════════════════════════════════════════════════════════════════════ */

  /**
   * Two-click Euclidean measurement pipeline.
   *
   * Click 1 → Store Anchor A (Point A logged to console and callback).
   *            anchorB is cleared to reset any stale previous pair.
   *
   * Click 2 → Store Anchor B (Point B logged).
   *            Euclidean distance = √(Δx²+Δy²+Δz²) computed.
   *            Standard browser notification dispatched immediately:
   *
   *              window.dispatchEvent(new CustomEvent('spatial-metric-logged', {
   *                detail: { anchorA, anchorB, distance, timestamp }
   *              }))
   *
   *            → Fills the React sidebar ledger table in real time.
   *
   * Both anchors are KEPT in memory after the pair completes so
   * `tickMeasureLine()` can render the guide line and midpoint badge
   * every animation frame until the user starts a new pair.
   */
  private handleMeasurementCapture(coord: SpatialCoordinate): void {
    if (!this.anchorA) {
      /* Point A: first click of the pair. */
      this.anchorA = coord;
      this.anchorB = null;
      console.log(`[MEASURE] Point A logged: (${coord.x}, ${coord.y}, ${coord.z})`);
      this.coordinateCallback?.(coord);
      return;
    }

    /* Point B: second click — complete the pair. */
    this.anchorB = coord;

    const dx = coord.x - this.anchorA.x;
    const dy = coord.y - this.anchorA.y;
    const dz = coord.z - this.anchorA.z;

    /* Precise Euclidean metric distance in metres. */
    const distance = parseFloat(Math.sqrt(dx * dx + dy * dy + dz * dz).toFixed(4));

    console.log(`[MEASURE] Point B logged: (${coord.x}, ${coord.y}, ${coord.z})`);
    console.log(`[MEASURE] Euclidean distance = ${distance} m`);

    const measurement: SpatialMeasurement = {
      anchorA:   this.anchorA,
      anchorB:   this.anchorB,
      distance,
      timestamp: new Date().toISOString(),
    };

    /* Dispatch browser notification — seamlessly fills the React sidebar ledger. */
    window.dispatchEvent(
      new CustomEvent<SpatialMeasurement>(SPATIAL_METRIC_EVENT, { detail: measurement })
    );

    this.coordinateCallback?.(coord);

    /*
     * anchorA and anchorB are intentionally NOT cleared here.
     * Both remain in memory so tickMeasureLine() keeps the purple guide
     * line and midpoint badge rendered until the next pair begins.
     */
  }

  private handleInjectGroundCapture(coord: SpatialCoordinate): void {
    this.lastGroundHit.set(coord.x, coord.y, coord.z);
    console.log(`[INJECT] Placement target → (${coord.x}, ${coord.y}, ${coord.z})`);
    this.coordinateCallback?.(coord);
  }

  /* ═══════════════════════════════════════════════════════════════════════
     Per-Frame Measure Line Rendering (registered via app.on('update'))
   ══════════════════════════════════════════════════════════════════════ */

  /**
   * Called every animation frame via `app.on('update')`.
   *
   * Validation gates (all must pass):
   *   1. Mode === 'measure'.
   *   2. Both anchorA and anchorB are in memory.
   *   3. App and camera entity are live.
   *
   * When gates pass:
   *   A. Build pc.Vec3 world positions from the two anchor coordinates.
   *   B. Draw a persistent purple WebGL guide line between them.
   *   C. Compute the 3D midpoint vector.
   *   D. Project midpoint to screen-space CSS pixel coordinates.
   *   E. Dispatch `spatial-midpoint-moved` so the React floating badge tracks.
   */
  private tickMeasureLine(): void {
    if (this.interactionMode !== 'measure') return;
    if (!this.anchorA || !this.anchorB)      return;
    if (!this.app || !this.cameraEntity?.camera) return;

    /* ── A. World vectors ─────────────────────────────────────────────── */
    const vecA = new pc.Vec3(this.anchorA.x, this.anchorA.y, this.anchorA.z);
    const vecB = new pc.Vec3(this.anchorB.x, this.anchorB.y, this.anchorB.z);

    /* ── B. Purple guide line ─────────────────────────────────────────── */
    this.drawMeasureLine(vecA, vecB);

    /* ── C. Midpoint ──────────────────────────────────────────────────── */
    const mid = new pc.Vec3(
      (vecA.x + vecB.x) * 0.5,
      (vecA.y + vecB.y) * 0.5,
      (vecA.z + vecB.z) * 0.5
    );

    /* ── D. Project midpoint to CSS pixel coordinates ─────────────────── */
    const screen = this.worldToScreenCSS(mid);
    if (!screen) return;

    /* ── E. Badge position broadcast ─────────────────────────────────── */
    window.dispatchEvent(
      new CustomEvent<SpatialMidpoint>(SPATIAL_MIDPOINT_EVENT, {
        detail: {
          screenX: screen.x,
          screenY: screen.y,
          worldX:  mid.x,
          worldY:  mid.y,
          worldZ:  mid.z,
          visible: screen.visible,
        },
      })
    );
  }

  /**
   * Immediate-mode WebGL line draw between two world-space points.
   * Tries `app.renderLine` first (PlayCanvas ≤ 1.x), falls back to
   * `app.drawLine` (PlayCanvas 2.x+). Silently skips if neither exists.
   */
  private drawMeasureLine(start: pc.Vec3, end: pc.Vec3): void {
    if (!this.app) return;
    const app = this.app as unknown as Record<string, unknown>;

    if (typeof app['renderLine'] === 'function') {
      (app['renderLine'] as (s: pc.Vec3, e: pc.Vec3, c: pc.Color) => void)(
        start, end, this._measureLineColor
      );
    } else if (typeof app['drawLine'] === 'function') {
      (app['drawLine'] as (s: pc.Vec3, e: pc.Vec3, c: pc.Color) => void)(
        start, end, this._measureLineColor
      );
    }
  }

  /**
   * Projects a world-space Vec3 to CSS pixel coordinates (viewport-relative),
   * accounting for the canvas DPI/layout scale ratio.
   * Returns null when the camera component is unavailable.
   */
  private worldToScreenCSS(worldPos: pc.Vec3): { x: number; y: number; visible: boolean } | null {
    if (!this.cameraEntity?.camera) return null;

    const cam = this.cameraEntity.camera as unknown as Record<string, unknown>;
    const fn  = cam['worldToScreen'] as ((v: pc.Vec3) => pc.Vec3) | undefined;
    if (typeof fn !== 'function') return null;

    /* screenVec: x = canvas px, y = canvas px from top, z = depth. */
    const sv     = fn.call(this.cameraEntity.camera, worldPos);
    const rect   = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width  / rect.width;
    const scaleY = this.canvas.height / rect.height;

    return {
      x:       sv.x / scaleX + rect.left,
      y:       sv.y / scaleY + rect.top,
      visible: (sv.z as number) > 0,
    };
  }

  /* ═══════════════════════════════════════════════════════════════════════
     Selection State Machine
   ══════════════════════════════════════════════════════════════════════ */

  private applySelection(entity: pc.Entity): void {
    let handle: string | null = null;
    for (const [h, e] of this.injectedModels) {
      if (e === entity) { handle = h; break; }
    }
    if (!handle) return;

    this.activeSelection       = entity;
    this.activeSelectionHandle = handle;

    const pos = entity.getPosition();
    window.dispatchEvent(
      new CustomEvent<InjectedModelHandle>(SPATIAL_MODEL_SELECTED_EVENT, {
        detail: { id: handle, modelUrl: handle, position: { x: pos.x, y: pos.y, z: pos.z } },
      })
    );
    console.log(`[INJECT] Selected: ${handle}`);
  }

  private applyDeselection(): void {
    if (!this.activeSelection) return;
    this.activeSelection       = null;
    this.activeSelectionHandle = null;
    window.dispatchEvent(
      new CustomEvent<null>(SPATIAL_MODEL_SELECTED_EVENT, { detail: null })
    );
    console.log('[INJECT] Deselected.');
  }

  /* ═══════════════════════════════════════════════════════════════════════
     Ground-Snap Positioning
   ══════════════════════════════════════════════════════════════════════ */

  private snapEntityToGround(entity: pc.Entity, x: number, z: number): void {
    entity.setPosition(x, 0, z);
    const aabbs = this.collectEntityAABBs(entity);
    if (aabbs.length === 0) return;

    let minY = Infinity;
    for (const aabb of aabbs) {
      const bottom = aabb.center.y - aabb.halfExtents.y;
      if (bottom < minY) minY = bottom;
    }

    entity.setPosition(x, -minY, z);
    console.log(`[INJECT] Ground snap → AABB floor Y=${minY.toFixed(4)}, entity Y=${(-minY).toFixed(4)}`);
  }

  /* ═══════════════════════════════════════════════════════════════════════
     Public: 3D Model Injection
   ══════════════════════════════════════════════════════════════════════ */

  public async inject3DModel(modelUrl: string): Promise<string> {
    if (!this.app) throw new Error('[SplatEngine] Engine not initialized.');

    const handle = `injected::${Date.now()}::${Math.random().toString(36).slice(2, 7)}`;
    const placeX = this.lastGroundHit.x;
    const placeZ = this.lastGroundHit.z;

    console.log(`[INJECT] Loading: ${modelUrl}`);
    console.log(`[INJECT] Target XZ: (${placeX}, ${placeZ})`);

    return new Promise<string>((resolve, reject) => {
      if (!this.app) return reject(new Error('[SplatEngine] Engine not initialized.'));
      const app   = this.app;
      const asset = new pc.Asset(handle, 'container', { url: modelUrl });

      asset.on('load', (loadedAsset: pc.Asset) => {
        const entity = (loadedAsset.resource as any).instantiateRenderEntity() as pc.Entity;
        entity.name  = handle;
        app.root.addChild(entity);
        this.snapEntityToGround(entity, placeX, placeZ);
        this.injectedModels.set(handle, entity);
        this.applySelection(entity);
        const pos = entity.getPosition();
        console.log(
          `[INJECT] Ready: ${handle} @ ` +
          `(${pos.x.toFixed(3)}, ${pos.y.toFixed(3)}, ${pos.z.toFixed(3)})`
        );
        resolve(handle);
      });

      asset.on('error', (err: string) =>
        reject(new Error(`[INJECT] Load fault [${modelUrl}]: ${err}`))
      );
      app.assets.add(asset);
      app.assets.load(asset);
    });
  }

  public selectInjectedModel(handle: string): void {
    const entity = this.injectedModels.get(handle);
    if (!entity) { console.warn(`[INJECT] Handle not found: ${handle}`); return; }
    this.applySelection(entity);
  }

  public deselectModel(): void { this.applyDeselection(); }

  public translateActiveSelection(dx: number, dz: number): void {
    if (!this.activeSelection) return;
    const pos = this.activeSelection.getPosition();
    this.activeSelection.setPosition(pos.x + dx, pos.y, pos.z + dz);
  }

  public removeInjectedModel(handle: string): void {
    const entity = this.injectedModels.get(handle);
    if (!entity) return;
    if (this.activeSelection === entity) this.applyDeselection();
    entity.destroy();
    this.injectedModels.delete(handle);
    console.log(`[INJECT] Removed: ${handle}`);
  }

  public getActiveSelectionHandle(): string | null { return this.activeSelectionHandle; }

  public getLastGroundHit(): { x: number; y: number; z: number } {
    return { x: this.lastGroundHit.x, y: this.lastGroundHit.y, z: this.lastGroundHit.z };
  }

  /* ═══════════════════════════════════════════════════════════════════════
     Public: Saved Layout Build Restoration
     Clears all loose meshes then re-instantiates each serialised asset at
     its stored world-space position and Euler rotation.
   ══════════════════════════════════════════════════════════════════════ */

  /**
   * Restores a previously exported layout build onto the WebGL canvas.
   *
   * Pipeline:
   *   1. Deselect any active model to avoid dangling entity references.
   *   2. Call `flushInjectedModels()` — destroys every live injected entity
   *      and clears the internal tracking map.
   *   3. Fire a `Promise.allSettled` over `loadSavedAssetRecord()` so that a
   *      single missing .glb never blocks the remaining models.
   *   4. Log a summary of fulfilled / rejected loads to the dev console.
   *
   * @param assets  Array of `SavedAssetRecord` objects.  Structurally
   *                compatible with the `SceneAssetRecord` type exported from
   *                `exportEngine.ts` — only `modelUrl` is strictly required.
   */
  public async loadSavedLayoutBuild(assets: SavedAssetRecord[]): Promise<void> {
    if (!this.app) {
      console.warn('[SplatEngine] loadSavedLayoutBuild: engine not initialised.');
      return;
    }

    if (!Array.isArray(assets) || assets.length === 0) {
      console.log('[SplatEngine] loadSavedLayoutBuild: empty or invalid asset list — nothing to restore.');
      return;
    }

    console.log(`[SplatEngine] Restoring layout build — ${assets.length} asset record(s).`);

    /* Step 1 — purge any models currently on screen */
    this.flushInjectedModels();

    /* Step 2 — parallel load with per-asset fault isolation */
    const results = await Promise.allSettled(
      assets.map((record, idx) => this.loadSavedAssetRecord(record, idx))
    );

    const ok  = results.filter((r) => r.status === 'fulfilled').length;
    const err = results.filter((r) => r.status === 'rejected').length;
    console.log(`[SplatEngine] Layout build restored: ${ok} loaded, ${err} skipped.`);
  }

  /**
   * Destroys every live injected entity and resets the tracking map.
   * Deselects the active model first to prevent dangling `activeSelection`
   * references after the underlying entities are garbage-collected.
   */
  private flushInjectedModels(): void {
    this.applyDeselection();

    for (const [handle, entity] of this.injectedModels) {
      entity.destroy();
      console.log(`[SplatEngine] Flushed injected model: ${handle}`);
    }
    this.injectedModels.clear();
    console.log('[SplatEngine] Injected model registry cleared.');
  }

  /**
   * Loads a single serialised asset record and places it at the stored
   * world-space coordinates.
   *
   * Position / rotation normalisation:
   *   Both object-form `{ x, y, z }` and tuple-form `[x, y, z]` are
   *   accepted — the viewer's export pipeline writes objects; third-party
   *   serialisers may write tuples.
   *
   *   When no position is stored the model is staggered along the X axis
   *   (`slotIndex × 2 m`) so reinstated models never overlap each other
   *   regardless of the original capture.
   *
   * Fault isolation: the returned Promise resolves (never rejects), so a
   * single bad URL never blocks `Promise.allSettled` from finishing.
   */
  private loadSavedAssetRecord(record: SavedAssetRecord, slotIndex: number): Promise<void> {
    return new Promise<void>((resolve) => {
      if (!this.app) { resolve(); return; }

      const url = record.modelUrl;
      if (typeof url !== 'string' || url.trim() === '') {
        console.warn(
          `[SplatEngine] Layout record[${slotIndex}] is missing a valid modelUrl — skipped.`
        );
        resolve();
        return;
      }

      const handle = `restored::${slotIndex}::${Date.now()}::${Math.random().toString(36).slice(2, 5)}`;
      const app    = this.app;
      const asset  = new pc.Asset(handle, 'container', { url });

      asset.on('load', (loadedAsset: pc.Asset) => {
        const entity = (loadedAsset.resource as any).instantiateRenderEntity() as pc.Entity;
        entity.name  = handle;
        app.root.addChild(entity);

        /* ── Resolve world-space position ─────────────────────────────── */
        const pos = record.position;
        let tx = 0, ty = 0, tz = 0;

        if (Array.isArray(pos) && pos.length >= 3) {
          [tx, ty, tz] = pos as [number, number, number];
        } else if (pos !== null && typeof pos === 'object' && !Array.isArray(pos)) {
          const p = pos as { x?: number; y?: number; z?: number };
          tx = p.x ?? 0;
          ty = p.y ?? 0;
          tz = p.z ?? 0;
        } else {
          /* No stored position — stagger along X to avoid piling up */
          tx = slotIndex * 2;
        }

        /* ── Resolve Euler rotation (degrees → PlayCanvas YXZ convention) */
        const rot = record.rotation;
        let rx = 0, ry = 0, rz = 0;

        if (Array.isArray(rot) && rot.length >= 3) {
          [rx, ry, rz] = rot as [number, number, number];
        } else if (rot !== null && typeof rot === 'object' && !Array.isArray(rot)) {
          const r = rot as { x?: number; y?: number; z?: number };
          rx = r.x ?? 0;
          ry = r.y ?? 0;
          rz = r.z ?? 0;
        }

        entity.setPosition(tx, ty, tz);
        entity.setEulerAngles(rx, ry, rz);

        /* Register in the tracking map so the model participates in
         * subsequent selection, translation, and measurement interactions. */
        this.injectedModels.set(handle, entity);

        console.log(
          `[SplatEngine] Restored[${slotIndex}]: ${record.name ?? url} ` +
          `@ (${tx.toFixed(3)}, ${ty.toFixed(3)}, ${tz.toFixed(3)}) ` +
          `rot(${rx}, ${ry}, ${rz})`
        );
        resolve();
      });

      asset.on('error', (err: string) => {
        /* Non-fatal: log and continue — remaining assets still load */
        console.warn(
          `[SplatEngine] Layout record[${slotIndex}] load fault [${url}]: ${err} — skipped.`
        );
        resolve();
      });

      app.assets.add(asset);
      app.assets.load(asset);
    });
  }

  /* ═══════════════════════════════════════════════════════════════════════
     Public: Measurement Anchor API
   ══════════════════════════════════════════════════════════════════════ */

  public getPendingAnchor(): SpatialCoordinate | null {
    return this.anchorA ? { ...this.anchorA } : null;
  }

  /** Clears both anchors — stops guide-line rendering immediately. */
  public clearMeasurementAnchor(): void {
    this.anchorA = null;
    this.anchorB = null;
    console.log('[SplatEngine] Measurement anchors cleared.');
  }

  /* ═══════════════════════════════════════════════════════════════════════
     Asset Loading (Splat + Proxy)
   ══════════════════════════════════════════════════════════════════════ */

  public async loadSplatLocation(splatUrl: string, collisionMeshUrl: string): Promise<void> {
    if (!this.app) throw new Error('[SplatEngine] Engine not initialized.');

    console.log('[SplatEngine] Parallel asset load sequence:');
    console.log(`  Splat  → ${splatUrl}`);
    console.log(`  Proxy  → ${collisionMeshUrl}`);

    this.flushSceneAssets();

    await Promise.all([
      this.loadGaussianSplat(splatUrl),
      this.loadCollisionMeshProxy(collisionMeshUrl),
    ]);

    console.log('[SplatEngine] Dual asset pipeline complete. Rasteriser armed.');
  }

  private flushSceneAssets(): void {
    if (this.splatEntity)     { this.splatEntity.destroy();     this.splatEntity     = null; }
    if (this.proxyMeshEntity) { this.proxyMeshEntity.destroy(); this.proxyMeshEntity = null; }
  }

  private loadGaussianSplat(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.app) return reject(new Error('Engine not initialized.'));
      const app   = this.app;
      const asset = new pc.Asset(url, 'gsplat', { url });

      asset.on('load', () => {
        const entity = new pc.Entity('SplatContainer');
        entity.addComponent('gsplat', { asset });
        app.root.addChild(entity);
        this.splatEntity = entity;
        console.log('[SplatEngine] 3DGS rasteriser armed.');
        resolve();
      });

      asset.on('error', (err: string) => reject(new Error(`Splat load fault: ${err}`)));
      app.assets.add(asset);
      app.assets.load(asset);
    });
  }

  private async loadCollisionMeshProxy(url: string): Promise<void> {
    if (!this.app) return;

    /* ── Pre-flight file validation ─────────────────────────────────────────
     * Issue a lightweight HEAD request before handing the URL to PlayCanvas.
     * If the server responds with a non-2xx status (e.g. 404) or the network
     * throws entirely, we catch it here, emit a single clean dev message, and
     * return immediately — bypassing the PlayCanvas asset pipeline so that no
     * raw browser network exception is ever raised.
     * ─────────────────────────────────────────────────────────────────────── */
    try {
      const probe = await fetch(url, { method: 'HEAD' });
      if (!probe.ok) {
        console.log(
          '[SplatEngine] Collision mesh proxy absent; ' +
          'fallback to infinite ground grid plane activated.'
        );
        return;
      }
    } catch {
      /* Network fault (offline, DNS, CORS pre-flight reject, etc.) */
      console.log(
        '[SplatEngine] Collision mesh proxy absent; ' +
        'fallback to infinite ground grid plane activated.'
      );
      return;
    }

    /* ── File confirmed accessible — hand off to PlayCanvas ─────────────── */
    return new Promise<void>((resolve) => {
      /* TypeScript-safe non-null assertion: we checked `this.app` above and
       * this Promise executor runs synchronously before any await resumes. */
      const app   = this.app!;
      const asset = new pc.Asset('ProxyMesh', 'container', { url });

      asset.on('load', (loadedAsset: pc.Asset) => {
        const proxy = (loadedAsset.resource as any).instantiateRenderEntity() as pc.Entity;
        proxy.name  = 'HiddenCollisionProxy';

        const suppress = (e: pc.Entity): void => {
          const r = e.render as pc.RenderComponent | undefined;
          if (r?.meshInstances) for (const mi of r.meshInstances) mi.visible = false;
          for (let i = 0; i < e.children.length; i++) {
            const child = e.children[i];
            if (child instanceof pc.Entity) suppress(child);
          }
        };

        suppress(proxy);
        app.root.addChild(proxy);
        this.proxyMeshEntity = proxy;
        console.log('[SplatEngine] Collision proxy mounted.');
        resolve();
      });

      asset.on('error', (err: string) => {
        /* Secondary safety net — catches any fault the HEAD probe missed
         * (e.g. the file existed at probe time but became unavailable, or
         * the server returned 200 to HEAD but the body is corrupt). */
        console.log(
          `[SplatEngine] Collision mesh proxy absent (${err}); ` +
          'fallback to infinite ground grid plane activated.'
        );
        resolve(); // non-fatal — ground plane raycasting remains fully operational
      });

      app.assets.add(asset);
      app.assets.load(asset);
    });
  }

  /* ═══════════════════════════════════════════════════════════════════════
     Teardown
   ══════════════════════════════════════════════════════════════════════ */

  public destroy(): void {
    this.detachCoreListeners();
    this.detachSelectionListener();

    this.coordinateCallback    = null;
    this.anchorA               = null;
    this.anchorB               = null;
    this.activeSelection       = null;
    this.activeSelectionHandle = null;

    for (const [, entity] of this.injectedModels) entity.destroy();
    this.injectedModels.clear();

    if (this.app) {
      this.app.destroy();
      this.app = null;
      console.log('[SplatEngine] VRAM contexts terminated successfully.');
    }
  }
}
