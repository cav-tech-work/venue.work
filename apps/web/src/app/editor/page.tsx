"use client";

import {
  useState,
  useRef,
  useCallback,
  useEffect,
  Suspense,
} from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import {
  /* Navigation */
  LogOut,
  ChevronLeft,
  /* Select tools — Rect · Lasso · Brush · Sphere */
  Square,
  Lasso,
  Circle,
  Globe,
  /* Transform gizmos — Translate · Rotate · Scale */
  Move,
  RotateCw,
  Maximize2,
  /* Optimization — Prune · Delete · Invert · Reset Grid */
  Scissors,
  Trash2,
  FlipHorizontal2,
  Grid3x3,
  RotateCcw,
  /* History */
  Undo2,
  /* Export */
  FileDown,
  Archive,
  ChevronDown,
  ChevronUp,
  /* Import */
  FileJson,
  /* Workspace / file I/O */
  Upload,
  FolderOpen,
  /* Status badges */
  Loader2,
  CheckCircle2,
  AlertCircle,
  PackageCheck,
  PackageSearch,
  Zap,
  /* Panels */
  Layers,
  SlidersHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Eye,
  EyeOff,
  Lock,
  Unlock,
  ChevronRight,
  /* HUD / chrome */
  Box,
  Cpu,
  Activity,
  Radio,
  Hash,
  Scan,
  ZoomIn,
} from "lucide-react";
import { venues, type VenueProfile } from "@/data/venues";
import { type SceneAssetRecord } from "@/utils/exportEngine";
import { type SavedAssetRecord } from "@venue/core-3d";

function cn(...inputs: Parameters<typeof clsx>): string {
  return twMerge(clsx(inputs));
}

/* ══════════════════════════════════════════════════════════════════════════════
   TYPES — SuperSplat operation taxonomy
══════════════════════════════════════════════════════════════════════════════ */

/**
 * Primary interaction mode.
 * navigate  → orbit/pan camera, no Gaussian interaction
 * select    → activate a selection sub-tool (rect/lasso/brush/sphere)
 * transform → apply a transform gizmo (translate/rotate/scale)
 * prune     → deletion-oriented operations (prune, delete)
 */
type EditMode = "navigate" | "select" | "transform" | "prune";

/**
 * SuperSplat selection sub-tools:
 *  rect   → rectangular marquee (drag to box-select Gaussians)
 *  lasso  → freehand polygon loop selection
 *  brush  → circular radius paint — accumulates selection on drag
 *  sphere → 3-D sphere: place in world space, radius to include depth
 */
type SelectSubMode = "rect" | "lasso" | "brush" | "sphere";

/**
 * SuperSplat transform gizmos:
 *  translate → XYZ move gizmo (grab + drag axis arrow)
 *  rotate    → yaw / pitch / roll arc gizmo
 *  scale     → uniform world-space scale handles
 */
type TransformSubMode = "translate" | "rotate" | "scale";

/** Three native SuperSplat / PlayCanvas export targets. */
type ExportFormat = "ply" | "ply-compressed" | "sog";

/** Multi-stage export pipeline lifecycle. */
type ExportStage =
  | "idle"
  | "indexing"
  | "sh-coeffs"
  | "quantizing"
  | "compressing"
  | "finalizing"
  | "done"
  | "error";

/**
 * Workspace initialization state.
 *  idle     → State B: no venue, no file; shows clean-slate drop zone
 *  loading  → asset streaming (venue auto-inject OR manual file drop)
 *  ready    → workspace live, canvas has Gaussians
 *  error    → load or parse failure
 */
type AssetLoadState = "idle" | "loading" | "ready" | "error";

/** Option B: granular file-stream progress. */
type DropLoadState = "idle" | "reading" | "streaming" | "ready" | "error";

/**
 * StateOp — mirrors SuperSplat's internal edit history entry.
 * textureSnap records the transform-texture GUID at the time of the op,
 * enabling future undo/redo reconstruction.
 */
interface StateOp {
  id:           string;
  operation:    string;
  timestamp:    string;
  delta:        number;
  textureSnap?: string;
}

interface SplatLayer {
  id:      string;
  name:    string;
  visible: boolean;
  locked:  boolean;
  opacity: number;
  points:  number;
}

interface SelectionStats {
  totalPoints:     number;
  selectedPoints:  number;
  selectionVolume: number;
  bounds: {
    minX: number; maxX: number;
    minY: number; maxY: number;
    minZ: number; maxZ: number;
  };
}

/* ══════════════════════════════════════════════════════════════════════════════
   EXPORT FORMAT CONFIG
══════════════════════════════════════════════════════════════════════════════ */

interface ExportFormatConfig {
  label:       string;
  sublabel:    string;
  ext:         string;
  icon:        React.ReactNode;
  accentClass: string;
  stages:      Array<[ExportStage, number, number]>;
}

const EXPORT_FORMAT_CONFIG: Record<ExportFormat, ExportFormatConfig> = {
  ply: {
    label:       "PLY (Standard)",
    sublabel:    "Raw point-cloud — uncompressed",
    ext:         ".ply",
    icon:        <FileDown  className="h-3.5 w-3.5" />,
    accentClass: "text-emerald-400 border-emerald-600/40 bg-emerald-600/8 hover:border-emerald-500/70 hover:bg-emerald-500/15",
    stages: [["indexing", 30, 300], ["finalizing", 90, 250], ["done", 100, 0]],
  },
  "ply-compressed": {
    label:       "Compressed PLY",
    sublabel:    "LZ4-packed binary stream",
    ext:         "-compressed.ply",
    icon:        <Archive   className="h-3.5 w-3.5" />,
    accentClass: "text-cyan-400 border-cyan-600/40 bg-cyan-600/8 hover:border-cyan-500/70 hover:bg-cyan-500/15",
    stages: [
      ["indexing", 10, 380], ["sh-coeffs", 35, 520], ["quantizing", 58, 400],
      ["compressing", 80, 600], ["finalizing", 95, 300], ["done", 100, 0],
    ],
  },
  sog: {
    label:       "SOG (SuperSplat)",
    sublabel:    "Optimised scene object graph",
    ext:         ".sog",
    icon:        <Zap       className="h-3.5 w-3.5" />,
    accentClass: "text-violet-400 border-violet-600/40 bg-violet-600/8 hover:border-violet-500/70 hover:bg-violet-500/15",
    stages: [
      ["indexing", 15, 300], ["sh-coeffs", 40, 450],
      ["quantizing", 70, 350], ["finalizing", 95, 200], ["done", 100, 0],
    ],
  },
};

const EXPORT_STAGE_LABEL: Record<ExportStage, string> = {
  idle:        "",
  indexing:    "Indexing gaussians…",
  "sh-coeffs": "Computing SH coefficients…",
  quantizing:  "Quantizing opacity tensors…",
  compressing: "LZ4 block compression…",
  finalizing:  "Finalizing binary payload…",
  done:        "Export complete ✓",
  error:       "Export fault — check console",
};

/* ══════════════════════════════════════════════════════════════════════════════
   CANVAS CURSOR MAP
══════════════════════════════════════════════════════════════════════════════ */

function resolveCanvasCursor(
  editMode:     EditMode,
  selectSub:    SelectSubMode,
  transformSub: TransformSubMode,
): string {
  switch (editMode) {
    case "navigate":  return "grab";
    case "prune":     return "no-drop";
    case "select":
      if (selectSub === "rect")   return "cell";
      if (selectSub === "lasso")  return "crosshair";
      if (selectSub === "brush")  return "copy";
      if (selectSub === "sphere") return "crosshair";
      return "crosshair";
    case "transform":
      if (transformSub === "translate") return "move";
      if (transformSub === "rotate")    return "grabbing";
      if (transformSub === "scale")     return "nw-resize";
      return "move";
    default:
      return "default";
  }
}

/* ══════════════════════════════════════════════════════════════════════════════
   SEED HELPERS
══════════════════════════════════════════════════════════════════════════════ */

function seedLayers(venueId: string | null): SplatLayer[] {
  return [
    {
      id:      "layer-capture",
      name:    venueId ? `${venueId}-capture.ply` : "awaiting-asset.ply",
      visible: true,
      locked:  false,
      opacity: 1.0,
      points:  0,
    },
    {
      id:      "layer-floor",
      name:    "Ground Plane Reference",
      visible: true,
      locked:  true,
      opacity: 0.45,
      points:  214_880,
    },
  ];
}

function seedStats(total: number): SelectionStats {
  return {
    totalPoints:     total,
    selectedPoints:  0,
    selectionVolume: 0,
    bounds: { minX: 0, maxX: 0, minY: 0, maxY: 0, minZ: 0, maxZ: 0 },
  };
}

/* ══════════════════════════════════════════════════════════════════════════════
   FILE HELPERS
══════════════════════════════════════════════════════════════════════════════ */

const SPLAT_EXTENSIONS = [".ply", ".sog"] as const;

