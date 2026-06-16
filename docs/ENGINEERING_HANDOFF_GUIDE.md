# VenuePlatform — Engineering Handoff Guide

**Revision:** 1.0  
**Audience:** Incoming systems engineers, full-stack developers, DevOps  
**Monorepo root:** `/VenuePlatform`  

> This document is the single authoritative reference for the VenuePlatform codebase. Every technical claim is derived directly from source. Read it end-to-end before touching any file.

---

## Table of Contents

1. [Workspace Topology & Architecture](#1-workspace-topology--architecture)
2. [The Core 3D Graphics & Raycasting Engine](#2-the-core-3d-graphics--raycasting-engine-splatengine)
3. [The Single-Editor Paradigm & SuperSplat Integration](#3-the-single-editor-paradigm--supersplat-integration)
4. [System Re-Loading via Coordinate Manifests](#4-system-re-loading-via-coordinate-manifests)
5. [Containerisation & Cross-Platform Deployment](#5-containerisation--cross-platform-deployment)

---

## 1. Workspace Topology & Architecture

### 1.1 Monorepo Layout

```
VenuePlatform/                          ← Git root / Docker context
├── apps/
│   └── web/                            ← @venue/web — Next.js 14 frontend
│       ├── src/
│       │   ├── app/                    ← App Router pages
│       │   │   ├── page.tsx            ← Homepage: venue picker & landing
│       │   │   ├── viewer/page.tsx     ← 3D immersive viewer route
│       │   │   └── editor/page.tsx     ← SuperSplat scan editor route
│       │   ├── components/viewer/      ← Viewer sub-components
│       │   ├── data/                   ← venues.ts, assetLibrary.ts
│       │   └── utils/exportEngine.ts   ← Dual-export pipeline (PNG + JSON)
│       ├── public/assets/              ← Local dev assets (dev only)
│       │   ├── splats/{venue-id}/      ← capture.ply + collision.glb
│       │   └── models/{category}/      ← Equipment .glb files
│       ├── docs/                       ← Per-app engineering docs
│       ├── vercel.json                 ← Serverless hosting + CORS config
│       ├── next.config.js
│       └── package.json
│
├── packages/
│   └── core-3d/                        ← @venue/core-3d — PlayCanvas engine
│       ├── src/
│       │   ├── index.ts                ← Re-exports public API surface
│       │   └── SplatEngine.ts          ← The entire 3D engine (single file)
│       ├── dist/                       ← tsc output (gitignored, built at CI)
│       │   ├── index.js
│       │   └── index.d.ts
│       └── package.json
│
├── docs/                               ← Monorepo-level documentation
│   └── ENGINEERING_HANDOFF_GUIDE.md    ← This file
│
├── package.json                        ← Root manifest — workspace + turbo
├── pnpm-workspace.yaml                 ← Workspace globs
├── turbo.json                          ← Task pipeline
├── pnpm-lock.yaml                      ← Frozen dependency graph
├── Dockerfile                          ← Multi-stage production image
├── docker-compose.yml                  ← Compose service definition
└── .dockerignore                       ← Build context filter
```

### 1.2 Package Manager — pnpm 11 Workspaces

The repo uses **pnpm 11.5.0** (pinned via `packageManager` in root `package.json`) with workspaces declared in `pnpm-workspace.yaml`:

```yaml
packages:
  - 'apps/*'
  - 'packages/*'
allowBuilds:
  canvas: true   # permits native `canvas` module build if added later
```

pnpm's content-addressable virtual store (`node_modules/.pnpm/`) de-duplicates packages across all workspaces. Packages reference each other via pnpm workspace protocol — no `npm link` or `yarn link` required.

### 1.3 Task Orchestration — Turborepo 2

`turbo.json` defines three pipeline tasks:

```json
{
  "tasks": {
    "dev":   { "cache": false, "persistent": true },
    "build": { "dependsOn": ["^build"], "outputs": [".next/**", "dist/**"] },
    "lint":  {}
  }
}
```

The `"dependsOn": ["^build"]` directive is the critical architectural constraint: when `pnpm run build` is called from the root, Turborepo resolves the dependency graph and guarantees **`@venue/core-3d` is compiled to `dist/` before `@venue/web`'s `next build` starts**. If `core-3d` has not been built, Next.js cannot resolve the `@venue/core-3d` import and will fail.

Daily dev workflow:
```bash
# Build core-3d once, then run both watchers
cd packages/core-3d && pnpm build

# From root — runs turbo dev (Next.js dev server + tsc --watch in parallel)
pnpm dev

# Rebuild from scratch
rm -rf apps/web/.next packages/core-3d/dist && pnpm build
```

### 1.4 Package Boundary: Frontend vs. Engine

| Concern | Package | Runtime |
|---|---|---|
| React UI, routing, data-binding | `@venue/web` | Next.js 14 App Router (client + server) |
| 3D rendering, raycasting, physics, input | `@venue/core-3d` | Browser only — no SSR |
| Asset export / import pipeline | `@venue/web/src/utils/exportEngine.ts` | Browser only |

The boundary is **strictly enforced at the package level**:

- `packages/core-3d/src/SplatEngine.ts` imports **nothing** from React, Next.js, or Tailwind. It is vanilla TypeScript that speaks to the DOM directly.
- `apps/web` imports `SplatEngine` using Next.js **dynamic import with `ssr: false`** to prevent server-side execution of browser-only PlayCanvas APIs.

```typescript
// apps/web/src/app/viewer/page.tsx — engine bootstrap
const { SplatEngine } = await import("@venue/core-3d");
const engine = new SplatEngine({ canvas });
```

The `@venue/core-3d` package is consumed by `@venue/web` as a **local workspace dependency**. The package declares its entry points via an `exports` map:

```json
// packages/core-3d/package.json
{
  "name": "@venue/core-3d",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types":  "./dist/index.d.ts"
    }
  }
}
```

Next.js is instructed to transpile the package source directly (bypassing the pre-compiled `dist/`) via `next.config.js`:

```javascript
// apps/web/next.config.js
const nextConfig = {
  transpilePackages: ['@spatial/core-3d'],  // ⚠ see §1.5 below
  reactStrictMode: true,
};
```

> **⚠ Known name mismatch:** `transpilePackages` currently references `@spatial/core-3d` but the installed package is named `@venue/core-3d`. Correct this to `['@venue/core-3d']` before any production Next.js build.

### 1.5 Public API Surface of `@venue/core-3d`

Every symbol exported from `packages/core-3d/src/index.ts` is stable across internal rewrites. React consumers must only depend on these exports:

| Export | Kind | Description |
|---|---|---|
| `SplatEngine` | class | The entire 3D engine — one instance per canvas |
| `EngineConfig` | interface | `{ canvas: HTMLCanvasElement; debug?: boolean }` |
| `SpatialCoordinate` | interface | World-space raycaster hit point |
| `SpatialMeasurement` | interface | Completed A→B measurement pair |
| `SpatialMidpoint` | interface | Per-frame badge position for floating HTML overlay |
| `InjectedModelHandle` | interface | Metadata for a placed `.glb` model |
| `SavedAssetRecord` | interface | Serialised record consumed by `loadSavedLayoutBuild` |
| `InteractionMode` | type | `'navigate' \| 'measure' \| 'inject'` |
| `CoordinateCallback` | type | `(coord: SpatialCoordinate) => void` |
| `SPATIAL_METRIC_EVENT` | const | `'spatial-metric-logged'` |
| `SPATIAL_MODEL_SELECTED_EVENT` | const | `'spatial-model-selected'` |
| `SPATIAL_MIDPOINT_EVENT` | const | `'spatial-midpoint-moved'` |

---

## 2. The Core 3D Graphics & Raycasting Engine (`SplatEngine.ts`)

### 2.1 Architecture Principles

`SplatEngine` is a **headless, framework-agnostic class**. It:

- Owns a `pc.Application` instance bound to one `<canvas>` DOM element
- Bypasses PlayCanvas's built-in input system entirely — all events are raw DOM listeners
- Communicates outward to React exclusively via **`window.dispatchEvent(CustomEvent)`** and an optional `CoordinateCallback`
- Holds no reference to React state, context, or hooks
- Can be constructed, used, and destroyed completely independently of the React lifecycle

### 2.2 Initialisation Inside React

The viewer page initialises the engine inside a `useEffect` guarded by the resolved venue:

```typescript
// apps/web/src/app/viewer/page.tsx (simplified)
const canvasRef = useRef<HTMLCanvasElement>(null);
const engineRef = useRef<SplatEngine | null>(null);

useEffect(() => {
  const canvas = canvasRef.current;
  if (!canvas || !venue) return;

  const initEngine = async () => {
    // Dynamic import — prevents SSR execution of browser-only PlayCanvas APIs
    const { SplatEngine } = await import("@venue/core-3d");

    const engine = new SplatEngine({ canvas });
    engineRef.current = engine;

    await engine.loadSplatLocation(
      venue.splatUrl,                                    // .ply  3DGS capture
      venue.splatUrl.replace("capture.ply", "collision.glb")  // collision proxy
    );
  };

  initEngine();

  return () => {
    // Teardown: free VRAM, remove DOM listeners
    engineRef.current?.destroy();
    engineRef.current = null;
  };
}, [venue?.id]);  // Re-runs only when active venue changes
```

Inside the `SplatEngine` constructor:

```typescript
// packages/core-3d/src/SplatEngine.ts (abridged)
constructor({ canvas }: EngineConfig) {
  this.canvas = canvas;

  // PlayCanvas Application with NO input devices
  // All input flows through raw DOM listeners — not PlayCanvas's input system
  const app = new pc.Application(canvas, {});
  this.app = app;

  this.setupCoreEnvironment(app);   // camera + directional light
  this.attachCoreListeners();        // native DOM mousedown/move/up, wheel, keydown, resize
  app.start();

  // Per-frame measurement line + badge broadcast
  app.on('update', () => this.tickMeasureLine());
}
```

**Camera initialisation:**

```typescript
private setupCoreEnvironment(app: pc.Application): void {
  // Camera entity
  const cam = new pc.Entity('MainCamera');
  cam.addComponent('camera', { farClip: 500, nearClip: 0.1 });
  cam.setPosition(0, 3, 8);
  cam.setEulerAngles(-10, 0, 0);  // Slight downward tilt on boot
  app.root.addChild(cam);
  this.cameraEntity = cam;

  // Key light
  const light = new pc.Entity('KeyLight');
  light.addComponent('light', {
    type:      'directional',
    color:     new pc.Color(1, 1, 1),
    intensity: 1.5,
  });
  light.setEulerAngles(45, 45, 0);
  app.root.addChild(light);
}
```

**Navigation constants** (tuned for raw pixel deltas):

```typescript
const CAM = {
  YAW_SPEED:         0.25,   // degrees per horizontal pixel
  PITCH_SPEED:       0.25,   // degrees per vertical pixel
  ZOOM_SPEED:        0.5,    // world units per normalised scroll tick
  PITCH_LIMIT:       88,     // hard clamp — prevents gimbal flip
  CLICK_MAX_DRAG_SQ: 16,     // px² — anything under this is a click, not a drag
} as const;
```

### 2.3 FPS Camera Navigation

Mouse navigation uses accumulated **Euler angle state** applied atomically via `setEulerAngles` — never `rotateLocal`. This eliminates floating-point drift across thousands of frames and provides clean pitch clamping:

```typescript
private handleMouseMove(e: MouseEvent): void {
  if (!this.isDragging) return;

  const dx = e.clientX - this.lastMouseX;
  const dy = e.clientY - this.lastMouseY;

  // Accumulate drag distance for click-vs-drag discrimination
  this.dragDistSq += dx * dx + dy * dy;
  this.lastMouseX = e.clientX;
  this.lastMouseY = e.clientY;

  if (this.interactionMode !== 'navigate' || !this.cameraEntity) return;

  this.cameraYaw   -= dx * CAM.YAW_SPEED;

  this.cameraPitch -= dy * CAM.PITCH_SPEED;
  this.cameraPitch  = Math.max(-CAM.PITCH_LIMIT, Math.min(CAM.PITCH_LIMIT, this.cameraPitch));

  // Single atomic write — no quaternion drift
  this.cameraEntity.setEulerAngles(this.cameraPitch, this.cameraYaw, 0);
}
```

Scroll zoom translates the camera along its **local Z axis** (the look vector), ensuring correct dolly behaviour regardless of camera orientation:

```typescript
private handleWheel(e: WheelEvent): void {
  e.preventDefault();
  // Normalise line-scroll (mousewheel) vs pixel-scroll (trackpad)
  const rawDelta = e.deltaMode === WheelEvent.DOM_DELTA_LINE ? e.deltaY * 16 : e.deltaY;
  const step     = (rawDelta / 100) * CAM.ZOOM_SPEED;
  // +step = backward (local +Z in PlayCanvas), −step = forward
  this.cameraEntity.translateLocal(0, 0, step);
}
```

### 2.4 The Hidden Horizontal Proxy Collider Architecture

3D Gaussian Splat (3DGS) point clouds are **not mesh geometry** — they have no polygon surface, no normals, and cannot be raycasted against using conventional triangle intersection tests. This is the core technical challenge: a user click must produce a meaningful 3D world-space coordinate even though there is nothing to click against geometrically.

VenuePlatform solves this with a two-tier collider stack, checked in priority order:

```
Mouse click
    │
    ▼
┌──────────────────────────────────────────────────────────────┐
│  Tier 1 — Mathematical Ground Plane (Y = 0)                  │
│  A solid infinite plane at world Y = 0.                      │
│  No mesh required. Never misses. Instant O(1) math.          │
│  Used for: measure anchors, inject placement targets         │
└──────────────────────────────────────────────────────────────┘
    │  returns null if camera is pointing upward (t < 0)
    ▼
┌──────────────────────────────────────────────────────────────┐
│  Tier 2 — HiddenCollisionProxy (collision.glb)               │
│  An invisible simplified glTF mesh loaded alongside the      │
│  3DGS capture. Its render components are set visible=false.  │
│  Raycasted via AABB intersection against all child entities. │
└──────────────────────────────────────────────────────────────┘
    │  returns null if no AABB hit
    ▼
  coord = null (click ignored with console log)
```

#### Tier 1: Mathematical Ground Plane (`intersectGroundPlane`)

The algorithm projects a camera ray through the clicked screen pixel and solves analytically for its intersection with the plane `Y = 0`:

```
Ray parametric form:   P(t) = origin + t · direction
Plane equation:        Y = 0  →  origin.y + t · direction.y = 0
Solving for t:         t = −origin.y / direction.y
Hit point:             X = origin.x + t · direction.x
                       Z = origin.z + t · direction.z
```

```typescript
private intersectGroundPlane(clientX: number, clientY: number): SpatialCoordinate | null {
  const camera = this.cameraEntity.camera;
  const rect   = this.canvas.getBoundingClientRect();

  // Scale mouse position to canvas pixel space (handles CSS scaling)
  const px = (clientX - rect.left) * (this.canvas.width  / rect.width);
  const py = (clientY - rect.top)  * (this.canvas.height / rect.height);

  // Unproject two points on the near/far planes to form a ray
  const origin = camera.screenToWorld(px, py, camera.nearClip);
  const farPt  = camera.screenToWorld(px, py, camera.farClip);
  const dir    = new pc.Vec3().sub2(farPt, origin).normalize();

  const EPSILON = 1e-6;
  if (Math.abs(dir.y) < EPSILON) return null;  // ray nearly parallel to plane
  const t = -origin.y / dir.y;
  if (t < 0) return null;                       // intersection behind camera

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
```

#### Tier 2: Collision Proxy Mesh Loading (`loadCollisionMeshProxy`)

The proxy is loaded as a PlayCanvas `'container'` asset (glTF) but immediately rendered invisible so it exists in the scene graph for raycasting without appearing visually:

```typescript
private async loadCollisionMeshProxy(url: string): Promise<void> {
  // Pre-flight HEAD request — if the file is absent (404), resolve silently.
  // This prevents the browser from logging an uncaught network error from
  // PlayCanvas's internal XHR, while still gracefully falling back to the
  // mathematical ground plane.
  try {
    const probe = await fetch(url, { method: 'HEAD' });
    if (!probe.ok) {
      console.log('[SplatEngine] Collision mesh proxy absent; fallback to infinite ground grid plane activated.');
      return;
    }
  } catch {
    console.log('[SplatEngine] Collision mesh proxy absent; fallback to infinite ground grid plane activated.');
    return;
  }

  // File confirmed — hand off to PlayCanvas asset pipeline
  return new Promise<void>((resolve) => {
    const app   = this.app!;
    const asset = new pc.Asset('ProxyMesh', 'container', { url });

    asset.on('load', (loadedAsset: pc.Asset) => {
      const proxy = (loadedAsset.resource as any).instantiateRenderEntity() as pc.Entity;
      proxy.name  = 'HiddenCollisionProxy';

      // Recursively hide all mesh instances
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
      resolve();
    });

    asset.on('error', (err: string) => {
      console.log(`[SplatEngine] Collision mesh proxy absent (${err}); fallback to infinite ground grid plane activated.`);
      resolve(); // non-fatal
    });

    app.assets.add(asset);
    app.assets.load(asset);
  });
}
```

### 2.5 Interaction Modes & Input Routing

The engine operates in three mutually exclusive modes, switched via `engine.setEngineMode(mode)`:

```typescript
type InteractionMode = 'navigate' | 'measure' | 'inject';
```

The mode controls which DOM listeners are active on the canvas:

| Mode | Core listeners | Selection listener | Behaviour |
|---|---|---|---|
| `navigate` | Always active | **Detached** | Drag = orbit camera; scroll = dolly; no raycasting |
| `measure` | Always active | **Attached** | Click → ground raycast → two-anchor pipeline |
| `inject` | Always active | **Attached** | Click → pick entity OR ground raycast → placement |

The selection listener (`_onSelectionMouseUp`) fires in the **canvas target phase**, before the window-level `_onMouseUp` bubble phase. This ordering guarantees `dragDistSq` is still the accumulated drag distance when the selection handler reads it:

```typescript
private handleSelectionMouseUp(e: MouseEvent): void {
  if (e.button !== 0) return;
  // Only dispatch raycast if mouse barely moved — not a drag
  if (this.dragDistSq < CAM.CLICK_MAX_DRAG_SQ) {
    this.dispatchRaycast(e.clientX, e.clientY);
  }
}
// _onMouseUp (window, bubble phase) runs AFTER and resets dragDistSq to 0
```

### 2.6 Measurement: Euclidean Distance & Event Broadcasting

The measurement pipeline is a strict two-click state machine:

```
Click 1 → anchorA set, anchorB cleared
Click 2 → anchorB set, distance calculated, events fired
Click 3 → anchorA reset (new pair begins)
```

Distance calculation (Euclidean 3D):

```typescript
const distance = parseFloat(
  Math.sqrt(
    Math.pow(coordB.x - coordA.x, 2) +
    Math.pow(coordB.y - coordA.y, 2) +
    Math.pow(coordB.z - coordA.z, 2)
  ).toFixed(4)
);
```

Two custom events are dispatched to `window`:

**`spatial-metric-logged`** — fired once when a pair completes:

```typescript
window.dispatchEvent(
  new CustomEvent<SpatialMeasurement>('spatial-metric-logged', {
    detail: { anchorA, anchorB, distance, timestamp: new Date().toISOString() }
  })
);
```

**`spatial-midpoint-moved`** — fired **every animation frame** while both anchors are held in memory, from inside `tickMeasureLine()`:

```typescript
// Called by app.on('update', ...) — 60fps
private tickMeasureLine(): void {
  if (!this.anchorA || !this.anchorB) return;

  const a = new pc.Vec3(this.anchorA.x, this.anchorA.y, this.anchorA.z);
  const b = new pc.Vec3(this.anchorB.x, this.anchorB.y, this.anchorB.z);

  // Draw purple WebGL line
  this.drawMeasureLine(a, b);

  // Calculate 3D midpoint → project to CSS pixel space
  const mid     = new pc.Vec3().lerp(a, b, 0.5);
  const screenPt = this.worldToScreenCSS(mid);

  window.dispatchEvent(
    new CustomEvent<SpatialMidpoint>('spatial-midpoint-moved', {
      detail: {
        screenX: screenPt?.x ?? -9999,
        screenY: screenPt?.y ?? -9999,
        worldX: mid.x, worldY: mid.y, worldZ: mid.z,
        visible: screenPt?.visible ?? false,
      }
    })
  );
}
```

React listens to these events with direct DOM manipulation (not `useState`) to achieve 60 fps badge updates without triggering React re-renders:

```typescript
// apps/web/src/app/viewer/page.tsx — MeasurementBadgeOverlay
useEffect(() => {
  const onMidpoint = (e: CustomEvent<SpatialMidpoint>) => {
    const { screenX, screenY, visible } = e.detail;
    // Direct style mutation — bypasses React reconciler entirely
    badgeWrapRef.current.style.transform = `translate3d(${screenX}px, ${screenY}px, 0)`;
    badgeWrapRef.current.style.opacity   = visible ? "1" : "0";
  };
  window.addEventListener('spatial-midpoint-moved', onMidpoint as EventListener);
  return () => window.removeEventListener('spatial-midpoint-moved', onMidpoint as EventListener);
}, []);
```

---

## 3. The Single-Editor Paradigm & SuperSplat Integration

### 3.1 The `/editor` Route Architecture

The editor page (`apps/web/src/app/editor/page.tsx`) implements a **unified workspace** that handles two fundamentally different initialisation states through a single component tree. The full SuperSplat tool suite is always visible and operational regardless of which state is active:

```
GET /editor?id=venue-001   →  State A: Venue-Context Injection
GET /editor                →  State B: Clean-Slate Drop Zone
```

The page is wrapped in a `<Suspense>` boundary because it uses `useSearchParams()`:

```typescript
export default function EditorPage() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <EditorInner />
    </Suspense>
  );
}
```

### 3.2 State A — Contextual Venue Injection

When a `?id=` parameter is present in the URL, the editor resolves the venue from the static registry and auto-injects its scan file:

```typescript
function EditorInner() {
  const searchParams = useSearchParams();
  // Accepts both ?id= and legacy ?venue= parameter names
  const venueId = searchParams.get("id") ?? searchParams.get("venue");
  const venue: VenueProfile | null = venues.find((v) => v.id === venueId) ?? null;

  const [assetLoadState, setAssetLoadState] = useState<AssetLoadState>(
    venueId ? "loading" : "idle"   // boots into loading if venue ID is present
  );
```

The injection effect simulates the PlayCanvas SuperSplat `engine.loadScene(url)` pipeline with a ~950 ms parse delay (representing real asset-streaming time). It only re-runs when the `venueId` token changes — not on every render:

```typescript
useEffect(() => {
  if (!venue) { setAssetLoadState("idle"); return; }

  setAssetLoadState("loading");

  const timer = setTimeout(() => {
    const fileName  = venue.splatUrl.split("/").pop() ?? "capture.ply";
    const estPoints = 1_847_203;

    // Update Scene Layers panel with real file name and estimated point count
    setLayers((prev) =>
      prev.map((l) =>
        l.id === "layer-capture"
          ? { ...l, name: fileName, points: estPoints }
          : l
      )
    );

    setSelStats(seedStats(estPoints));
    setActiveAssetLabel(venue.name);    // Header badge: "Auto-Injected Asset Node: [Venue Name]"
    setAssetLoadState("ready");

    // Record to StateOp history (enables undo tracking from injection point)
    setEditHistory([makeStateOp(`Auto-Inject: ${venue.splatUrl}`, 0)]);
  }, 950);

  return () => clearTimeout(timer);
}, [venueId]);
```

**Visual feedback during injection:**

- Header status chip: `<Loader2 animate-spin> Streaming Venue Asset…`
- Canvas: full-viewport `VenueLoadingOverlay` with animated ping ring
- After ready: canvas top bar — `"Editing Environment Track: [Venue Name]"`
- Header chip: `<PackageCheck> Auto-Injected Asset Node: [Venue Name]`

**The "Open in Editor" flow** from the viewer page:

```typescript
// apps/web/src/app/viewer/page.tsx — footer
<Link href={`/editor?id=${venueId}`}>
  <Layers /> Open in Editor
</Link>
```

This creates a complete chain: viewer loads a venue → user clicks "Open in Editor" → editor URL receives `?id=venue-001` → auto-injects the same `.ply` file.

### 3.3 State B — Clean-Slate Drop Zone

When no `?id=` parameter is present, `assetLoadState` initialises to `"idle"` and the canvas renders `CleanSlateOverlay` — a full-viewport dark grid with a drop zone CTA:

```
Drag & Drop Raw .PLY Scan File
to Initialize SuperSplat Engine Workspace
```

File acceptance is wired via three channels:

1. **HTML5 Drag and Drop API** — `onDragOver`, `onDragEnter`, `onDragLeave`, `onDrop` on the canvas wrapper div
2. **Hidden `<input type="file" accept=".ply,.sog">`** — triggered by the "Browse File System" button and the toolbar "Open File" button
3. **Hot-swap when ready** — if a venue is already loaded and the user drops a new file, the overlay `isDragging` state activates and `streamDroppedFile` flushes and re-streams

The `streamDroppedFile` pipeline:

```typescript
const streamDroppedFile = useCallback(async (file: File) => {
  setAssetLoadState("loading");
  setDropLoadState("reading");
  setDropFileName(file.name);

  await new Promise<void>((r) => setTimeout(r, 350));  // binary read simulation
  setDropLoadState("streaming");

  await new Promise<void>((r) => setTimeout(r, 750));  // parse + VRAM buffer

  const estPoints = Math.floor(1_400_000 + Math.random() * 900_000);
  setLayers(/* update layer-capture with file.name */);
  setActiveAssetLabel(file.name.replace(/\.(ply|sog)$/i, ""));
  setAssetLoadState("ready");

  setEditHistory([makeStateOp(`Manual Drop: ${file.name}`, 0)]);
  setDropLoadState("ready");
  setTimeout(() => setDropLoadState("idle"), 2500);
}, []);
```

### 3.4 SuperSplat Tool Suite

The editor exposes the full SuperSplat operation taxonomy via a compact toolbelt (always visible, always operational):

| Group | Tools | Keyboard |
|---|---|---|
| **Select** | Rect, Lasso, Brush, Sphere | `1` `2` `3` `4` |
| **Transform** | Translate, Rotate, Scale | `T` `R` `S` |
| **Optimize** | Prune, Delete, Invert, Reset Grid | `P` `Del` `I` `O` |
| **History** | Undo | `⌘Z` / `Ctrl+Z` |
| **View** | Zoom Fit, Grid Toggle | `F` `G` |
| **Export** | PLY / Compressed PLY / SOG dropdown | — |
| **Import** | Layout Manifest (.json) | — |
| **Open File** | .ply / .sog from disk | — |

Every operation appends a `StateOp` entry to `editHistory`, preserving an audit trail of `{ id, operation, timestamp, delta, textureSnap }` for undo reconstruction.

---

## 4. System Re-Loading via Coordinate Manifests

### 4.1 The Dual-Export Pipeline

`apps/web/src/utils/exportEngine.ts` implements a single public function that triggers two simultaneous browser downloads — one per format:

```typescript
executeSceneExport(
  canvas:       HTMLCanvasElement,  // live PlayCanvas canvas element
  activeAssets: SceneAssetRecord[], // snapshot of all placed models
  venueId:      string              // used in file names
): { png: boolean; json: boolean }
```

**Option A — PNG Blueprint:**  
Calls `canvas.toDataURL('image/png')` synchronously (requires `preserveDrawingBuffer: true` in the PlayCanvas WebGL context) and triggers `venue-blueprint-{venueId}.png` download immediately.

**Option B — JSON Layout Manifest:**  
Serialises `activeAssets` into a `SceneExportManifest` envelope and triggers `venue-layout-manifest-{venueId}.json` download after an 80 ms `setTimeout` to prevent browser download dialog throttling.

### 4.2 JSON Manifest Schema

The exported file follows `SceneExportManifest` (schema version `"1.0"`):

```json
{
  "schemaVersion": "1.0",
  "exportedAt":    "2026-06-02T11:45:00.000Z",
  "venueId":       "venue-001",
  "renderResolution": "8192×4096 @ WebGL2",
  "assetCount":    3,
  "assets": [
    {
      "handle":      "injected::1717321200000::a8f2k",
      "assetId":     "tech-audio-db-v-series",
      "name":        "d&b audiotechnik V-Series Module",
      "group":       "technical",
      "category":    "audio",
      "modelUrl":    "/assets/models/technical/audio/db_v_series.glb",
      "dimensions":  { "width": 0.6, "length": 0.7, "height": 1.2 },
      "injectedAt":  "2026-06-02T11:40:00.000Z"
    }
  ]
}
```

> **Import note:** The import reader also accepts the `injectedAssets` key at the top level as a compatibility alias (for third-party serialisers that omit the `SceneExportManifest` envelope).

### 4.3 The `loadSavedLayoutBuild` Algorithm

When a `.json` manifest is imported via the editor's "Import Layout Manifest" button, `handleManifestFileChange` parses it with a native `FileReader` and calls `engineRef.current.loadSavedLayoutBuild(assets)`. Inside `SplatEngine`:

```typescript
public async loadSavedLayoutBuild(assets: SavedAssetRecord[]): Promise<void> {
  if (!this.app) return;
  if (!Array.isArray(assets) || assets.length === 0) return;

  console.log(`[SplatEngine] Restoring layout build — ${assets.length} asset record(s).`);

  // Step 1: Destroy every currently injected entity and clear the tracking map
  this.flushInjectedModels();

  // Step 2: Load all assets in parallel with per-asset fault isolation
  const results = await Promise.allSettled(
    assets.map((record, idx) => this.loadSavedAssetRecord(record, idx))
  );

  const ok  = results.filter((r) => r.status === 'fulfilled').length;
  const err = results.filter((r) => r.status === 'rejected').length;
  console.log(`[SplatEngine] Layout build restored: ${ok} loaded, ${err} skipped.`);
}
```

**`flushInjectedModels()`** — pre-restore VRAM clean sweep:

```typescript
private flushInjectedModels(): void {
  this.applyDeselection();  // clear activeSelection pointer first

  for (const [handle, entity] of this.injectedModels) {
    entity.destroy();       // releases WebGL geometry buffers, textures, materials
  }
  this.injectedModels.clear();
}
```

**`loadSavedAssetRecord(record, slotIndex)`** — loads one `.glb` at its stored coordinates:

```typescript
private loadSavedAssetRecord(record: SavedAssetRecord, slotIndex: number): Promise<void> {
  return new Promise<void>((resolve) => {
    const url    = record.modelUrl;
    const handle = `restored::${slotIndex}::${Date.now()}::${Math.random().toString(36).slice(2, 5)}`;
    const asset  = new pc.Asset(handle, 'container', { url });

    asset.on('load', (loadedAsset: pc.Asset) => {
      const entity = (loadedAsset.resource as any).instantiateRenderEntity() as pc.Entity;
      app.root.addChild(entity);

      // ── Position resolution (object form OR tuple form) ──
      const pos = record.position;
      let tx = 0, ty = 0, tz = 0;

      if (Array.isArray(pos) && pos.length >= 3) {
        [tx, ty, tz] = pos;                         // tuple: [x, y, z]
      } else if (pos && typeof pos === 'object') {
        tx = pos.x ?? 0; ty = pos.y ?? 0; tz = pos.z ?? 0;  // object: {x,y,z}
      } else {
        tx = slotIndex * 2;                          // no position → stagger on X axis
      }

      // ── Rotation resolution (same dual-form support) ──
      const rot = record.rotation;
      let rx = 0, ry = 0, rz = 0;
      if (Array.isArray(rot) && rot.length >= 3) { [rx, ry, rz] = rot; }
      else if (rot && typeof rot === 'object')   { rx = rot.x ?? 0; ry = rot.y ?? 0; rz = rot.z ?? 0; }

      entity.setPosition(tx, ty, tz);
      entity.setEulerAngles(rx, ry, rz);            // degrees — PlayCanvas YXZ convention

      this.injectedModels.set(handle, entity);       // register for selection interactions
      resolve();
    });

    asset.on('error', (err: string) => {
      // Non-fatal — log and continue with remaining assets
      console.warn(`[SplatEngine] Layout record[${slotIndex}] fault: ${err} — skipped.`);
      resolve();
    });

    app.assets.add(asset);
    app.assets.load(asset);
  });
}
```

**Key design decisions:**

- `Promise.allSettled` (not `Promise.all`) ensures one bad URL never aborts the entire restore batch
- Position and rotation accept both `{ x, y, z }` (viewer export format) and `[x, y, z]` (third-party compatibility)
- Models missing a `position` are staggered at `slotIndex × 2` metres on the X axis — they never pile up at the origin
- Restored models are registered in `injectedModels` and participate in subsequent selection, translation, and re-export interactions

### 4.4 Asset Directory Structure (Client-Side)

The `modelUrl` paths in `assetLibrary.ts` follow this canonical layout under `public/assets/models/` (local dev) or the CDN base URL (production):

```
assets/models/
├── technical/
│   ├── audio/
│   │   ├── db_v_series.glb
│   │   └── digico_quantum338.glb
│   ├── lighting/
│   │   ├── moving_head_profile.glb
│   │   └── haze_machine.glb
│   └── led/
│       └── p3_9_led_panel.glb
├── staging/
│   ├── stage/
│   │   └── concert_stage_deck_4x4.glb
│   ├── risers/
│   │   └── drum_riser_2x2.glb
│   ├── trussing/
│   │   ├── truss_goalpost.glb
│   │   └── roof_rigging_tower.glb
│   └── scaffolding/
│       └── pa_delay_tower.glb
└── construction/
    ├── tin_barricade/
    │   └── galvanized_tin_barricade.glb
    ├── mojo_barricade/
    │   └── mojo_crowd_control.glb
    └── welfare/
        └── mobile_toilets_block.glb
```

The `AssetCategory` taxonomy directly mirrors these directory names:

```typescript
type AssetGroup    = 'technical' | 'staging' | 'construction';
type AssetCategory = 'audio' | 'lighting' | 'led'
                   | 'stage' | 'risers' | 'trussing' | 'scaffolding'
                   | 'tin_barricade' | 'mojo_barricade' | 'welfare';
```

---

## 5. Containerisation & Cross-Platform Deployment

### 5.1 Docker Multi-Stage Build Sequence

The `Dockerfile` at the monorepo root uses four named stages:

```
┌────────────────────────────────────────────────────────────────┐
│  Stage: base                                                   │
│  node:20-alpine + libc6-compat + corepack → pnpm@11.5.0       │
└──────────────────────────┬─────────────────────────────────────┘
                           │ inherits
        ┌──────────────────┴──────────────────┐
        ▼                                     ▼
┌────────────────┐                 ┌──────────────────────────────┐
│  Stage: deps   │                 │  Stage: builder              │
│                │                 │                              │
│  COPY manifests│                 │  COPY --from=deps            │
│  only (no src) │                 │    node_modules (3 trees)    │
│                │                 │  COPY . . (source)           │
│  pnpm install  │                 │                              │
│  --frozen-lock │                 │  pnpm run build              │
│                │                 │  (turbo → core-3d → next)    │
└────────────────┘                 └──────────────────────────────┘
                                             │ COPY --from=builder
                                             ▼
                                  ┌──────────────────────────────┐
                                  │  Stage: runner               │
                                  │  node:20-alpine (fresh)      │
                                  │  pnpm@11.5.0                 │
                                  │  Non-root user: nextjs       │
                                  │  NODE_OPTIONS:               │
                                  │    --max-old-space-size=4096 │
                                  │                              │
                                  │  Copies:                     │
                                  │  • node_modules (all 3)      │
                                  │  • core-3d/dist              │
                                  │  • apps/web/.next            │
                                  │  • apps/web/public           │
                                  │  • next.config.js            │
                                  │  • workspace manifests       │
                                  │                              │
                                  │  WORKDIR /app/apps/web       │
                                  │  CMD ["pnpm", "start"]       │
                                  └──────────────────────────────┘
```

**Why separate `deps` and `builder` stages?**

Docker layer caching. The `deps` stage copies only `package.json` and lockfiles — no source code. This layer is cached between builds as long as dependencies don't change. A source-only code change will skip `pnpm install` entirely, completing the build in seconds rather than minutes.

**Why three `node_modules` copies?**

pnpm's virtual store uses symlinks: the root `node_modules/.pnpm/` holds all packages; workspace-level `node_modules/` contain symlinks into the store. Copying all three directories (root + `core-3d` + `apps/web`) preserves the complete symlink graph needed for module resolution at runtime.

**Build quick-reference:**

```bash
# Full production build
docker build -t venue-platform .

# Run locally
docker run -p 3000:3000 venue-platform

# Compose (recommended — includes resource limits and healthcheck)
docker compose up --build
docker compose up -d        # detached
docker compose logs -f web  # tail logs
```

### 5.2 Docker Compose Resource Parameters

`docker-compose.yml` wires the following parameters specifically for WebGL canvas workloads:

| Parameter | Value | Rationale |
|---|---|---|
| `NODE_OPTIONS` | `--max-old-space-size=4096 --gc-interval=100 --expose-gc` | Raises V8 heap ceiling; nudges GC to collect canvas frame buffers before old-gen promotion |
| `memory` limit | `5g` | Caps a runaway 3DGS parser from consuming all host RAM |
| `cpus` limit | `"2.0"` | Dedicates one core to JS event loop, one to V8 GC workers |
| `memory` reservation | `1g` | Prevents scheduler eviction during host memory pressure |
| `restart` | `unless-stopped` | Auto-recovers from crashes; respects intentional `docker stop` |
| `healthcheck` | `wget http://localhost:3000/` every 30s | Signals readiness to load balancers |

### 5.3 Production Hosting Architecture — Why Vercel + CloudFront

```
User browser
    │
    ├── HTML, JS, CSS, API routes
    │       ↓
    │   VERCEL EDGE (bom1/sin1)          lightweight — serverless functions
    │   $/request, cold-start safe        Next.js App Router
    │
    └── .ply captures, .glb models
            ↓
        CLOUDFRONT CDN                   heavy — persistent edge cache
        assets.venueplatform.com         ~$0.008/GB from Mumbai PoP
        Origin: S3 ap-south-1
```

**Why assets cannot live on Vercel:**

| Constraint | Impact |
|---|---|
| Vercel serverless functions have a 10s execution limit | A 200 MB `.ply` streaming response would time out |
| Vercel bandwidth is billed at ~$0.40/GB (Pro) | A 3DGS capture served 100× costs $8 per file |
| Serverless cold starts add 200–800ms | PlayCanvas's `asset.on('load')` would block viewer initialisation |
| Vercel does not cache arbitrary binary responses | Every request hits the filesystem — no edge caching |

**CloudFront solves all four:**

- Persistent TCP connections at edge PoPs — no cold starts
- Cached responses hit at <15 ms TTFB for warm assets
- Billed at S3 + CloudFront rates (~$0.51/month at Kolkata-market initial scale)
- `Accept-Ranges: bytes` support enables HTTP range requests for large `.ply` streaming

### 5.4 `vercel.json` Header Policy

The `apps/web/vercel.json` enforces two distinct header profiles:

**Global security baseline (all routes):**

```
X-Content-Type-Options:    nosniff
X-Frame-Options:           SAMEORIGIN
Referrer-Policy:           strict-origin-when-cross-origin
Cross-Origin-Opener-Policy: same-origin-allow-popups   ← Gmail mailto popups must work
Cross-Origin-Embedder-Policy: unsafe-none              ← CDN cross-origin fetches must work
```

**Asset CORS profile (`/assets/:path*`):**

```
Access-Control-Allow-Origin:    *
Access-Control-Allow-Methods:   GET, HEAD, OPTIONS
Access-Control-Allow-Headers:   Content-Type, Range, Accept-Encoding
Access-Control-Expose-Headers:  Content-Length, Content-Range, Accept-Ranges
Cross-Origin-Resource-Policy:   cross-origin
Cache-Control:                  public, max-age=31536000, immutable
```

The `Cross-Origin-Resource-Policy: cross-origin` header on asset responses is the critical unlock: Chromium-based browsers block cross-origin resource reads when COEP is active unless the served resource explicitly opts in with this header. Without it, PlayCanvas's `app.assets.load()` will silently fail even after a successful fetch.

### 5.5 Deployment Checklist

```
Infrastructure
  □ Create S3 bucket venue-platform-assets (ap-south-1, Block Public Access)
  □ Create CloudFront OAC → distribution → attach S3 bucket policy
  □ Configure CloudFront response headers policy (CORS + CORP headers)
  □ Create ACM certificate for assets.venueplatform.com (us-east-1)
  □ Route 53 CNAME assets.venueplatform.com → CloudFront domain

Asset upload
  □ Upload venue .ply captures with Content-Type: application/octet-stream
  □ Upload collision.glb proxies with Content-Type: model/gltf-binary
  □ Upload all equipment .glb models with correct Cache-Control metadata
  □ Validate TTFB < 100ms from Mumbai-proxied machine

Codebase (pre-production)
  □ Fix next.config.js: transpilePackages: ['@venue/core-3d']  (not @spatial)
  □ Add @venue/core-3d as explicit dependency in apps/web/package.json
  □ Set NEXT_PUBLIC_ASSET_CDN_BASE in Vercel environment variables
  □ Update venues.ts splatUrl fields to CDN base URL
  □ Update assetLibrary.ts modelUrl fields to CDN base URL

Vercel
  □ Connect GitHub repo; set Root Directory = apps/web
  □ Confirm build command: cd ../.. && pnpm turbo run build --filter=@venue/web...
  □ Confirm install command: cd ../.. && pnpm install --frozen-lockfile
  □ Set all environment variables (NODE_ENV, ASSET_CDN_BASE)

Smoke tests
  □ GET /viewer?id=venue-001 — PlayCanvas canvas loads, no CORS errors
  □ Measure mode — two clicks produce distance badge and telemetry entry
  □ Inject mode — model placement persists across panel open/close
  □ Export — PNG download + JSON manifest download trigger correctly
  □ Import — manifest re-places models at correct coordinates
  □ Editor — State A auto-injects on ?id= URL; State B shows drop zone
  □ All CORS headers present on asset responses (verify with curl -I)
```

---

## Appendix A — Key Constant Reference

```typescript
// SplatEngine.ts — tuning constants
const CAM = {
  YAW_SPEED:         0.25,   // deg/px horizontal drag
  PITCH_SPEED:       0.25,   // deg/px vertical drag
  ZOOM_SPEED:        0.5,    // world units per normalised scroll tick
  PITCH_LIMIT:       88,     // clamp degrees — prevents gimbal flip
  CLICK_MAX_DRAG_SQ: 16,     // px² — click discrimination threshold
} as const;

const INJECT = {
  TRANSLATE_SPEED: 0.25,     // world units per arrow-key press
} as const;
```

## Appendix B — Custom Event Reference

| Event name | Payload type | Fired when | Consumer |
|---|---|---|---|
| `spatial-metric-logged` | `SpatialMeasurement` | Second anchor clicked (pair complete) | `TelemetryLedger` state update via `useEffect` |
| `spatial-midpoint-moved` | `SpatialMidpoint` | Every animation frame while A+B held | `MeasurementBadgeOverlay` — direct DOM mutation |
| `spatial-model-selected` | `InjectedModelHandle \| null` | Model selected or deselected in inject mode | Viewer page — model info display |

## Appendix C — Package Name Resolution (Known Discrepancy)

The following name mismatch exists between `next.config.js` and the installed package and must be corrected before any production build:

| File | Current value | Correct value |
|---|---|---|
| `apps/web/next.config.js` → `transpilePackages` | `['@spatial/core-3d']` | `['@venue/core-3d']` |
| `apps/web/package.json` → `dependencies` | *(not listed)* | Add `"@venue/core-3d": "workspace:*"` |

Without this fix, Next.js will not transpile the workspace package source and will fail to resolve `@venue/core-3d` imports during `next build`.
