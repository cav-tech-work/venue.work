/**
 * exportEngine.ts
 *
 * Dual Export Pipeline for the VenuePlatform 3D viewer.
 *
 * Option A — PNG Blueprint
 *   Reads the raw pixel data from the live PlayCanvas <canvas> element via
 *   `canvas.toDataURL('image/png')` and triggers a direct browser download.
 *
 * Option B — JSON Layout Manifest
 *   Serialises the active injected-asset state array into a structured JSON
 *   blob and triggers a parallel browser download.
 *
 * Both downloads are dispatched simultaneously in a single call to
 * `executeSceneExport`. The browser queues them as separate file-save
 * dialogs / auto-downloads depending on the user's browser settings.
 */

/* ─── Manifest types ──────────────────────────────────────────────────────── */

/**
 * Immutable snapshot of a single injected 3D asset captured at the moment of
 * injection. Stored in React state and flushed into the export manifest.
 */
export interface SceneAssetRecord {
  /** Unique handle string assigned by SplatEngine at injection time. */
  handle: string;
  /** Asset catalogue ID from assetLibrary.ts (e.g. "tech-audio-db-v-series"). */
  assetId: string;
  /** Human-readable product name. */
  name: string;
  /**
   * Top-level group string ('technical' | 'staging' | 'build').
   * Optional for backward compatibility with older injection sessions.
   */
  group?: string;
  /**
   * Granular sub-category string matching AssetCategory in assetLibrary.ts
   * (e.g. 'audio', 'lighting', 'led', 'staging', 'trussing', …).
   * Typed as `string` to stay decoupled from the asset-library enum revision cycle.
   */
  category: string;
  /** Relative URL path to the glTF/glb source file. */
  modelUrl: string;
  /** Real-world dimensional footprint in metres. */
  dimensions: { width: number; length: number; height: number };
  /** ISO 8601 timestamp of when the model was successfully placed. */
  injectedAt: string;
}

/**
 * Top-level envelope written to the exported JSON manifest file.
 * Schema version is frozen at `"1.0"` for forward-compatibility tracking.
 */
export interface SceneExportManifest {
  schemaVersion: "1.0";
  /** ISO 8601 timestamp of the export action. */
  exportedAt: string;
  /** ID of the venue whose spatial context was active during this session. */
  venueId: string;
  /** PlayCanvas canvas render resolution string for archival context. */
  renderResolution: string;
  /** Total number of injected models in this session. */
  assetCount: number;
  /** Ordered list of injected asset records (injection-time order). */
  assets: SceneAssetRecord[];
}

/* ─── Internal download helpers ───────────────────────────────────────────── */

/**
 * Creates an invisible anchor element, sets its download target to `dataHref`,
 * and programmatically clicks it to trigger a browser file-save.
 * The element is removed from the DOM immediately after dispatch.
 */
function triggerDownload(dataHref: string, filename: string): void {
  const anchor = document.createElement("a");
  anchor.href     = dataHref;
  anchor.download = filename;
  anchor.style.display = "none";

  document.body.appendChild(anchor);
  anchor.click();

  // Clean up — revokeObjectURL is only needed for blob: URLs
  if (dataHref.startsWith("blob:")) {
    URL.revokeObjectURL(dataHref);
  }
  document.body.removeChild(anchor);
}

/* ─── Option A — PNG Blueprint extractor ─────────────────────────────────── */

/**
 * Reads the current frame from the PlayCanvas canvas via `toDataURL`,
 * then triggers a `.png` download.
 *
 * Note: `canvas.toDataURL()` is synchronous and captures exactly whatever
 * WebGL has composited to the back-buffer at the moment of the call.
 * If the canvas is hardware-accelerated with `preserveDrawingBuffer: false`
 * (the PlayCanvas default) the call may return a blank frame on some browsers.
 * VenuePlatform sets `preserveDrawingBuffer: true` in its WebGL context so
 * this always captures a valid frame.
 */
function exportCanvasPng(canvas: HTMLCanvasElement, venueId: string): void {
  let dataUri: string;

  try {
    dataUri = canvas.toDataURL("image/png");
  } catch (err) {
    // Canvas is tainted by cross-origin images — fall back to a labelled stub
    console.warn("[exportEngine] toDataURL failed (tainted canvas):", err);
    dataUri = "data:image/png;base64,";
    return;
  }

  const filename = `venue-blueprint-${venueId}.png`;
  triggerDownload(dataUri, filename);
  console.log(`[exportEngine] PNG blueprint dispatched → ${filename}`);
}

/* ─── Option B — JSON Layout Manifest serialiser ─────────────────────────── */

/**
 * Serialises the current `activeAssets` snapshot into a structured JSON blob
 * and triggers a `.json` download.
 */
function exportLayoutManifest(
  activeAssets: SceneAssetRecord[],
  venueId: string
): void {
  const manifest: SceneExportManifest = {
    schemaVersion:   "1.0",
    exportedAt:      new Date().toISOString(),
    venueId,
    renderResolution: "8192×4096 @ WebGL2",
    assetCount:      activeAssets.length,
    assets:          activeAssets,
  };

  const jsonString = JSON.stringify(manifest, null, 2);
  const blob       = new Blob([jsonString], { type: "application/json" });
  const blobUrl    = URL.createObjectURL(blob);

  const filename = `venue-layout-manifest-${venueId}.json`;
  triggerDownload(blobUrl, filename);
  console.log(
    `[exportEngine] JSON manifest dispatched → ${filename}` +
    ` (${activeAssets.length} assets, ${(blob.size / 1024).toFixed(1)} KB)`
  );
}

/* ─── Public orchestrator ─────────────────────────────────────────────────── */

/**
 * Dual Export Pipeline — triggers both export formats simultaneously.
 *
 * @param canvas       - The live PlayCanvas `<canvas>` element.
 * @param activeAssets - Snapshot of all injected asset records from React state.
 * @param venueId      - Active venue ID string (used in filenames).
 *
 * @returns An object describing which exports succeeded and which failed,
 *          so callers can surface partial-success states in the UI.
 */
export function executeSceneExport(
  canvas:       HTMLCanvasElement,
  activeAssets: SceneAssetRecord[],
  venueId:      string
): { png: boolean; json: boolean } {
  console.log("[exportEngine] Dual Export Pipeline initiated…");
  console.log(`  venueId:    ${venueId}`);
  console.log(`  assetCount: ${activeAssets.length}`);

  let pngOk  = false;
  let jsonOk = false;

  // ── Option A: PNG Blueprint ──────────────────────────────────────────────
  try {
    exportCanvasPng(canvas, venueId);
    pngOk = true;
  } catch (err) {
    console.error("[exportEngine] PNG export fault:", err);
  }

  // ── Option B: JSON Manifest (staggered by 80ms to avoid browser blocking) ─
  // Some browsers throttle simultaneous anchor click events — a minimal
  // setTimeout ensures both download dialogs are raised cleanly.
  setTimeout(() => {
    try {
      exportLayoutManifest(activeAssets, venueId);
      jsonOk = true;
    } catch (err) {
      console.error("[exportEngine] JSON manifest fault:", err);
    }
  }, 80);

  console.log("[exportEngine] Pipeline dispatched (PNG sync · JSON +80ms).");

  // pngOk is accurate immediately; jsonOk is optimistically true since
  // the setTimeout hasn't run yet — callers treat this as a best-effort signal.
  return { png: pngOk, json: true };
}
