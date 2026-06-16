export interface EngineConfig {
    canvas: HTMLCanvasElement;
    debug?: boolean;
}
/**
 * World-space coordinate produced by a raycaster.
 * All floats are rounded to 4 decimal places for ledger display.
 */
export interface SpatialCoordinate {
    x: number;
    y: number;
    z: number;
    /** Canvas-relative pixel X of the originating click. */
    screenX: number;
    /** Canvas-relative pixel Y of the originating click. */
    screenY: number;
    /** 'GroundPlane::Y=0' for mathematical hits, mesh name for proxy hits. */
    entityName: string;
    timestamp: string;
}
/**
 * Completed measurement pair: two anchor coordinates and their Euclidean
 * distance in metres.
 */
export interface SpatialMeasurement {
    anchorA: SpatialCoordinate;
    anchorB: SpatialCoordinate;
    /** √(Δx²+Δy²+Δz²) in metres, rounded to 4 d.p. */
    distance: number;
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
    worldX: number;
    worldY: number;
    worldZ: number;
    /** False when midpoint is behind the camera — hide HTML label when so. */
    visible: boolean;
}
/** Metadata broadcast when an injected model is selected or deselected. */
export interface InjectedModelHandle {
    id: string;
    modelUrl: string;
    position: {
        x: number;
        y: number;
        z: number;
    };
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
    modelUrl: string;
    /** Human-readable product name — used only for logging. */
    name?: string;
    /** Top-level group: 'technical' | 'staging' | 'construction'. */
    group?: string;
    /** Granular sub-category slug. */
    category?: string;
    /**
     * World-space position in metres.
     * Object form: `{ x, y, z }` — written by the viewer's export pipeline.
     * Tuple form:  `[x, y, z]`   — accepted for third-party serialisers.
     */
    position?: {
        x: number;
        y: number;
        z: number;
    } | [number, number, number];
    /**
     * Euler rotation angles in degrees (yaw/pitch/roll → Y/X/Z in PlayCanvas).
     * Same dual-form support as `position`.
     */
    rotation?: {
        x: number;
        y: number;
        z: number;
    } | [number, number, number];
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
export declare const SPATIAL_METRIC_EVENT: "spatial-metric-logged";
export declare const SPATIAL_MODEL_SELECTED_EVENT: "spatial-model-selected";
export declare const SPATIAL_MIDPOINT_EVENT: "spatial-midpoint-moved";
declare global {
    interface WindowEventMap {
        'spatial-metric-logged': CustomEvent<SpatialMeasurement>;
        'spatial-model-selected': CustomEvent<InjectedModelHandle | null>;
        'spatial-midpoint-moved': CustomEvent<SpatialMidpoint>;
    }
}
export declare class SplatEngine {
    private app;
    private cameraEntity;
    private splatEntity;
    private proxyMeshEntity;
    private canvas;
    private interactionMode;
    private coordinateCallback;
    /**
     * Accumulated yaw angle in degrees (rotation around world Y axis).
     * Updated every drag frame; applied atomically via `setEulerAngles` —
     * equivalent to calling `rotateLocal(0, yawDelta, 0)` each frame but
     * without floating-point drift across thousands of frames.
     */
    private cameraYaw;
    /**
     * Accumulated pitch angle in degrees (rotation around local X axis).
     * Clamped to ±PITCH_LIMIT before every `setEulerAngles` application —
     * equivalent to calling `rotateLocal(pitchDelta, 0, 0)` each frame but
     * prevents gimbal-lock flip at ±90°.
     */
    private cameraPitch;
    private isDragging;
    private lastMouseX;
    private lastMouseY;
    /**
     * Squared pixel distance accumulated during the current press.
     * Compared against CLICK_MAX_DRAG_SQ to distinguish a click from a drag.
     * Read by `_onSelectionMouseUp` (canvas target phase) before being reset
     * by `_onMouseUp` (window bubble phase).
     */
    private dragDistSq;
    /**
     * First anchor of the active measurement pair.
     * Cleared when the user starts a new pair (next first click).
     */
    private anchorA;
    /**
     * Second anchor of the most recently completed measurement pair.
     * Kept in memory after the pair completes so `tickMeasureLine` can
     * render the guide line and badge every frame until a new pair begins.
     */
    private anchorB;
    /** Purple RGBA colour for the immediate-mode WebGL guide line. */
    private readonly _measureLineColor;
    private injectedModels;
    private activeSelection;
    private activeSelectionHandle;
    private lastGroundHit;
    /**
     * Persistent navigation handlers — always attached for the engine lifetime.
     * Bound directly to the native canvas DOM node, bypassing PlayCanvas's
     * high-level input hooks entirely.
     */
    private readonly _onMouseDown;
    private readonly _onMouseMove;
    private readonly _onMouseUp;
    private readonly _onWheel;
    private readonly _onKeyDown;
    private readonly _onResize;
    /**
     * Mode-scoped selection handler — attached to the canvas only when the
     * interaction mode is 'measure' or 'inject'.
     * Explicitly removed via `canvas.removeEventListener` when reverting to
     * 'navigate' so zero selection logic runs in navigation-only mode.
     */
    private readonly _onSelectionMouseUp;
    constructor(config: EngineConfig);
    private setupCoreEnvironment;
    /**
     * Binds the persistent input listener set directly to the canvas DOM node
     * and window — completely bypassing PlayCanvas's internal input pipeline.
     * Called once from the constructor; listeners live for the engine lifetime.
     */
    private attachCoreListeners;
    /** Detaches all persistent listeners. Called only from `destroy()`. */
    private detachCoreListeners;
    /** Attaches the mode-scoped selection listener. Called when entering measure/inject. */
    private attachSelectionListener;
    /**
     * Removes the mode-scoped selection listener from the canvas DOM node.
     * Called when reverting to 'navigate' — ensures zero selection logic
     * executes while the engine is in navigation-only mode.
     */
    private detachSelectionListener;
    private handleMouseDown;
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
    private handleMouseMove;
    /**
     * Navigation mouseup (window) — resets drag state and cursor.
     * Fires in the BUBBLE PHASE, after `_onSelectionMouseUp` (canvas target
     * phase) has already read `dragDistSq`, so the reset here is safe.
     */
    private handleMouseUp;
    /**
     * Mode-scoped selection mouseup (canvas target phase).
     *
     * Fires BEFORE `_onMouseUp` (window bubble phase), so `dragDistSq` is
     * still the accumulated drag distance from this press when we read it.
     * Only attached when mode is 'measure' or 'inject'.
     */
    private handleSelectionMouseUp;
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
    private handleWheel;
    private handleKeyDown;
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
    setInteractionMode(mode: InteractionMode): void;
    /** Public alias — satisfies both naming conventions used across viewer/editor. */
    setEngineMode(mode: InteractionMode): void;
    onCoordinateCapture(callback: CoordinateCallback): void;
    /**
     * Routes a validated click to the correct handler based on mode.
     * In both measure and inject modes the primary raycaster is the
     * mathematical ground plane intersector which never fails on a miss
     * (unlike mesh-based raycasts that require geometry to be loaded).
     */
    private dispatchRaycast;
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
    private intersectGroundPlane;
    private performProxyMeshRaycast;
    private pickInjectedEntity;
    private buildCameraRay;
    private closestAABBHit;
    private collectEntityAABBs;
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
    private handleMeasurementCapture;
    private handleInjectGroundCapture;
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
    private tickMeasureLine;
    /**
     * Immediate-mode WebGL line draw between two world-space points.
     * Tries `app.renderLine` first (PlayCanvas ≤ 1.x), falls back to
     * `app.drawLine` (PlayCanvas 2.x+). Silently skips if neither exists.
     */
    private drawMeasureLine;
    /**
     * Projects a world-space Vec3 to CSS pixel coordinates (viewport-relative),
     * accounting for the canvas DPI/layout scale ratio.
     * Returns null when the camera component is unavailable.
     */
    private worldToScreenCSS;
    private applySelection;
    private applyDeselection;
    private snapEntityToGround;
    inject3DModel(modelUrl: string): Promise<string>;
    selectInjectedModel(handle: string): void;
    deselectModel(): void;
    translateActiveSelection(dx: number, dz: number): void;
    removeInjectedModel(handle: string): void;
    getActiveSelectionHandle(): string | null;
    getLastGroundHit(): {
        x: number;
        y: number;
        z: number;
    };
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
    loadSavedLayoutBuild(assets: SavedAssetRecord[]): Promise<void>;
    /**
     * Destroys every live injected entity and resets the tracking map.
     * Deselects the active model first to prevent dangling `activeSelection`
     * references after the underlying entities are garbage-collected.
     */
    private flushInjectedModels;
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
    private loadSavedAssetRecord;
    getPendingAnchor(): SpatialCoordinate | null;
    /** Clears both anchors — stops guide-line rendering immediately. */
    clearMeasurementAnchor(): void;
    loadSplatLocation(splatUrl: string, collisionMeshUrl: string): Promise<void>;
    private flushSceneAssets;
    private loadGaussianSplat;
    private loadCollisionMeshProxy;
    destroy(): void;
}
//# sourceMappingURL=SplatEngine.d.ts.map