function isSplatFile(file: File): boolean {
  const lower = file.name.toLowerCase();
  return SPLAT_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

function makeStateOp(
  operation: string,
  delta: number,
  textureSnap?: string,
): StateOp {
  return {
    id:          `op-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    operation,
    timestamp:   new Date().toISOString(),
    delta,
    textureSnap: textureSnap ?? Math.random().toString(36).slice(2, 10),
  };
}

/* ══════════════════════════════════════════════════════════════════════════════
   SUB-COMPONENTS
══════════════════════════════════════════════════════════════════════════════ */

function ToolDivider() {
  return <div className="h-5 w-px bg-border/45 shrink-0 mx-0.5" />;
}

function GroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="select-none shrink-0 font-mono text-[7px] text-[#3a3a4a] tracking-[0.22em] uppercase px-0.5">
      {children}
    </span>
  );
}

function ToolBtn({
  icon, label, shortcut, active, danger, disabled, onClick,
}: {
  icon:      React.ReactNode;
  label:     string;
  shortcut?: string;
  active?:   boolean;
  danger?:   boolean;
  disabled?: boolean;
  onClick:   () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={shortcut ? `${label}  [${shortcut}]` : label}
      className={cn(
        "flex items-center gap-1.5 rounded px-2.5 py-1.5 border font-mono text-[9px] tracking-wider transition-all duration-150 shrink-0",
        active && !danger  && "border-accent/55 bg-accent/14 text-accent shadow-[0_0_12px_-4px_rgba(99,102,241,0.45)]",
        danger             && "border-red-500/35 bg-red-500/8 text-red-400 hover:border-red-500/60 hover:bg-red-500/15",
        !active && !danger && "border-border/40 bg-surface/30 text-text-secondary hover:border-border hover:text-text-primary hover:bg-surface/60",
        disabled           && "opacity-30 cursor-not-allowed pointer-events-none",
      )}
    >
      {icon}
      <span className="hidden lg:inline">{label}</span>
      {shortcut && (
        <kbd className="hidden xl:inline font-mono text-[6px] text-text-muted border border-border/30 rounded px-1 py-px leading-none">
          {shortcut}
        </kbd>
      )}
    </button>
  );
}

/* ─── Scene Layers panel ───────────────────────────────────────────────────── */

function LayersPanel({
  layers, isOpen, onToggle, onVisibilityToggle, onLockToggle,
}: {
  layers:             SplatLayer[];
  isOpen:             boolean;
  onToggle:           () => void;
  onVisibilityToggle: (id: string) => void;
  onLockToggle:       (id: string) => void;
}) {
  return (
    <aside className={cn(
      "relative flex flex-col border-r border-border/50 bg-[#090912]/90 backdrop-blur-sm transition-all duration-300 shrink-0",
      isOpen ? "w-56" : "w-9"
    )}>
      <button
        onClick={onToggle}
        className="absolute -right-3.5 top-5 z-30 flex h-7 w-7 items-center justify-center rounded-full border border-border bg-[#0c0c18] hover:border-accent/40 shadow-lg transition-colors"
        title={isOpen ? "Collapse Layers" : "Expand Layers"}
      >
        {isOpen ? <PanelLeftClose className="h-3 w-3 text-text-muted" /> : <PanelLeftOpen className="h-3 w-3 text-text-muted" />}
      </button>

      {!isOpen && (
        <div className="flex flex-1 items-center justify-center">
          <span className="font-mono text-[8px] text-text-muted tracking-[0.2em] uppercase" style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}>
            Scene Layers
          </span>
        </div>
      )}

      {isOpen && (
        <div className="flex flex-col h-full overflow-hidden">
          <div className="shrink-0 flex items-center gap-2 px-3 py-2.5 border-b border-border/40">
            <Layers className="h-3 w-3 text-accent" />
            <span className="font-mono text-[10px] font-semibold text-text-primary tracking-widest uppercase">Scene Layers</span>
          </div>

          <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-track-transparent scrollbar-thumb-border py-1">
            {layers.map((layer) => (
              <div key={layer.id} className="group flex items-center gap-2 px-3 py-2 hover:bg-surface/40 transition-colors">
                <button onClick={() => onVisibilityToggle(layer.id)} className="shrink-0 text-text-muted hover:text-text-primary transition-colors" title={layer.visible ? "Hide" : "Show"}>
                  {layer.visible ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3 opacity-40" />}
                </button>
                <button onClick={() => onLockToggle(layer.id)} className="shrink-0 text-text-muted hover:text-text-primary transition-colors" title={layer.locked ? "Unlock" : "Lock"}>
                  {layer.locked ? <Lock className="h-2.5 w-2.5 text-amber-400/70" /> : <Unlock className="h-2.5 w-2.5 opacity-30" />}
                </button>
                <div className="flex flex-col min-w-0 flex-1">
                  <p className="font-mono text-[9px] text-text-primary truncate">{layer.name}</p>
                  <p className="font-mono text-[7px] text-text-muted">
                    {layer.points > 0 ? `${layer.points.toLocaleString()} pts` : "empty"} · {Math.round(layer.opacity * 100)}%
                  </p>
                </div>
              </div>
            ))}
          </div>

          <div className="shrink-0 px-3 py-2 border-t border-border/40 bg-background/40">
            <p className="font-mono text-[8px] text-text-muted">
              Total: <span className="text-text-secondary">{layers.reduce((s, l) => s + l.points, 0).toLocaleString()} pts</span>
            </p>
          </div>
        </div>
      )}
    </aside>
  );
}

/* ─── Gaussian Inspector panel ─────────────────────────────────────────────── */

function InspectorPanel({
  stats, editHistory, isOpen, onToggle,
}: {
  stats:       SelectionStats;
  editHistory: StateOp[];
  isOpen:      boolean;
  onToggle:    () => void;
}) {
  const pct = stats.totalPoints > 0
    ? ((stats.selectedPoints / stats.totalPoints) * 100).toFixed(2)
    : "0.00";

  return (
    <aside className={cn(
      "relative flex flex-col border-l border-border/50 bg-[#090912]/90 backdrop-blur-sm transition-all duration-300 shrink-0",
      isOpen ? "w-60" : "w-9"
    )}>
      <button
        onClick={onToggle}
        className="absolute -left-3.5 top-5 z-30 flex h-7 w-7 items-center justify-center rounded-full border border-border bg-[#0c0c18] hover:border-accent/40 shadow-lg transition-colors"
        title={isOpen ? "Collapse Inspector" : "Expand Inspector"}
      >
        {isOpen ? <PanelRightClose className="h-3 w-3 text-text-muted" /> : <PanelRightOpen className="h-3 w-3 text-text-muted" />}
      </button>

      {!isOpen && (
        <div className="flex flex-1 items-center justify-center">
          <span className="font-mono text-[8px] text-text-muted tracking-[0.2em] uppercase" style={{ writingMode: "vertical-rl" }}>Inspector</span>
        </div>
      )}

      {isOpen && (
        <div className="flex flex-col h-full overflow-hidden">
          <div className="shrink-0 flex items-center gap-2 px-3 py-2.5 border-b border-border/40">
            <SlidersHorizontal className="h-3 w-3 text-accent" />
            <span className="font-mono text-[10px] font-semibold text-text-primary tracking-widest uppercase">Gaussian Inspector</span>
          </div>

          <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-track-transparent scrollbar-thumb-border">
            {/* Selection stats */}
            <div className="px-3 py-3 border-b border-border/30">
              <p className="font-mono text-[8px] text-text-muted tracking-widest uppercase mb-2">Selection Statistics</p>
              <div className="flex flex-col gap-1.5">
                {([
                  ["Total Points",  stats.totalPoints.toLocaleString(),    "pts"],
                  ["Selected",      stats.selectedPoints.toLocaleString(), "pts"],
                  ["Selection %",   pct,                                  "%"],
                  ["Est. Volume",   stats.selectionVolume.toFixed(3),      "m³"],
                ] as const).map(([label, value, unit]) => (
                  <div key={label} className="flex items-center justify-between">
                    <span className="font-mono text-[8px] text-text-muted">{label}</span>
                    <span className="font-mono text-[9px] text-text-primary tabular-nums">
                      {value} <span className="text-text-muted text-[7px]">{unit}</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Bounds — only when active */}
            {stats.selectedPoints > 0 && (
              <div className="px-3 py-3 border-b border-border/30">
                <p className="font-mono text-[8px] text-text-muted tracking-widest uppercase mb-2">Bounds AABB</p>
                <div className="flex flex-col gap-1">
                  {(["X", "Y", "Z"] as const).map((axis) => {
                    const min = stats.bounds[`min${axis}` as keyof typeof stats.bounds] as number;
                    const max = stats.bounds[`max${axis}` as keyof typeof stats.bounds] as number;
                    return (
                      <div key={axis} className="flex items-center justify-between">
                        <span className="font-mono text-[8px] text-text-muted">{axis}</span>
                        <span className="font-mono text-[8px] text-cyan-400/80 tabular-nums">
                          {min.toFixed(3)} → {max.toFixed(3)} m
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* StateOp history */}
            <div className="px-3 py-3">
              <div className="flex items-center justify-between mb-2">
                <p className="font-mono text-[8px] text-text-muted tracking-widest uppercase">StateOp History</p>
                <span className="font-mono text-[7px] text-text-muted tabular-nums">{editHistory.length} ops</span>
              </div>
              {editHistory.length === 0 ? (
                <p className="font-mono text-[8px] text-text-muted italic">No ops committed</p>
              ) : (
                <div className="flex flex-col gap-1">
                  {editHistory.slice(-7).reverse().map((op) => (
                    <div key={op.id} className="flex items-start gap-1.5">
                      <ChevronRight className="h-2.5 w-2.5 text-text-muted mt-px shrink-0" />
                      <div className="flex flex-col min-w-0">
                        <span className="font-mono text-[8px] text-text-secondary truncate">{op.operation}</span>
                        <span className="font-mono text-[7px] text-text-muted">
                          {op.delta < 0 ? "" : "+"}{op.delta.toLocaleString()} pts
                          {op.textureSnap && <span className="ml-1 opacity-35">tex:{op.textureSnap.slice(0, 6)}</span>}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="shrink-0 px-3 py-2 border-t border-border/40 bg-background/40">
            <p className="font-mono text-[7px] text-text-muted tracking-wider">
              Sh Degree: 3 · Opacity: Sigmoid · Transform Tex: 4K
            </p>
          </div>
        </div>
      )}
    </aside>
  );
}

/* ─── Export Scene dropdown ─────────────────────────────────────────────────── */

function ExportDropdown({
  format, isExporting, exportStage, exportProgress,
  onSelectFormat, onTriggerExport,
  isOpen, onToggle, dropdownRef,
}: {
  format:          ExportFormat;
  isExporting:     boolean;
  exportStage:     ExportStage;
  exportProgress:  number;
  onSelectFormat:  (f: ExportFormat) => void;
  onTriggerExport: () => void;
  isOpen:          boolean;
  onToggle:        () => void;
  dropdownRef:     React.RefObject<HTMLDivElement>;
}) {
  const cfg     = EXPORT_FORMAT_CONFIG[format];
  const allFmts = (["ply", "ply-compressed", "sog"] as ExportFormat[]);

  return (
    <div ref={dropdownRef} className="relative shrink-0 flex items-center gap-1">
      {/* Primary trigger */}
      <button
        onClick={onTriggerExport}
        disabled={isExporting}
        title={`Export Scene — ${cfg.label}`}
        className={cn(
          "flex items-center gap-1.5 rounded-l border-y border-l px-2.5 py-1.5 font-mono text-[9px] tracking-wider transition-all duration-150 shrink-0",
          isExporting ? "border-border/40 bg-surface/30 text-text-muted cursor-wait" : cfg.accentClass
        )}
      >
        {isExporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : cfg.icon}
        <span className="hidden lg:inline">Export Scene</span>
        <span className="hidden xl:inline font-mono text-[7px] opacity-55 border border-current/30 rounded px-1 py-px">{cfg.ext}</span>
      </button>

      {/* Format chevron */}
      <button
        onClick={onToggle}
        disabled={isExporting}
        title="Choose export format"
        className={cn(
          "flex items-center justify-center rounded-r border px-1.5 border-l-0 py-[7px] font-mono text-[9px] transition-all duration-150",
          isOpen
            ? "border-accent/55 bg-accent/14 text-accent"
            : "border-border/40 bg-surface/30 text-text-muted hover:border-border hover:text-text-primary hover:bg-surface/60",
          isExporting && "opacity-30 cursor-not-allowed pointer-events-none"
        )}
      >
        {isOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
      </button>

      {/* Format flyout */}
      {isOpen && !isExporting && (
        <div className="absolute top-full right-0 mt-1.5 z-50 w-64 rounded-lg border border-border/60 bg-[#0a0a14]/98 backdrop-blur-xl shadow-[0_8px_40px_-8px_rgba(0,0,0,0.9)] overflow-hidden">
          <div className="px-3 py-2 border-b border-border/30 bg-surface/20">
            <p className="font-mono text-[8px] text-text-muted tracking-[0.2em] uppercase">Export Format</p>
          </div>
          {allFmts.map((fmtId) => {
            const fmtCfg  = EXPORT_FORMAT_CONFIG[fmtId];
            const isActive = format === fmtId;
            return (
              <button
                key={fmtId}
                onClick={() => { onSelectFormat(fmtId); onToggle(); }}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2.5 transition-colors text-left border-l-2",
                  isActive ? "bg-accent/10 border-l-accent" : "hover:bg-surface/40 border-l-transparent"
                )}
              >
                <div className={cn("shrink-0", isActive ? "text-accent" : "text-text-muted")}>{fmtCfg.icon}</div>
                <div className="flex flex-col min-w-0">
                  <span className={cn("font-mono text-[10px] font-medium", isActive ? "text-white" : "text-text-secondary")}>
                    {fmtCfg.label}
                  </span>
                  <span className="font-mono text-[8px] text-text-muted">{fmtCfg.sublabel}</span>
                </div>
                {isActive && <CheckCircle2 className="h-3 w-3 text-accent shrink-0 ml-auto" />}
              </button>
            );
          })}
          <div className="px-3 py-2 border-t border-border/30">
            <p className="font-mono text-[7px] text-text-muted">PlayCanvas SuperSplat v2.3 export pipeline</p>
          </div>
        </div>
      )}

      {/* Inline progress bar */}
      {(isExporting || exportStage === "done" || exportStage === "error") && (
        <div className="flex items-center gap-2 ml-1 shrink-0">
          <div className="w-20 h-1 bg-border/40 rounded-full overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-300",
                exportStage === "error" ? "bg-red-500" : exportStage === "done" ? "bg-emerald-500" : "bg-accent"
              )}
              style={{ width: `${exportProgress}%` }}
            />
          </div>
          <span className={cn(
            "font-mono text-[8px] shrink-0",
            exportStage === "error" ? "text-red-400" : exportStage === "done" ? "text-emerald-400" : "text-accent"
          )}>
            {EXPORT_STAGE_LABEL[exportStage]}
          </span>
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════════
   CLEAN-SLATE DROP ZONE OVERLAY
   Rendered when no venue is loaded and no file has been dropped yet.
   Full-canvas dark dot-grid with upload CTA.
══════════════════════════════════════════════════════════════════════════════ */

function CleanSlateOverlay({
  isDragging,
  onBrowse,
}: {
  isDragging: boolean;
  onBrowse:   () => void;
}) {
  return (
    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center overflow-hidden">
      {/* Dot-grid background */}
      <div className="absolute inset-0 bg-[#020205]" />
      <div
        className="absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage: "radial-gradient(circle, rgba(99,102,241,0.9) 1px, transparent 1px)",
          backgroundSize:  "32px 32px",
        }}
      />

      {/* Outer drag highlight ring */}
      <div className={cn(
        "absolute inset-6 rounded-2xl border-2 border-dashed transition-all duration-300",
        isDragging
          ? "border-accent/70 bg-accent/5 shadow-[inset_0_0_60px_-20px_rgba(99,102,241,0.25)]"
          : "border-[#1c1c28]"
      )} />

      {/* Center content */}
      <div className="relative flex flex-col items-center gap-7 text-center max-w-lg px-8">
        {/* Upload icon badge */}
        <div className={cn(
          "flex h-24 w-24 items-center justify-center rounded-3xl border-2 transition-all duration-300",
          isDragging
            ? "border-accent/80 bg-accent/15 shadow-[0_0_60px_-12px_rgba(99,102,241,0.7)]"
            : "border-[#1c1c28] bg-[#080812]"
        )}>
          <Upload className={cn(
            "h-10 w-10 transition-all duration-300",
            isDragging ? "text-accent scale-110" : "text-[#3a3a55]"
          )} />
        </div>

        {/* Primary label */}
        <div className="flex flex-col gap-2.5">
          <p className="font-mono text-[15px] font-semibold text-text-secondary tracking-wide leading-snug">
            Drag &amp; Drop Raw <span className="text-accent">.PLY</span> Scan File
          </p>
          <p className="font-mono text-sm text-[#3a3a55] tracking-wider">
            to Initialize SuperSplat Engine Workspace
          </p>
        </div>

        {/* Divider */}
        <div className="flex items-center gap-4 w-full max-w-xs">
          <div className="h-px flex-1 bg-[#1c1c28]" />
          <span className="font-mono text-[9px] text-[#2a2a3a] tracking-widest uppercase">or</span>
          <div className="h-px flex-1 bg-[#1c1c28]" />
        </div>

        {/* Browse button */}
        <button
          onClick={onBrowse}
          className="flex items-center gap-2 rounded-xl border border-[#1e1e2c] bg-[#0a0a14] px-5 py-2.5 font-mono text-[10px] font-medium text-text-secondary hover:border-accent/35 hover:text-accent hover:bg-accent/8 transition-all duration-200"
        >
          <FolderOpen className="h-3.5 w-3.5" />
          Browse File System
        </button>

        {/* Hint line */}
        <p className="font-mono text-[8px] text-[#2a2a3a] tracking-widest leading-relaxed">
          Supported formats: .ply · .sog · PlayCanvas-native binary streams
        </p>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════════
   VENUE LOADING OVERLAY (State A — while streaming)
══════════════════════════════════════════════════════════════════════════════ */

function VenueLoadingOverlay({ venue }: { venue: VenueProfile }) {
  return (
    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-8 bg-[#020205]/96 backdrop-blur-sm">
      {/* Dot grid */}
      <div
        className="absolute inset-0 opacity-[0.05]"
        style={{
          backgroundImage: "radial-gradient(circle, rgba(99,102,241,0.9) 1px, transparent 1px)",
          backgroundSize:  "32px 32px",
        }}
      />
      {/* Content */}
      <div className="relative flex flex-col items-center gap-5">
        <div className="relative flex h-16 w-16 items-center justify-center">
          <div className="absolute inset-0 rounded-full border-2 border-accent/20 animate-ping" />
          <Loader2 className="h-9 w-9 text-accent animate-spin" />
        </div>
        <div className="flex flex-col items-center gap-2">
          <p className="font-mono text-[13px] font-semibold text-text-secondary tracking-wide">
            Streaming Venue Asset Node
          </p>
          <p className="font-mono text-[10px] text-accent tracking-widest">
            {venue.splatUrl}
          </p>
          <p className="font-mono text-[9px] text-text-muted">
            Initializing PlayCanvas SuperSplat editing buffer…
          </p>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════════
   ENGINE CONTRACT
   Minimal interface the editor uses to call back into the 3D graphics layer.
   Keeping this local avoids a circular import from @spatial/core-3d.
══════════════════════════════════════════════════════════════════════════════ */

interface EditorEngine {
  /**
   * Clears all currently injected 3D meshes, then re-instantiates each
   * serialised asset at its stored world-space position and Euler rotation.
   * `assets` must be the `assets` / `injectedAssets` array from a
   * `SceneExportManifest` JSON file.  Only `modelUrl` is strictly required;
   * `position` and `rotation` are optional (engine stagger-places when absent).
   */
  loadSavedLayoutBuild(assets: SavedAssetRecord[]): Promise<void>;
}

/** Lifecycle state for the manifest import pipeline. */
type ManifestImportState = "idle" | "parsing" | "ok" | "error";

/* ══════════════════════════════════════════════════════════════════════════════
   EDITOR INNER — wrapped in Suspense below for useSearchParams
══════════════════════════════════════════════════════════════════════════════ */

function EditorInner() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const venueId      = searchParams.get("id") ?? searchParams.get("venue");

  /** Resolved venue profile — drives State A initialization. */
  const venue: VenueProfile | null = venues.find((v) => v.id === venueId) ?? null;

  /* ── Tool mode ─────────────────────────────────────────────────────── */
  const [editMode,     setEditMode]     = useState<EditMode>("navigate");
  const [selectSub,    setSelectSub]    = useState<SelectSubMode>("rect");
  const [transformSub, setTransformSub] = useState<TransformSubMode>("translate");

  /* ── Export ───────────────────────────────────────────────────────── */
  const [exportFormat,    setExportFormat]    = useState<ExportFormat>("ply-compressed");
  const [exportStage,     setExportStage]     = useState<ExportStage>("idle");
  const [exportProgress,  setExportProgress]  = useState(0);
  const [exportMenuOpen,  setExportMenuOpen]  = useState(false);
  const exportDropdownRef                     = useRef<HTMLDivElement>(null!);

  /* ── Panels ───────────────────────────────────────────────────────── */
  const [layersPanelOpen,    setLayersPanelOpen]    = useState(true);
  const [inspectorPanelOpen, setInspectorPanelOpen] = useState(true);
  const [gridVisible,        setGridVisible]        = useState(true);

  /* ── Scene data ───────────────────────────────────────────────────── */
  const [layers,      setLayers]      = useState<SplatLayer[]>(() => seedLayers(venueId));
  const [selStats,    setSelStats]    = useState<SelectionStats>(() => seedStats(0));
  const [editHistory, setEditHistory] = useState<StateOp[]>([]);

  /* ── Asset load state ─────────────────────────────────────────────── */
  const [assetLoadState,   setAssetLoadState]  = useState<AssetLoadState>(
    venueId ? "loading" : "idle"
  );
  const [activeAssetLabel, setActiveAssetLabel] = useState<string | null>(null);

  /* ── State B file drop ────────────────────────────────────────────── */
  const [isDragging,    setIsDragging]    = useState(false);
  const [dropLoadState, setDropLoadState] = useState<DropLoadState>("idle");
  const [dropFileName,  setDropFileName]  = useState<string | null>(null);

  /* ── Refs ─────────────────────────────────────────────────────────── */
  const canvasRef       = useRef<HTMLCanvasElement>(null);
  const fileInputRef    = useRef<HTMLInputElement>(null);
  /** Ref to the hidden JSON manifest file picker. */
  const jsonFileInputRef = useRef<HTMLInputElement>(null);
  /**
   * Live EditorEngine instance — populated when PlayCanvas SuperSplat is
   * mounted to `canvasRef`.  Guard all calls with `if (engineRef.current)`.
   */
  const engineRef = useRef<EditorEngine | null>(null);

  /* ── Manifest import state ────────────────────────────────────────── */
  const [manifestImportState, setManifestImportState] = useState<ManifestImportState>("idle");

  /* ── HUD ──────────────────────────────────────────────────────────── */
  const [cursorWorld, setCursorWorld] = useState({ x: 0, y: 0, z: 0 });
  const [fps, setFps] = useState(60);

  useEffect(() => {
    const id = setInterval(() => setFps(58 + Math.round(Math.random() * 4)), 2000);
    return () => clearInterval(id);
  }, []);

  /* ── Close export menu on outside click ──────────────────────────── */
  useEffect(() => {
    if (!exportMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (exportDropdownRef.current && !exportDropdownRef.current.contains(e.target as Node)) {
        setExportMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [exportMenuOpen]);

  /* ════════════════════════════════════════════════════════════════════
     STATE A — VENUE-CONTEXT INJECTION
     On mount (or venueId change): if a valid venue profile is matched,
     stream its splatUrl into the editing buffer.  This simulates the
     PlayCanvas SuperSplat `engine.loadScene(url)` call.
  ════════════════════════════════════════════════════════════════════ */
  useEffect(() => {
    if (!venue) {
      // No valid venue matched — stay in clean-slate (State B)
      setAssetLoadState("idle");
      return;
    }

    setAssetLoadState("loading");
    setActiveAssetLabel(null);

    // Simulate asset streaming + PlayCanvas parse time (~950 ms)
    const timer = setTimeout(() => {
      const fileName  = venue.splatUrl.split("/").pop() ?? "capture.ply";
      const estPoints = 1_847_203;

      setLayers((prev) =>
        prev.map((l) =>
          l.id === "layer-capture"
            ? { ...l, name: fileName, points: estPoints }
            : l
        )
      );
      setSelStats(seedStats(estPoints));
      setActiveAssetLabel(venue.name);
      setAssetLoadState("ready");

      setEditHistory([
        makeStateOp(`Auto-Inject: ${venue.splatUrl}`, 0),
      ]);
    }, 950);

    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [venueId]);

  /* ════════════════════════════════════════════════════════════════════
     STATE B — CLEAN-SLATE MANUAL FILE STREAM
     Accepts .ply / .sog from drag-and-drop or file input.
  ════════════════════════════════════════════════════════════════════ */
  const streamDroppedFile = useCallback(async (file: File) => {
    setAssetLoadState("loading");
    setActiveAssetLabel(null);
    setDropLoadState("reading");
    setDropFileName(file.name);

    // Phase 1: binary read simulation
    await new Promise<void>((r) => setTimeout(r, 350));
    setDropLoadState("streaming");

    // Phase 2: parse + load into canvas buffer simulation
    await new Promise<void>((r) => setTimeout(r, 750));

    const estPoints = Math.floor(1_400_000 + Math.random() * 900_000);
    setLayers((prev) =>
      prev.map((l, i) =>
        i === 0 ? { ...l, name: file.name, points: estPoints } : l
      )
    );
    setSelStats(seedStats(estPoints));
    setActiveAssetLabel(file.name.replace(/\.(ply|sog)$/i, ""));
    setAssetLoadState("ready");

    setEditHistory([makeStateOp(`Manual Drop: ${file.name}`, 0)]);

    setDropLoadState("ready");
    setTimeout(() => setDropLoadState("idle"), 2500);
  }, []);

  const handleDragOver  = useCallback((e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setIsDragging(true); }, []);
  const handleDragEnter = useCallback((e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setIsDragging(true); }, []);
  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDragging(false);
  }, []);
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    setIsDragging(false);
    const file = Array.from(e.dataTransfer.files).find(isSplatFile);
    if (file) streamDroppedFile(file);
  }, [streamDroppedFile]);
  const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) streamDroppedFile(file);
    e.target.value = "";
  }, [streamDroppedFile]);

  /* ════════════════════════════════════════════════════════════════════
     IMPORT LAYOUT MANIFEST
     Reads the selected .json file using FileReader, parses it back
     into a SceneAssetRecord array, then hands it to the engine so it
     can re-instantiate the saved layout build inside the 3D scene.
  ════════════════════════════════════════════════════════════════════ */
  const handleManifestFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      // Reset the input immediately so the same file can be re-selected
      e.target.value = "";
      if (!file) return;

      setManifestImportState("parsing");

      const reader = new FileReader();

      reader.onload = (evt) => {
        try {
          const raw = evt.target?.result;
          if (typeof raw !== "string") throw new Error("Unexpected FileReader result type");

          /* Parse the JSON payload into a clean object.
           *
           * Primary key:  `injectedAssets` — consumed directly as specified.
           * Fallback key: `assets`         — SchemaVersion 1.0 from exportEngine.ts.
           *
           * Both keys hold arrays of `SavedAssetRecord`-compatible objects
           * (only `modelUrl` is strictly required; `position`/`rotation` are
           * used by the engine when present to restore exact placement). */
          const parsedData = JSON.parse(raw) as {
            injectedAssets?: SavedAssetRecord[];
            assets?:         SavedAssetRecord[];
            [key: string]:   unknown;
          };

          const assets: SavedAssetRecord[] =
            parsedData.injectedAssets ??
            parsedData.assets ??
            [];

          if (!Array.isArray(assets)) {
            throw new Error("Manifest `injectedAssets` / `assets` field is not a valid array");
          }

          /* ── Hand the coordinate collection to the engine ───────── */
          if (engineRef.current) {
            /* Fire-and-forget — engine handles per-asset fault isolation
             * internally via Promise.allSettled. */
            engineRef.current.loadSavedLayoutBuild(parsedData.injectedAssets ?? assets);
          } else {
            console.warn(
              "[Editor] engineRef is null — manifest parsed but engine not mounted yet.",
              `(${assets.length} record(s) ready to inject when engine initialises)`
            );
          }

          setManifestImportState("ok");
          setTimeout(() => setManifestImportState("idle"), 3000);

          /* Record the operation in StateOp history for undo tracking. */
          setEditHistory((prev) => [
            ...prev,
            makeStateOp(`Import Layout Manifest (${assets.length} asset${assets.length !== 1 ? "s" : ""})`, assets.length),
          ]);

          console.log(
            `[Editor] Manifest imported successfully — ${assets.length} asset${assets.length !== 1 ? "s" : ""} loaded.`
          );
        } catch (err) {
          console.error("[Editor] Manifest import parse fault:", err);
          setManifestImportState("error");
          setTimeout(() => setManifestImportState("idle"), 3500);
        }
      };

      reader.onerror = () => {
        console.error("[Editor] FileReader encountered a read error.");
        setManifestImportState("error");
        setTimeout(() => setManifestImportState("idle"), 3500);
      };

      reader.readAsText(file);
    },
    []
  );

  /* ── Layer toggles ────────────────────────────────────────────────── */
  const toggleVisibility = useCallback((id: string) => {
    setLayers((prev) => prev.map((l) => l.id === id ? { ...l, visible: !l.visible } : l));
  }, []);
  const toggleLock = useCallback((id: string) => {
    setLayers((prev) => prev.map((l) => l.id === id ? { ...l, locked: !l.locked } : l));
  }, []);

  /* ── Select activation ───────────────────────────────────────────── */
  const activateSelect = useCallback((sub: SelectSubMode) => {
    setSelectSub(sub);
    setEditMode("select");
    setTimeout(() => {
      const selected = Math.floor(Math.random() * 180_000 + 20_000);
      setSelStats((prev) => ({
        ...prev,
        selectedPoints:  selected,
        selectionVolume: parseFloat((selected / 1_000_000 * 8.4).toFixed(3)),
        bounds: { minX: -4.2, maxX: 4.2, minY: -0.1, maxY: 5.8, minZ: -3.6, maxZ: 3.6 },
      }));
    }, 450);
  }, []);

  /* ── Transform activation ────────────────────────────────────────── */
  const activateTransform = useCallback((sub: TransformSubMode) => {
    setTransformSub(sub);
    setEditMode("transform");
  }, []);

  /* ── Prune / Delete ──────────────────────────────────────────────── */
  const handlePrune = useCallback(() => {
    if (selStats.selectedPoints === 0) return;
    const removed = selStats.selectedPoints;
    setLayers((prev) =>
      prev.map((l, i) => i === 0 ? { ...l, points: Math.max(0, l.points - removed) } : l)
    );
    setSelStats((prev) => ({
      ...prev,
      selectedPoints: 0, selectionVolume: 0,
      totalPoints: prev.totalPoints - removed,
      bounds: { minX: 0, maxX: 0, minY: 0, maxY: 0, minZ: 0, maxZ: 0 },
    }));
    setEditHistory((prev) => [...prev, makeStateOp("Prune / Delete Points", -removed)]);
    setEditMode("navigate");
  }, [selStats.selectedPoints]);

  /* ── Invert Selection ────────────────────────────────────────────── */
  const handleInvertSelection = useCallback(() => {
    if (selStats.totalPoints === 0) return;
    const inverted = selStats.totalPoints - selStats.selectedPoints;
    setSelStats((prev) => ({
      ...prev,
      selectedPoints:  inverted,
      selectionVolume: parseFloat((inverted / 1_000_000 * 8.4).toFixed(3)),
      bounds: inverted > 0
        ? { minX: -9.5, maxX: 9.5, minY: -0.1, maxY: 9.2, minZ: -8.2, maxZ: 8.2 }
        : { minX: 0, maxX: 0, minY: 0, maxY: 0, minZ: 0, maxZ: 0 },
    }));
    setEditHistory((prev) => [...prev, makeStateOp("Invert Selection", 0)]);
  }, [selStats.totalPoints, selStats.selectedPoints]);

  /* ── Reset Scene Grid Origin ─────────────────────────────────────── */
  const handleResetGridOrigin = useCallback(() => {
    setEditMode("navigate");
    setSelStats((prev) => ({
      ...prev,
      selectedPoints: 0, selectionVolume: 0,
      bounds: { minX: 0, maxX: 0, minY: 0, maxY: 0, minZ: 0, maxZ: 0 },
    }));
    setEditHistory((prev) => [...prev, makeStateOp("Reset Scene Grid Origin → Identity", 0)]);
  }, []);

  /* ── Export pipeline ─────────────────────────────────────────────── */
  const isExporting = exportStage !== "idle" && exportStage !== "done" && exportStage !== "error";

  const handleExport = useCallback(async () => {
    if (isExporting) return;
    setExportMenuOpen(false);

    const fmtCfg = EXPORT_FORMAT_CONFIG[exportFormat];
    for (const [stage, progress, delay] of fmtCfg.stages) {
      setExportStage(stage);
      setExportProgress(progress);
      if (delay > 0) await new Promise((r) => setTimeout(r, delay));
    }

    try {
      const totalPts = layers.reduce((s, l) => s + l.points, 0);
      const manifest = JSON.stringify({
        venueId,
        format:      exportFormat,
        totalPoints: totalPts,
        exportedAt:  new Date().toISOString(),
        stateOps:    editHistory.length,
      }, null, 2);

      const blob = new Blob(
        [`// VenuePlatform SuperSplat Export — ${fmtCfg.label}\n${manifest}`],
        { type: "application/octet-stream" }
      );
      const url = URL.createObjectURL(blob);
      const a   = Object.assign(document.createElement("a"), {
        href:    url,
        download: `venue-splat-${venueId ?? "scene"}-${Date.now()}${fmtCfg.ext}`,
      });
      document.body.appendChild(a);
      a.click();
      URL.revokeObjectURL(url);
      document.body.removeChild(a);

      setEditHistory((prev) => [
        ...prev,
        makeStateOp(`Export Scene (${fmtCfg.label})`, 0),
      ]);
    } catch (err) {
      console.error("[Editor] Export failed:", err);
      setExportStage("error");
      return;
    }

    setTimeout(() => { setExportStage("idle"); setExportProgress(0); }, 3000);
  }, [isExporting, exportFormat, layers, venueId, editHistory.length]);

  /* ── Exit Editor — route to calling context ──────────────────────── */
  const handleExitEditor = useCallback(() => {
    if (venueId) {
      const params = new URLSearchParams({ id: venueId });
      if (editHistory.length > 0) {
        params.set("modified", "true");
        params.set("edits", String(editHistory.length));
      }
      router.push(`/viewer?${params.toString()}`);
    } else {
      router.push("/");
    }
  }, [router, venueId, editHistory.length]);

  /* ── Keyboard shortcuts ──────────────────────────────────────────── */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      switch (e.key.toLowerCase()) {
        case "1": activateSelect("rect");         break;
        case "2": activateSelect("lasso");        break;
        case "3": activateSelect("brush");        break;
        case "4": activateSelect("sphere");       break;
        case "t": activateTransform("translate"); break;
        case "r": activateTransform("rotate");    break;
        case "s": activateTransform("scale");     break;
        case "p":
        case "delete": handlePrune();             break;
        case "i": handleInvertSelection();        break;
        case "o": handleResetGridOrigin();        break;
        case "g": setGridVisible((v) => !v);      break;
        case "escape":
          setEditMode("navigate");
          setSelStats((prev) => ({
            ...prev, selectedPoints: 0, selectionVolume: 0,
            bounds: { minX: 0, maxX: 0, minY: 0, maxY: 0, minZ: 0, maxZ: 0 },
          }));
          break;
        case "z":
          if (e.metaKey || e.ctrlKey) setEditHistory((prev) => prev.slice(0, -1));
          break;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [activateSelect, activateTransform, handlePrune, handleInvertSelection, handleResetGridOrigin]);

  /* ── Canvas mouse move ───────────────────────────────────────────── */
  const handleCanvasMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const nx   = ((e.clientX - rect.left)  / rect.width  - 0.5) * 40;
    const ny   = -((e.clientY - rect.top) / rect.height - 0.5) * 25;
    setCursorWorld({ x: parseFloat(nx.toFixed(3)), y: parseFloat(ny.toFixed(3)), z: 0 });
  }, []);

  /* ── Derived booleans ────────────────────────────────────────────── */
  const isReady       = assetLoadState === "ready";
  const isVenueLoading = !!venue && assetLoadState === "loading";
  const showCleanSlate = !venueId && assetLoadState === "idle";
  const showVenueBanner = isReady && !!venue;
  const totalPoints   = layers.reduce((s, l) => s + l.points, 0);
  const canvasCursor  = resolveCanvasCursor(editMode, selectSub, transformSub);

  /* ══════════════════════════════════════════════════════════════════════
     RENDER
  ══════════════════════════════════════════════════════════════════════ */
  return (
    <div className="flex flex-col h-screen bg-[#050508] overflow-hidden text-text-primary">

      {/* ════════════════════════════════════════════════════════════════
          HEADER
          [← Exit Editor] [Logo] [venue-id]      [status] [FPS]
      ════════════════════════════════════════════════════════════════ */}
      <header className="shrink-0 flex items-center justify-between px-3 h-11 border-b border-border/50 bg-[#08080f]/96 backdrop-blur-xl z-50">

        {/* Left */}
        <div className="flex items-center gap-3">
          {/* Exit Editor — top utility link */}
          <button
            onClick={handleExitEditor}
            title={venueId ? `Return to Viewer — ${venueId}` : "Return to Homepage"}
            className={cn(
              "flex items-center gap-2 rounded-lg border px-3 py-1.5 font-mono text-[10px] font-semibold tracking-wider transition-all duration-150 group shrink-0",
              editHistory.length > 0
                ? "border-accent/50 bg-accent/12 text-accent hover:border-accent/75 hover:bg-accent/20 shadow-[0_0_14px_-4px_rgba(99,102,241,0.35)]"
                : "border-border/50 bg-surface/30 text-text-secondary hover:border-accent/30 hover:text-accent hover:bg-accent/8"
            )}
          >
            <LogOut className="h-3.5 w-3.5 group-hover:-translate-x-0.5 transition-transform duration-150" />
            <span>Exit Editor</span>
            {editHistory.length > 0 && (
              <span className="font-mono text-[8px] opacity-60 border border-current/30 rounded px-1">
                {editHistory.length} ops
              </span>
            )}
          </button>

          <div className="h-4 w-px bg-border/60" />

          <div className="flex items-center gap-2">
            <div className="flex h-5 w-5 items-center justify-center rounded bg-accent/10 border border-accent/25">
              <Box className="h-2.5 w-2.5 text-accent" />
            </div>
            <span className="font-mono text-[11px] font-semibold text-text-primary tracking-widest uppercase">
              Venue<span className="text-accent">Platform</span>
              <span className="text-text-muted font-normal ml-2">/ SuperSplat Editor</span>
            </span>
          </div>

          {venueId && (
            <>
              <div className="h-4 w-px bg-border/60" />
              <div className="flex items-center gap-1.5">
                <div className={cn(
                  "h-1.5 w-1.5 rounded-full transition-colors",
                  isVenueLoading ? "bg-accent animate-pulse" : isReady ? "bg-emerald-400" : "bg-border"
                )} />
                <span className="font-mono text-[10px] text-text-muted">{venueId}</span>
                {venue && <span className="font-mono text-[9px] text-[#3a3a4a] hidden sm:block">· {venue.name}</span>}
              </div>
            </>
          )}
        </div>

        {/* Right — status chips */}
        <div className="flex items-center gap-2.5">
          {assetLoadState === "loading" && (
            <div className="flex items-center gap-1.5 rounded border border-accent/25 bg-accent/8 px-2 py-1">
              <Loader2 className="h-2.5 w-2.5 text-accent animate-spin shrink-0" />
              <span className="font-mono text-[9px] text-accent tracking-wider whitespace-nowrap">
                {venue ? "Streaming Venue Asset…" : "Loading…"}
              </span>
            </div>
          )}
          {assetLoadState === "ready" && activeAssetLabel && (
            <div className="flex items-center gap-1.5 rounded border border-emerald-500/30 bg-emerald-500/8 px-2 py-1">
              <PackageCheck className="h-2.5 w-2.5 text-emerald-400 shrink-0" />
              <span className="font-mono text-[9px] text-emerald-400 tracking-wider whitespace-nowrap hidden sm:block">
                {venue ? "Auto-Injected Asset Node:" : "Asset Loaded:"}&nbsp;
                <span className="font-semibold">{activeAssetLabel}</span>
              </span>
            </div>
          )}
          {assetLoadState === "error" && (
            <div className="flex items-center gap-1.5 rounded border border-red-500/30 bg-red-500/8 px-2 py-1">
              <AlertCircle className="h-2.5 w-2.5 text-red-400 shrink-0" />
              <span className="font-mono text-[9px] text-red-400">Inject fault</span>
            </div>
          )}
          {(dropLoadState === "reading" || dropLoadState === "streaming") && (
            <div className="flex items-center gap-1.5 rounded border border-cyan-400/25 bg-cyan-400/8 px-2 py-1">
              <Loader2 className="h-2.5 w-2.5 text-cyan-400 animate-spin shrink-0" />
              <span className="font-mono text-[9px] text-cyan-400 tracking-wider whitespace-nowrap">
                {dropLoadState === "reading" ? "Reading" : "Streaming"}&nbsp;
                <span className="opacity-70">{dropFileName}</span>
              </span>
            </div>
          )}
          {dropLoadState === "ready" && (
            <div className="flex items-center gap-1.5 rounded border border-cyan-400/30 bg-cyan-400/8 px-2 py-1">
              <CheckCircle2 className="h-2.5 w-2.5 text-cyan-400 shrink-0" />
              <span className="font-mono text-[9px] text-cyan-400">Drop streamed ✓</span>
            </div>
          )}

          {/* Manifest import status chip */}
          {manifestImportState === "parsing" && (
            <div className="flex items-center gap-1.5 rounded border border-amber-500/30 bg-amber-500/8 px-2 py-1">
              <Loader2 className="h-2.5 w-2.5 text-amber-400 animate-spin shrink-0" />
              <span className="font-mono text-[9px] text-amber-400 tracking-wider whitespace-nowrap">
                Parsing manifest…
              </span>
            </div>
          )}
          {manifestImportState === "ok" && (
            <div className="flex items-center gap-1.5 rounded border border-emerald-500/30 bg-emerald-500/8 px-2 py-1">
              <CheckCircle2 className="h-2.5 w-2.5 text-emerald-400 shrink-0" />
              <span className="font-mono text-[9px] text-emerald-400 tracking-wider whitespace-nowrap">
                Layout manifest loaded ✓
              </span>
            </div>
          )}
          {manifestImportState === "error" && (
            <div className="flex items-center gap-1.5 rounded border border-red-500/30 bg-red-500/8 px-2 py-1">
              <AlertCircle className="h-2.5 w-2.5 text-red-400 shrink-0" />
              <span className="font-mono text-[9px] text-red-400 whitespace-nowrap">
                Manifest parse fault
              </span>
            </div>
          )}

          {editHistory.length > 0 && (
            <div className="flex items-center gap-1.5 rounded border border-amber-400/25 bg-amber-400/8 px-2 py-1">
              <div className="h-1.5 w-1.5 rounded-full bg-amber-400" />
              <span className="font-mono text-[9px] text-amber-400 tracking-wider">
                {editHistory.length} unsaved op{editHistory.length !== 1 ? "s" : ""}
              </span>
            </div>
          )}
          <div className="h-3 w-px bg-border/50" />
          <div className="flex items-center gap-1.5">
            <Cpu className="h-3 w-3 text-text-muted" />
            <span className="font-mono text-[9px] text-text-muted hidden md:block">PlayCanvas SuperSplat v2.3</span>
          </div>
          <div className="h-3 w-px bg-border/50" />
          <div className="flex items-center gap-1.5">
            <Activity className="h-3 w-3 text-emerald-400/70" />
            <span className="font-mono text-[10px] text-emerald-400/80 tabular-nums">{fps} FPS</span>
          </div>
        </div>
      </header>

      {/* ════════════════════════════════════════════════════════════════
          TOOLBELT — Full SuperSplat Tool Suite
          SELECT (Rect|Lasso|Brush|Sphere) · TRANSFORM (Translate|Rotate|Scale)
          · OPTIMIZE (Prune|Delete|Invert|Reset) · HISTORY · EXPORT SCENE ▼
      ════════════════════════════════════════════════════════════════ */}
      <div className="shrink-0 flex items-center gap-1.5 px-3 h-11 border-b border-border/40 bg-[#060610]/85 z-40 overflow-x-auto scrollbar-none">

        {/* ── Selection Toolbelt ────────────────────────────────────── */}
        <GroupLabel>Select</GroupLabel>

        <ToolBtn
          icon={<Square    className="h-3.5 w-3.5" />}
          label="Rect"   shortcut="1"
          active={editMode === "select" && selectSub === "rect"}
          onClick={() => activateSelect("rect")}
        />
        <ToolBtn
          icon={<Lasso     className="h-3.5 w-3.5" />}
          label="Lasso"  shortcut="2"
          active={editMode === "select" && selectSub === "lasso"}
          onClick={() => activateSelect("lasso")}
        />
        <ToolBtn
          icon={<Circle    className="h-3.5 w-3.5" />}
          label="Brush"  shortcut="3"
          active={editMode === "select" && selectSub === "brush"}
          onClick={() => activateSelect("brush")}
        />
        <ToolBtn
          icon={<Globe     className="h-3.5 w-3.5" />}
          label="Sphere" shortcut="4"
          active={editMode === "select" && selectSub === "sphere"}
          onClick={() => activateSelect("sphere")}
        />

        <ToolDivider />

        {/* ── Transform Gizmos ──────────────────────────────────────── */}
        <GroupLabel>Transform</GroupLabel>

        <ToolBtn
          icon={<Move      className="h-3.5 w-3.5" />}
          label="Translate" shortcut="T"
          active={editMode === "transform" && transformSub === "translate"}
          onClick={() => activateTransform("translate")}
        />
        <ToolBtn
          icon={<RotateCw  className="h-3.5 w-3.5" />}
          label="Rotate"    shortcut="R"
          active={editMode === "transform" && transformSub === "rotate"}
          onClick={() => activateTransform("rotate")}
        />
        <ToolBtn
          icon={<Maximize2 className="h-3.5 w-3.5" />}
          label="Scale"     shortcut="S"
          active={editMode === "transform" && transformSub === "scale"}
          onClick={() => activateTransform("scale")}
        />

        <ToolDivider />

        {/* ── Optimization Pipeline ─────────────────────────────────── */}
        <GroupLabel>Optimize</GroupLabel>

        <ToolBtn
          icon={<Scissors        className="h-3.5 w-3.5" />}
          label="Prune" shortcut="P"
          danger={selStats.selectedPoints > 0}
          disabled={selStats.selectedPoints === 0}
          onClick={handlePrune}
        />
        <ToolBtn
          icon={<Trash2          className="h-3.5 w-3.5" />}
          label="Delete" shortcut="Del"
          danger={selStats.selectedPoints > 0}
          disabled={selStats.selectedPoints === 0}
          onClick={handlePrune}
        />
        <ToolBtn
          icon={<FlipHorizontal2 className="h-3.5 w-3.5" />}
          label="Invert" shortcut="I"
          disabled={selStats.totalPoints === 0}
          onClick={handleInvertSelection}
        />
        <ToolBtn
          icon={<Grid3x3         className="h-3.5 w-3.5" />}
          label="Reset Grid" shortcut="O"
          onClick={handleResetGridOrigin}
        />

        <ToolDivider />

        {/* ── History / View ────────────────────────────────────────── */}
        <ToolBtn
          icon={<Undo2     className="h-3.5 w-3.5" />}
          label="Undo" shortcut="⌘Z"
          disabled={editHistory.length === 0}
          onClick={() => setEditHistory((prev) => prev.slice(0, -1))}
        />
        <ToolBtn
          icon={<ZoomIn    className="h-3.5 w-3.5" />}
          label="Zoom Fit" shortcut="F"
          onClick={() => canvasRef.current?.requestFullscreen?.()}
        />
        <ToolBtn
          icon={<RotateCcw className="h-3.5 w-3.5" />}
          label={gridVisible ? "Hide Grid" : "Show Grid"} shortcut="G"
          active={gridVisible}
          onClick={() => setGridVisible((v) => !v)}
        />

        <ToolDivider />

        {/* ── Export Matrix ─────────────────────────────────────────── */}
        <ExportDropdown
          format={exportFormat}
          isExporting={isExporting}
          exportStage={exportStage}
          exportProgress={exportProgress}
          onSelectFormat={setExportFormat}
          onTriggerExport={handleExport}
          isOpen={exportMenuOpen}
          onToggle={() => setExportMenuOpen((v) => !v)}
          dropdownRef={exportDropdownRef}
        />

        {/* ── Import Layout Manifest (.json) ──────────────────────────
             Reads a previously exported venue-layout-manifest JSON,
             parses the injectedAssets array, and re-instantiates the
             saved build inside the active PlayCanvas scene via
             engineRef.current.loadSavedLayoutBuild(assets).              */}
        <button
          onClick={() => jsonFileInputRef.current?.click()}
          disabled={manifestImportState === "parsing"}
          title="Import Layout Manifest (.json) — restore a previously exported asset build"
          className={cn(
            "flex items-center gap-1.5 rounded border px-2.5 py-1.5 font-mono text-[9px] tracking-wider transition-all duration-150 shrink-0",
            manifestImportState === "parsing"
              ? "border-amber-500/40 bg-amber-500/10 text-amber-400 cursor-wait"
              : manifestImportState === "ok"
              ? "border-emerald-500/45 bg-emerald-500/10 text-emerald-400"
              : manifestImportState === "error"
              ? "border-red-500/40 bg-red-500/10 text-red-400"
              : "border-amber-600/40 bg-amber-600/8 text-amber-400 hover:border-amber-500/65 hover:bg-amber-500/15"
          )}
        >
          {manifestImportState === "parsing" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : manifestImportState === "ok" ? (
            <CheckCircle2 className="h-3.5 w-3.5" />
          ) : manifestImportState === "error" ? (
            <AlertCircle className="h-3.5 w-3.5" />
          ) : (
            <FileJson className="h-3.5 w-3.5" />
          )}
          <span className="hidden lg:inline">
            {manifestImportState === "parsing" ? "Parsing…"        :
             manifestImportState === "ok"      ? "Manifest Loaded"  :
             manifestImportState === "error"   ? "Parse Fault"      :
             "Import Layout Manifest"}
          </span>
          {manifestImportState === "idle" && (
            <span className="hidden xl:inline font-mono text-[7px] opacity-55 border border-current/30 rounded px-1 py-px">
              .json
            </span>
          )}
        </button>

        <ToolDivider />

        {/* Open File (Option B) */}
        <button
          onClick={() => fileInputRef.current?.click()}
          title="Open .ply or .sog from disk"
          className="flex items-center gap-1.5 rounded border border-border/40 bg-surface/30 text-text-secondary hover:border-border hover:text-text-primary hover:bg-surface/60 px-2.5 py-1.5 font-mono text-[9px] tracking-wider transition-all duration-150 shrink-0"
        >
          <Upload className="h-3.5 w-3.5" />
          <span className="hidden lg:inline">Open File</span>
          <span className="hidden xl:inline font-mono text-[7px] text-text-muted border border-border/30 rounded px-1 py-px">.ply / .sog</span>
        </button>
      </div>

      {/* ════════════════════════════════════════════════════════════════
          MAIN AREA — Layers | Canvas | Inspector
      ════════════════════════════════════════════════════════════════ */}
      <div className="flex flex-1 overflow-hidden">

        <LayersPanel
          layers={layers}
          isOpen={layersPanelOpen}
          onToggle={() => setLayersPanelOpen((v) => !v)}
          onVisibilityToggle={toggleVisibility}
          onLockToggle={toggleLock}
        />

        {/* ── Canvas viewport ────────────────────────────────────── */}
        <div
          className="relative flex-1 overflow-hidden bg-[#030306]"
          onDragOver={handleDragOver}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {/* ── Splat file picker (.ply / .sog) ─────────────────── */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".ply,.sog"
            className="hidden"
            onChange={handleFileInputChange}
          />

          {/* ── JSON manifest picker (.json) ──────────────────────
               Wired to the 'Import Layout Manifest' toolbar button.
               FileReader parses the payload, engine re-instantiates
               the saved asset build via loadSavedLayoutBuild().      */}
          <input
            ref={jsonFileInputRef}
            type="file"
            accept=".json"
            className="hidden"
            onChange={handleManifestFileChange}
          />

          {/* ── STATE B: Clean-Slate Drop Zone overlay ────────── */}
          {showCleanSlate && (
            <CleanSlateOverlay
              isDragging={isDragging}
              onBrowse={() => fileInputRef.current?.click()}
            />
          )}

          {/* ── STATE A: Venue asset streaming overlay ────────── */}
          {isVenueLoading && <VenueLoadingOverlay venue={venue!} />}

          {/* ── File drop drag highlight (when workspace is live) */}
          {isReady && isDragging && (
            <div className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-[#030306]/90 backdrop-blur-sm border-2 border-dashed border-accent/60 pointer-events-none">
              <Upload className="h-12 w-12 text-accent animate-bounce" />
              <p className="font-mono text-sm font-semibold text-accent tracking-widest uppercase">
                Drop .ply / .sog to reload workspace
              </p>
            </div>
          )}

          {/* File stream banner (when workspace is live and file is being streamed) */}
          {isReady && (dropLoadState === "reading" || dropLoadState === "streaming") && (
            <div className="absolute top-0 inset-x-0 z-40 flex items-center justify-center gap-2 py-1.5 bg-cyan-500/10 border-b border-cyan-400/25">
              <Loader2 className="h-3 w-3 text-cyan-400 animate-spin shrink-0" />
              <span className="font-mono text-[10px] text-cyan-400 tracking-widest">
                {dropLoadState === "reading" ? "Reading binary" : "Injecting into canvas loop"} — {dropFileName}
              </span>
            </div>
          )}

          {/*
            ┌─────────────────────────────────────────────────────────────┐
            │  ABSOLUTE-POSITIONED HTML5 CANVAS                           │
            │  PlayCanvas SuperSplat engine mount point.                  │
            │                                                             │
            │  data-ss-context         → "splat-editor"                   │
            │  data-ss-history-enabled → activates StateOp tracking       │
            │  data-ss-select-mode     → drives lasso/brush/sphere loops  │
            │  data-ss-transform-mode  → drives gizmo sub-system          │
            │  data-ss-lasso-loop      → "active" during freehand draw    │
            │  data-ss-grid-visible    → world-grid overlay toggle        │
            └─────────────────────────────────────────────────────────────┘
          */}
          <canvas
            ref={canvasRef}
            onMouseMove={handleCanvasMouseMove}
            className="absolute inset-0 w-full h-full block"
            data-ss-context="splat-editor"
            data-ss-history-enabled="true"
            data-ss-select-mode={selectSub}
            data-ss-transform-mode={transformSub}
            data-ss-lasso-loop={editMode === "select" && selectSub === "lasso" ? "active" : "idle"}
            data-ss-grid-visible={String(gridVisible)}
            style={{ touchAction: "none", cursor: isReady ? canvasCursor : "default" }}
          />

          {/* ── STATE A: Venue Track Banner ────────────────────── */}
          {showVenueBanner && (
            <div className="absolute top-0 inset-x-0 z-30 flex items-center gap-3 px-4 py-2 bg-[#09090f]/92 border-b border-accent/15 backdrop-blur-sm">
              <div className="h-2 w-2 rounded-full bg-accent shadow-[0_0_6px_rgba(99,102,241,0.8)] shrink-0" />
              <span className="font-mono text-[11px] text-text-secondary tracking-wider">
                Editing Environment Track:{" "}
                <span className="text-accent font-semibold">{venue!.name}</span>
              </span>
              <span className="font-mono text-[9px] text-[#3a3a4a]">
                · {venue!.splatUrl.split("/").pop()}
              </span>
              <div className="ml-auto flex items-center gap-3">
                <span className="font-mono text-[8px] text-[#3a3a4a] tabular-nums">
                  {layers[0]?.points.toLocaleString() ?? "0"} pts loaded
                </span>
                <PackageSearch className="h-3 w-3 text-accent/50" />
              </div>
            </div>
          )}

          {/* Reference grid overlay */}
          {gridVisible && isReady && (
            <div
              className="absolute inset-0 pointer-events-none opacity-[0.07]"
              style={{
                backgroundImage:
                  "linear-gradient(rgba(99,102,241,1) 1px, transparent 1px), linear-gradient(90deg, rgba(99,102,241,1) 1px, transparent 1px)",
                backgroundSize: "48px 48px",
              }}
            />
          )}

          {gridVisible && isReady && (
            <div
              className="absolute inset-x-0 pointer-events-none"
              style={{ top: "50%", height: "1px", background: "rgba(99,102,241,0.2)" }}
            />
          )}

          {/* Lasso selection loop indicator */}
          {isReady && editMode === "select" && selectSub === "lasso" && (
            <div className="absolute inset-8 pointer-events-none rounded border-2 border-dashed border-accent/22 animate-pulse" />
          )}

          {/* Sphere selection pulse ring */}
          {isReady && editMode === "select" && selectSub === "sphere" && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="h-32 w-32 rounded-full border border-dashed border-accent/20 animate-pulse" />
            </div>
          )}

          {/* Depth vignette */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{ background: "radial-gradient(ellipse 80% 70% at 50% 50%, rgba(6,6,20,0) 40%, rgba(3,3,6,0.85) 100%)" }}
          />

          {/* ── HUD OVERLAYS ──────────────────────────────────── */}

          {/* Top-left: mode + point count */}
          {isReady && (
            <div className={cn(
              "absolute left-4 z-20 flex flex-col gap-1.5 pointer-events-none transition-all",
              showVenueBanner ? "top-12" : "top-4"
            )}>
              <div className="flex items-center gap-2">
                <span className="relative flex h-2 w-2">
                  <span className={cn(
                    "animate-ping absolute inline-flex h-full w-full rounded-full opacity-75",
                    editMode !== "navigate" ? "bg-accent" : "bg-emerald-400"
                  )} />
                  <span className={cn(
                    "relative inline-flex rounded-full h-2 w-2",
                    editMode !== "navigate" ? "bg-accent" : "bg-emerald-400"
                  )} />
                </span>
                <span className="font-mono text-[10px] text-text-muted tracking-widest uppercase">
                  {editMode === "navigate"  && "NAVIGATE"}
                  {editMode === "select"    && `SELECT · ${selectSub.toUpperCase()}`}
                  {editMode === "transform" && `${transformSub.toUpperCase()} GIZMO`}
                  {editMode === "prune"     && "PRUNE / DELETE"}
                </span>
              </div>
              <div className="flex items-center gap-2 pl-4">
                <Hash className="h-2.5 w-2.5 text-text-muted" />
                <span className="font-mono text-[9px] text-text-muted">{totalPoints.toLocaleString()} total pts</span>
              </div>
              {selStats.selectedPoints > 0 && (
                <div className="flex items-center gap-2 pl-4">
                  <Scan className="h-2.5 w-2.5 text-accent" />
                  <span className="font-mono text-[9px] text-accent">
                    {selStats.selectedPoints.toLocaleString()} selected
                    ({((selStats.selectedPoints / selStats.totalPoints) * 100).toFixed(1)}%)
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Top-right: render diagnostics */}
          {isReady && (
            <div className={cn(
              "absolute right-4 z-20 flex flex-col items-end gap-1.5 pointer-events-none",
              showVenueBanner ? "top-12" : "top-4"
            )}>
              <span className="font-mono text-[9px] text-text-muted tracking-widest">WebGL2 · 3DGS Rasteriser</span>
              <span className="font-mono text-[9px] text-emerald-400/80 tracking-widest">● LIVE · {fps} FPS</span>
              <span className="font-mono text-[8px] text-[#2a2a3a]">StateOps: {editHistory.length} · TransformTex: 4K</span>
            </div>
          )}

          {/* Bottom-left: world cursor */}
          {isReady && (
            <div className="absolute bottom-4 left-4 z-20 pointer-events-none">
              <div className="flex items-center gap-3">
                {(["x", "y", "z"] as const).map((axis) => (
                  <div key={axis} className="flex items-center gap-1">
                    <span className="font-mono text-[8px] text-text-muted uppercase">{axis}:</span>
                    <span className="font-mono text-[9px] text-cyan-400/80 tabular-nums w-16">
                      {cursorWorld[axis].toFixed(3)}m
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Bottom-right: keyboard reference */}
          {isReady && (
            <div className="absolute bottom-4 right-4 z-20 flex flex-col items-end gap-1 pointer-events-none">
              {([
                ["1-4", "Select Mode"],
                ["T/R/S", "Transform"],
                ["P", "Prune"],
                ["I", "Invert"],
                ["O", "Reset Grid"],
                ["Esc", "Navigate"],
              ] as const).map(([key, label]) => (
                <div key={key} className="flex items-center gap-1.5">
                  <kbd className="font-mono text-[7px] border border-border/40 rounded px-1 py-px text-text-muted">{key}</kbd>
                  <span className="font-mono text-[8px] text-text-muted">{label}</span>
                </div>
              ))}
            </div>
          )}

          {/* Selection marquee hint */}
          {selStats.selectedPoints > 0 && (
            <div className="absolute inset-0 pointer-events-none border-2 border-accent/16 m-10 rounded" />
          )}

          {/* Engine placeholder — visible only when workspace is live but canvas is unattached */}
          {isReady && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0">
              <div className="flex flex-col items-center gap-4 opacity-[0.05]">
                <Radio className="h-14 w-14 text-accent" />
                <p className="font-mono text-xs text-text-muted tracking-widest uppercase">
                  PlayCanvas SuperSplat Engine Context
                </p>
              </div>
            </div>
          )}
        </div>

        <InspectorPanel
          stats={selStats}
          editHistory={editHistory}
          isOpen={inspectorPanelOpen}
          onToggle={() => setInspectorPanelOpen((v) => !v)}
        />
      </div>

      {/* ════════════════════════════════════════════════════════════════
          FOOTER STATUS BAR
      ════════════════════════════════════════════════════════════════ */}
      <footer className="shrink-0 flex items-center justify-between px-4 h-7 border-t border-border/30 bg-[#080810]/70 z-40">
        <div className="flex items-center gap-4">
          <span className="font-mono text-[8px] text-text-muted tracking-widest uppercase">
            3DGS Editor · Sh Degree 3 · Export: {EXPORT_FORMAT_CONFIG[exportFormat].label}
          </span>
          {editHistory.length > 0 && (
            <span className="font-mono text-[8px] text-amber-400/70">
              {editHistory.length} StateOp{editHistory.length !== 1 ? "s" : ""} · unsaved
            </span>
          )}
        </div>
        <div className="flex items-center gap-4">
          <span className="font-mono text-[8px] text-text-muted tabular-nums">{totalPoints.toLocaleString()} pts</span>
          <button
            onClick={handleExitEditor}
            className="flex items-center gap-1 text-text-muted hover:text-accent font-mono text-[8px] tracking-wider transition-colors"
          >
            <ChevronLeft className="h-3 w-3" />
            {venueId ? "Return to Viewer" : "Return to Home"}
            {editHistory.length > 0 && (
              <span className="ml-1 text-accent">
                · {editHistory.length} op{editHistory.length !== 1 ? "s" : ""} forwarded
              </span>
            )}
          </button>
        </div>
      </footer>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════════
   PAGE EXPORT — Suspense boundary for useSearchParams
══════════════════════════════════════════════════════════════════════════════ */

export default function EditorPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen items-center justify-center bg-[#050508]">
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="h-8 w-8 text-accent animate-spin" />
            <p className="font-mono text-xs text-text-muted tracking-widest uppercase">
              Initialising SuperSplat Editor…
            </p>
          </div>
        </div>
      }
    >
      <EditorInner />
    </Suspense>
  );
}
