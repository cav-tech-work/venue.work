"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { LegalManifestPortal } from "@/components/viewer/LegalManifestPortal";
import { AssetLibraryPanel } from "@/components/viewer/AssetLibraryPanel";
import { BookingCalendar } from "@/components/viewer/BookingCalendar";
import { executeSceneExport, type SceneAssetRecord } from "@/utils/exportEngine";
import type {
  SplatEngine,
  InteractionMode,
  SpatialMeasurement,
  SpatialMidpoint,
} from "@venue/core-3d";
import {
  Box,
  ChevronLeft,
  ScanLine,
  Radio,
  Activity,
  Download,
  PanelRightClose,
  PanelRightOpen,
  Ruler,
  Crosshair,
  Layers,
  Cpu,
  Wifi,
  Clock,
  Hash,
  Tag,
  BarChart2,
  Copy,
  CheckCheck,
  FileText,
  ClipboardCheck,
  ArrowRight,
  Loader2,
  AlertCircle,
  Compass,
  LayoutGrid,
  FolderDown,
  ImageDown,
  FileJson,
} from "lucide-react";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { venues, type VenueProfile } from "@/data/venues";

function cn(...inputs: Parameters<typeof clsx>): string {
  return twMerge(clsx(inputs));
}

/* ─── Types ──────────────────────────────────────────────────────────── */

interface TelemetryEntry {
  id: string;
  /** Human-readable zone label (e.g. "Stage Apron Width"). */
  label: string;
  /** Spatial zone category. */
  zone: string;
  /** Computed measurement in metres (raw float for export precision). */
  valueMeters: number;
  /** ISO timestamp of when this measurement was captured. */
  capturedAt: string;
  /** Confidence score from 0–1 returned by the reconstruction pipeline. */
  confidence: number;
}

interface CalibrationMatrix {
  exportedAt: string;
  venueId: string;
  venueName: string;
  scanResolution: string;
  entries: TelemetryEntry[];
}

/* ─── Seed telemetry data ────────────────────────────────────────────── */

function seedTelemetry(venueId: string): TelemetryEntry[] {
  /** Deterministic pseudo-random float seeded by string + index. */
  const pseudo = (seed: string, i: number): number =>
    parseFloat(
      (((seed.charCodeAt(i % seed.length) * 9301 + 49297) % 233280) / 233280).toFixed(4)
    );

  const definitions: Array<{ label: string; zone: string; base: number }> = [
    { label: "Stage Apron Width",           zone: "Stage",       base: 24.4  },
    { label: "Stage Depth (Front)",          zone: "Stage",       base: 18.2  },
    { label: "FOH Mix Position Offset",      zone: "Audio",       base: 42.8  },
    { label: "Main PA Hang Height",          zone: "Audio",       base: 11.6  },
    { label: "Downstage Sightline Clear.",   zone: "Sightlines",  base: 6.35  },
    { label: "Upper Tier Eye-Level Offset",  zone: "Sightlines",  base: 9.1   },
    { label: "Primary Egress Width (N)",     zone: "Egress",      base: 4.8   },
    { label: "Primary Egress Width (S)",     zone: "Egress",      base: 4.75  },
    { label: "Emergency Exit Corridor W.",   zone: "Egress",      base: 2.4   },
    { label: "Rigging Grid Height",          zone: "Rigging",     base: 16.9  },
    { label: "Truss Span (Centre Bay)",      zone: "Rigging",     base: 22.0  },
    { label: "Catwalks Clearance Height",    zone: "Rigging",     base: 3.2   },
    { label: "Loading Dock Door Height",     zone: "Production",  base: 5.5   },
    { label: "Production Village Width",     zone: "Production",  base: 31.4  },
    { label: "Generator Bay Depth",          zone: "Production",  base: 8.1   },
    { label: "VIP Terrace Width",            zone: "Hospitality", base: 14.6  },
    { label: "Backstage Corridor Length",    zone: "Backstage",   base: 38.9  },
    { label: "Dressing Room Block Span",     zone: "Backstage",   base: 19.3  },
    { label: "Pit Barrier Setback",          zone: "Crowd",       base: 3.0   },
    { label: "General Admission Floor Area", zone: "Crowd",       base: 1420.0 },
  ];

  const base = new Date("2026-06-01T22:00:00Z");

  return definitions.map((def, i) => ({
    id: `${venueId}-M${String(i + 1).padStart(3, "0")}`,
    label: def.label,
    zone: def.zone,
    valueMeters: parseFloat((def.base + pseudo(venueId, i) * 0.8 - 0.4).toFixed(3)),
    capturedAt: new Date(base.getTime() + i * 93_000).toISOString(),
    confidence: parseFloat((0.91 + pseudo(venueId, i + 7) * 0.08).toFixed(3)),
  }));
}

/* ─── Confidence colour helper ───────────────────────────────────────── */

function confidenceColor(score: number): string {
  if (score >= 0.97) return "text-emerald-400";
  if (score >= 0.93) return "text-cyan-400";
  if (score >= 0.88) return "text-amber-400";
  return "text-red-400";
}

/* ─── Sub-components ─────────────────────────────────────────────────── */

/** Floating HUD overlay positioned over the 3D canvas. */
function CanvasHUD({
  venue,
  isScanning,
}: {
  venue: VenueProfile | null;
  isScanning: boolean;
}) {
  return (
    <>
      {/* Top-left identity — fully transparent to mouse: pointer-events-none select-none */}
      <div className="absolute top-4 left-4 z-20 flex flex-col gap-1.5 pointer-events-none select-none">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span
              className={cn(
                "animate-ping absolute inline-flex h-full w-full rounded-full opacity-75",
                isScanning ? "bg-emerald-400" : "bg-accent"
              )}
            />
            <span
              className={cn(
                "relative inline-flex rounded-full h-2 w-2",
                isScanning ? "bg-emerald-400" : "bg-accent"
              )}
            />
          </span>
          <span className="font-mono text-[10px] text-text-muted tracking-widest uppercase">
            {isScanning ? "SCANNING · LIVE" : "ENGINE READY"}
          </span>
        </div>
        {venue && (
          <p className="font-mono text-[10px] text-text-muted tracking-wider pl-4">
            {venue.name} · {venue.area}
          </p>
        )}
      </div>

      {/* Top-right diagnostics — fully transparent to mouse */}
      <div className="absolute top-4 right-4 z-20 flex flex-col items-end gap-1.5 pointer-events-none select-none">
        <span className="font-mono text-[10px] text-text-muted tracking-widest uppercase">
          RES 8192×4096 · LiDAR 320Hz
        </span>
        <span className="font-mono text-[10px] tracking-widest uppercase">
          {isScanning ? (
            <span className="text-emerald-400 animate-flicker">● REC · Δ 0.003mm</span>
          ) : (
            <span className="text-text-muted">● STANDBY · Δ 0.000mm</span>
          )}
        </span>
      </div>

      {/* Bottom-left telemetry readout — fully transparent to mouse */}
      <div className="absolute bottom-4 left-4 z-20 flex flex-col gap-1 pointer-events-none select-none">
        {[
          { label: "PIPELINE",  value: "WebGL2 → PlayCanvas v2.3" },
          { label: "MODE",      value: "3DGS Gaussian Splat Render" },
          { label: "ORBIT",     value: "DRAG · SCROLL to navigate" },
        ].map(({ label, value }) => (
          <div key={label} className="flex items-center gap-2">
            <span className="font-mono text-[9px] text-text-muted tracking-widest w-16 shrink-0">
              {label}
            </span>
            <span className="font-mono text-[9px] text-text-secondary">{value}</span>
          </div>
        ))}
      </div>

      {/* Bottom-right FPS mock — fully transparent to mouse */}
      <div className="absolute bottom-4 right-4 z-20 flex items-center gap-2 pointer-events-none select-none">
        <Activity className="h-3 w-3 text-accent/60" />
        <span className="font-mono text-[10px] text-accent/80 tracking-widest">
          {isScanning ? "58 FPS" : "60 FPS"}
        </span>
      </div>
    </>
  );
}

/** Telemetry ledger row */
function LedgerRow({ entry, index }: { entry: TelemetryEntry; index: number }) {
  return (
    <div
      className={cn(
        "group grid grid-cols-[auto_1fr_auto] gap-x-3 items-start px-4 py-3 border-b border-border/30 hover:bg-surface/60 transition-colors duration-150",
        index % 2 === 0 ? "bg-background/20" : "bg-transparent"
      )}
    >
      {/* Measurement ID */}
      <div className="flex flex-col gap-0.5 min-w-0">
        <div className="flex items-center gap-1.5">
          <Hash className="h-2.5 w-2.5 text-text-muted shrink-0" />
          <span className="font-mono text-[9px] text-text-muted tracking-wider truncate">
            {entry.id.split("-").pop()}
          </span>
        </div>
        <span
          className={cn(
            "font-mono text-[8px] tracking-widest uppercase px-1.5 py-0.5 rounded border w-fit",
            "bg-accent/8 border-accent/20 text-accent/70"
          )}
        >
          {entry.zone}
        </span>
      </div>

      {/* Label */}
      <div className="flex flex-col gap-0.5 min-w-0">
        <div className="flex items-center gap-1">
          <Tag className="h-2.5 w-2.5 text-text-muted shrink-0" />
          <span className="text-xs text-text-secondary group-hover:text-text-primary transition-colors leading-snug truncate">
            {entry.label}
          </span>
        </div>
        <span className="font-mono text-[9px] text-text-muted pl-3.5">
          conf: <span className={confidenceColor(entry.confidence)}>{(entry.confidence * 100).toFixed(1)}%</span>
        </span>
      </div>

      {/* Value */}
      <div className="flex flex-col items-end gap-0.5 shrink-0">
        <div className="flex items-center gap-1">
          <Ruler className="h-2.5 w-2.5 text-cyan-400/60" />
          <span className="font-mono text-xs font-semibold text-cyan-400 tabular-nums">
            {entry.valueMeters.toFixed(3)}
          </span>
        </div>
        <span className="font-mono text-[9px] text-text-muted">m</span>
      </div>
    </div>
  );
}

/** Industrial Telemetry Ledger sidebar panel. */
function TelemetryLedger({
  venue,
  venueId,
  venueName,
  entries,
  isOpen,
  onToggle,
  selectedBookingDate,
  onSelectBookingDate,
}: {
  venue: VenueProfile | null;
  venueId: string;
  venueName: string;
  entries: TelemetryEntry[];
  isOpen: boolean;
  onToggle: () => void;
  /** ISO date string shared with the parent page → pre-fills LegalManifestPortal. */
  selectedBookingDate: string;
  onSelectBookingDate: (date: string) => void;
}) {
  const [copied, setCopied] = useState(false);

  const handleExport = useCallback(() => {
    const payload: CalibrationMatrix = {
      exportedAt: new Date().toISOString(),
      venueId,
      venueName,
      scanResolution: "8192x4096 @ 0.1mm",
      entries,
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `calibration-matrix_${venueId}_${Date.now()}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }, [venueId, venueName, entries]);

  const handleCopyJson = useCallback(async () => {
    const payload: CalibrationMatrix = {
      exportedAt: new Date().toISOString(),
      venueId,
      venueName,
      scanResolution: "8192x4096 @ 0.1mm",
      entries,
    };
    await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [venueId, venueName, entries]);

  return (
    <aside
      className={cn(
        "relative flex flex-col border-l border-border/60 bg-surface/80 backdrop-blur-sm transition-all duration-300 ease-in-out shrink-0",
        isOpen ? "w-80 xl:w-96" : "w-10"
      )}
    >
      {/* Toggle tab */}
      <button
        onClick={onToggle}
        className="absolute -left-3.5 top-6 z-30 flex h-7 w-7 items-center justify-center rounded-full border border-border bg-surface hover:border-accent/40 hover:bg-card transition-colors shadow-lg"
        title={isOpen ? "Collapse ledger" : "Expand ledger"}
      >
        {isOpen ? (
          <PanelRightClose className="h-3.5 w-3.5 text-text-muted" />
        ) : (
          <PanelRightOpen className="h-3.5 w-3.5 text-text-muted" />
        )}
      </button>

      {/* Collapsed state label */}
      {!isOpen && (
        <div className="flex flex-1 items-center justify-center">
          <span
            className="font-mono text-[9px] text-text-muted tracking-[0.2em] uppercase"
            style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
          >
            Telemetry Ledger
          </span>
        </div>
      )}

      {/* Expanded panel content */}
      {isOpen && (
        <div className="flex flex-col h-full overflow-hidden">

          {/* ── Panel header ─────────────────────────────────────────── */}
          <div className="shrink-0 px-4 py-3.5 border-b border-border/50">
            <div className="flex items-center gap-2 mb-1">
              <BarChart2 className="h-3.5 w-3.5 text-accent" />
              <h2 className="font-mono text-[11px] font-semibold text-text-primary tracking-widest uppercase">
                Industrial Telemetry Ledger
              </h2>
            </div>
            <p className="font-mono text-[9px] text-text-muted tracking-wider">
              {entries.length} measurements · {venueName}
            </p>
          </div>

          {/* ── Column labels ─────────────────────────────────────────── */}
          <div className="shrink-0 grid grid-cols-[auto_1fr_auto] gap-x-3 px-4 py-2 border-b border-border/40 bg-background/40">
            <div className="flex items-center gap-1">
              <Hash className="h-2.5 w-2.5 text-text-muted" />
              <span className="font-mono text-[8px] text-text-muted tracking-widest uppercase">ID · Zone</span>
            </div>
            <div className="flex items-center gap-1">
              <Tag className="h-2.5 w-2.5 text-text-muted" />
              <span className="font-mono text-[8px] text-text-muted tracking-widest uppercase">Label</span>
            </div>
            <div className="flex items-center gap-1">
              <Ruler className="h-2.5 w-2.5 text-text-muted" />
              <span className="font-mono text-[8px] text-text-muted tracking-widest uppercase">Value (m)</span>
            </div>
          </div>

          {/* ── Scrollable measurement rows ────────────────────────────── */}
          <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-track-transparent scrollbar-thumb-border">
            {entries.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full py-12 gap-3 text-center select-none">
                <Ruler className="h-6 w-6 text-text-muted opacity-20" />
                <p className="font-mono text-[9px] text-text-muted tracking-widest uppercase">
                  No measurements yet
                </p>
                <p className="font-mono text-[8px] text-text-muted/50 leading-relaxed">
                  Switch to Measure mode<br />and click two points in<br />the 3D scene
                </p>
              </div>
            ) : (
              entries.map((entry, i) => (
                <LedgerRow key={entry.id} entry={entry} index={i} />
              ))
            )}
          </div>

          {/* ── Summary footer strip ──────────────────────────────────── */}
          <div className="shrink-0 grid grid-cols-3 gap-px bg-border/30 border-t border-border/50">
            {[
              { label: "Measurements", value: String(entries.length) },
              {
                label: "Avg Confidence",
                value: entries.length > 0
                  ? `${((entries.reduce((s, e) => s + e.confidence, 0) / entries.length) * 100).toFixed(1)}%`
                  : "—",
              },
              {
                label: "Max Span",
                value: entries.length > 0
                  ? `${Math.max(...entries.map((e) => e.valueMeters)).toFixed(1)}m`
                  : "—",
              },
            ].map(({ label, value }) => (
              <div key={label} className="flex flex-col items-center py-3 bg-background/50">
                <span className="font-mono text-xs font-bold text-text-primary">{value}</span>
                <span className="font-mono text-[8px] text-text-muted tracking-widest uppercase mt-0.5">
                  {label}
                </span>
              </div>
            ))}
          </div>

          {/* ── Booking Calendar — venue availability grid ────────────── */}
          {venue && (
            <div className="shrink-0 border-t border-border/40 overflow-y-auto max-h-[400px] scrollbar-thin scrollbar-track-transparent scrollbar-thumb-border">
              <div className="px-3 pt-3 pb-1">
                <p className="font-mono text-[8px] text-text-muted uppercase tracking-widest mb-2">
                  Venue Availability · {venue.name}
                </p>
              </div>
              <div className="px-3 pb-3">
                <BookingCalendar
                  venue={venue}
                  selectedDate={selectedBookingDate || undefined}
                  onSelectDate={onSelectBookingDate}
                />
              </div>
            </div>
          )}

          {/* ── Export action buttons ─────────────────────────────────── */}
          <div className="shrink-0 flex flex-col gap-2 p-4 border-t border-border/50 bg-background/30">
            <button
              onClick={handleExport}
              className="flex items-center justify-center gap-2 rounded border border-accent/30 bg-accent/10 px-4 py-2.5 text-xs font-semibold text-accent hover:border-accent/60 hover:bg-accent/20 transition-all duration-200 group"
            >
              <Download className="h-3.5 w-3.5 group-hover:-translate-y-0.5 transition-transform" />
              Export Calibration Matrix
              <span className="font-mono text-[9px] text-accent/60 ml-1">.json</span>
            </button>
            <button
              onClick={handleCopyJson}
              className="flex items-center justify-center gap-2 rounded border border-border/60 bg-surface/40 px-4 py-2 text-xs font-medium text-text-secondary hover:border-border hover:text-text-primary transition-all duration-200"
            >
              {copied ? (
                <>
                  <CheckCheck className="h-3.5 w-3.5 text-emerald-400" />
                  <span className="text-emerald-400">Copied to clipboard</span>
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" />
                  Copy JSON to Clipboard
                </>
              )}
            </button>
            <p className="font-mono text-[9px] text-text-muted text-center tracking-wider">
              Payload schema: CalibrationMatrix v1.0
            </p>
          </div>

        </div>
      )}
    </aside>
  );
}

/**
 * 3D canvas viewport. Renders a real <canvas> element that the PlayCanvas
 * SplatEngine attaches to, layered beneath HUD overlays and UI controls.
 * A fallback wireframe SVG is shown while the engine is initialising.
 */
function ViewerCanvas({
  venue,
  isScanning,
  engineState,
  canvasRef,
  onToggleScan,
  onOpenPortal,
  overlay,
}: {
  venue: VenueProfile | null;
  isScanning: boolean;
  /** Current SplatEngine lifecycle state for overlay feedback. */
  engineState: EngineState;
  /** Ref forwarded to the native <canvas> element the engine mounts onto. */
  canvasRef: React.RefObject<HTMLCanvasElement>;
  onToggleScan: () => void;
  /** Opens the Legal Manifest Portal without interrupting the canvas loop. */
  onOpenPortal: () => void;
  /** Optional floating overlay(s) rendered inside the canvas bounding box. */
  overlay?: React.ReactNode;
}) {
  return (
    <div className="relative flex-1 overflow-hidden bg-black flex flex-col pointer-events-auto">
      {/* pointer-events-auto is set on the wrapper so native mousedown/mousemove/wheel
          events reach the PlayCanvas canvas. All decorative children must carry
          pointer-events-none so clicks fall straight through to the 3D canvas. */}

      {/* ── PlayCanvas render target — engine takes full ownership of this element ── */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full block pointer-events-auto"
        style={{ touchAction: "none" }}
      />

      {/* Background grid — decorative only, must not intercept mouse events */}
      <div
        className={cn(
          "absolute inset-0 opacity-20 transition-opacity duration-700 pointer-events-none",
          engineState === "ready" ? "opacity-0" : "opacity-20"
        )}
        style={{
          backgroundImage:
            "linear-gradient(rgba(99,102,241,0.18) 1px, transparent 1px), linear-gradient(90deg, rgba(99,102,241,0.18) 1px, transparent 1px)",
          backgroundSize: "36px 36px",
        }}
      />

      {/* Radial depth gradient */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 70% 60% at 50% 50%, rgba(99,102,241,0.06) 0%, transparent 70%)",
        }}
      />

      {/* Scan beam when active */}
      {isScanning && (
        <div className="scan-beam-container absolute inset-0 pointer-events-none">
          <div className="scan-beam" />
        </div>
      )}

      {/* Floating HUD — pointer-events-none so it never blocks canvas interaction */}
      <CanvasHUD venue={venue} isScanning={isScanning} />

      {/* ── Engine loading / error overlay — shown until engine is 'ready' ── */}
      {engineState !== "ready" && (
        <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
          <div className="flex flex-col items-center gap-6">
            {/* Fallback wireframe SVG */}
            <svg
              viewBox="0 0 520 300"
              className={cn(
                "w-[480px] max-w-[90vw] transition-opacity duration-500",
                engineState === "loading" ? "opacity-35 animate-pulse-slow" : "opacity-20"
              )}
              xmlns="http://www.w3.org/2000/svg"
            >
              {Array.from({ length: 11 }).map((_, i) => (
                <line key={`v${i}`} x1={60 + i * 40} y1={60} x2={60 + i * 40} y2={240}
                  stroke="rgba(99,102,241,0.3)" strokeWidth="0.5" />
              ))}
              {Array.from({ length: 9 }).map((_, i) => (
                <line key={`h${i}`} x1={60} y1={60 + i * 22.5} x2={460} y2={60 + i * 22.5}
                  stroke="rgba(99,102,241,0.22)" strokeWidth="0.5" />
              ))}
              <rect x="160" y="130" width="200" height="100" fill="none" stroke="rgba(99,102,241,0.65)" strokeWidth="1.2" />
              <rect x="185" y="105" width="150" height="35" fill="none" stroke="rgba(34,211,238,0.55)" strokeWidth="0.9" />
              {[170, 240, 310, 350].map((x, i) => (
                <line key={`p${i}`} x1={x} y1={230} x2={x} y2={130} stroke="rgba(99,102,241,0.45)" strokeWidth="1" />
              ))}
              {[
                [90, 75], [130, 68], [170, 72], [210, 65], [260, 61], [310, 66], [360, 70], [400, 75],
                [95, 155], [145, 148], [205, 143], [265, 140], [325, 145], [385, 150], [430, 158],
              ].map(([cx, cy], i) => (
                <circle key={`d${i}`} cx={cx} cy={cy} r="1.8" fill="rgba(34,211,238,0.75)" />
              ))}
            </svg>

            {/* State-specific status chip */}
            {engineState === "loading" && venue && (
              <div className="flex items-center gap-2.5 rounded border border-accent/30 bg-background/70 backdrop-blur-sm px-4 py-2.5">
                <Loader2 className="h-4 w-4 text-accent animate-spin" />
                <div className="flex flex-col">
                  <span className="font-mono text-xs text-accent tracking-wider">
                    Streaming spatial asset…
                  </span>
                  <span className="font-mono text-[9px] text-text-muted tracking-widest mt-0.5 truncate max-w-xs">
                    {venue.splatUrl}
                  </span>
                </div>
              </div>
            )}

            {engineState === "error" && (
              <div className="flex items-center gap-2.5 rounded border border-red-500/30 bg-background/70 backdrop-blur-sm px-4 py-2.5">
                <AlertCircle className="h-4 w-4 text-red-400 shrink-0" />
                <div className="flex flex-col">
                  <span className="font-mono text-xs text-red-400">Asset load fault — check asset path</span>
                  <span className="font-mono text-[9px] text-text-muted mt-0.5">
                    Engine context active · HUD controls operational
                  </span>
                </div>
              </div>
            )}

            {engineState === "idle" && !venue && (
              <p className="font-mono text-[10px] text-text-muted tracking-widest uppercase">
                No venue selected — append ?id=venue-001 to the URL
              </p>
            )}
          </div>
        </div>
      )}

      {/* ── Controls overlay — always rendered over canvas ── */}
      <div className="absolute inset-0 flex flex-col items-center justify-end z-10 pb-28 pointer-events-none">
        <div className="flex flex-col items-center gap-3 pointer-events-auto">
          {/* Scan toggle */}
          <button
            onClick={onToggleScan}
            className={cn(
              "flex items-center gap-2.5 rounded border px-5 py-2.5 text-xs font-semibold transition-all duration-200",
              isScanning
                ? "border-red-500/30 bg-red-500/10 text-red-400 hover:bg-red-500/20"
                : "border-accent/40 bg-accent/10 backdrop-blur-sm text-accent hover:border-accent/80 hover:bg-accent/20 hover:shadow-glow-accent"
            )}
          >
            <ScanLine className="h-4 w-4" />
            {isScanning ? "Abort Active Scan" : "Initialise Scan Sequence"}
          </button>

          {venue && engineState === "ready" && (
            <p className="font-mono text-[10px] text-text-muted tracking-widest uppercase text-center pointer-events-none select-none">
              {venue.name} · {venue.city} · {venue.capacity.toLocaleString("en-IN")} pax
            </p>
          )}
        </div>
      </div>

      {/* ── Proceed to Booking & Permits CTA — dedicated footer block ── */}
      {venue && (
        <div className="relative w-full mt-auto pt-4 border-t border-[#1e1e24] bg-[#09090b] flex flex-col items-center gap-2 pb-5 z-20">
          {/* Ambient glow disc — scoped inside the footer via `relative` parent */}
          <div
            className="absolute inset-0 -z-10 pointer-events-none overflow-hidden"
            aria-hidden="true"
          >
            <div
              className="absolute inset-x-0 bottom-0 h-full blur-2xl opacity-35"
              style={{
                background:
                  "radial-gradient(ellipse 160% 140% at 50% 100%, rgba(99,102,241,0.55) 0%, transparent 70%)",
              }}
            />
          </div>

          <button
            onClick={onOpenPortal}
            className={cn(
              "group relative flex items-center gap-3 rounded border px-7 py-3.5",
              "border-accent/50 bg-background/70 backdrop-blur-md",
              "text-sm font-bold text-accent",
              "hover:border-accent hover:bg-accent/15",
              "transition-all duration-250",
              "shadow-[0_0_32px_-6px_rgba(99,102,241,0.5)]",
              "hover:shadow-[0_0_52px_-4px_rgba(99,102,241,0.75)]"
            )}
          >
            {/* Left pulsing dot */}
            <span className="relative flex h-2 w-2 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-accent" />
            </span>

            <ClipboardCheck className="h-4 w-4 shrink-0" />

            <span className="tracking-wide">Proceed to Booking &amp; Permits</span>

            <ArrowRight className="h-4 w-4 shrink-0 group-hover:translate-x-1 transition-transform duration-200" />
          </button>

          <span className="font-mono text-[9px] text-text-muted tracking-widest uppercase pointer-events-none select-none">
            Legal manifest · Regulatory checklist · Email dispatch
          </span>
        </div>
      )}

      {/* ── Floating overlays (e.g. AssetLibraryPanel) ─────────────── */}
      {overlay}
    </div>
  );
}

/* ─── Measurement Badge Overlay ─────────────────────────────────────── */

/**
 * Viewport-fixed, pointer-events-none overlay that renders a single
 * translucent violet badge floating over the 3D measurement vector midpoint.
 *
 * Architecture: zero-React-render-cost at runtime.
 *
 *  • Position (transform: translate3d) — updated via direct DOM mutation
 *    on every `spatial-midpoint-moved` frame event (~60 fps). The React
 *    reconciler is bypassed entirely for position updates so there is no
 *    render-budget pressure from the badge tracking the camera.
 *
 *  • Distance text — updated via direct `textContent` write on each
 *    `spatial-metric-logged` event (fires ≤ once per two-click pair).
 *
 *  • Visibility — opacity toggled by the engine's `visible` flag (true when
 *    the midpoint is in front of the camera), and reset to 0 whenever the
 *    tool mode exits 'measure' so stale badges never linger.
 *
 * Coordinate system: `spatial-midpoint-moved` carries CSS pixel coordinates
 * derived from `canvas.getBoundingClientRect()` which are viewport-relative,
 * matching `position: fixed` exactly.
 */
function MeasurementBadgeOverlay({ toolMode }: { toolMode: InteractionMode }) {
  const badgeWrapRef = useRef<HTMLDivElement>(null);
  const distanceRef  = useRef<HTMLSpanElement>(null);

  /* Reset to off-screen when the user leaves measure mode. */
  useEffect(() => {
    const el = badgeWrapRef.current;
    if (!el) return;
    if (toolMode !== "measure") {
      el.style.opacity   = "0";
      el.style.transform = "translate3d(-9999px, -9999px, 0)";
    }
  }, [toolMode]);

  /* Per-frame position tracking — direct DOM mutation, no reconciler cost. */
  useEffect(() => {
    const onMidpoint = (e: CustomEvent<SpatialMidpoint>) => {
      const el = badgeWrapRef.current;
      if (!el) return;
      const { screenX, screenY, visible } = e.detail;
      el.style.transform = `translate3d(${screenX}px, ${screenY}px, 0)`;
      el.style.opacity   = visible ? "1" : "0";
    };
    window.addEventListener("spatial-midpoint-moved", onMidpoint as EventListener);
    return () =>
      window.removeEventListener("spatial-midpoint-moved", onMidpoint as EventListener);
  }, []);

  /* Update the distance readout text on each completed measurement pair. */
  useEffect(() => {
    const onMetric = (e: CustomEvent<SpatialMeasurement>) => {
      if (distanceRef.current) {
        distanceRef.current.textContent = `${e.detail.distance.toFixed(3)} m`;
      }
    };
    window.addEventListener("spatial-metric-logged", onMetric as EventListener);
    return () =>
      window.removeEventListener("spatial-metric-logged", onMetric as EventListener);
  }, []);

  return (
    /*
     * `fixed inset-0` makes this overlay fill the entire viewport and sit
     * above the canvas (z-40) without affecting layout flow.
     * `overflow-hidden` clips the badge when it would appear off-screen.
     */
    <div
      className="fixed inset-0 pointer-events-none z-40 overflow-hidden"
      aria-hidden="true"
    >
      {/*
       * The wrapper starts off-screen (translate3d −9999px) and with opacity 0.
       * Every `spatial-midpoint-moved` event replaces its transform with the
       * live viewport coordinates coming from PlayCanvas's worldToScreen projection.
       * `will-change-transform` promotes this layer to its own GPU composite layer.
       */}
      <div
        ref={badgeWrapRef}
        className="absolute top-0 left-0 will-change-transform"
        style={{ opacity: 0, transform: "translate3d(-9999px, -9999px, 0)" }}
      >
        {/*
         * −50% X/Y offset centres the badge on the exact midpoint pixel rather
         * than placing its top-left corner there.
         */}
        <div className="-translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-0.5 select-none">

          {/* ── Violet translucent badge pill ─────────────────────────── */}
          <div className="flex items-center gap-1.5 rounded-full border border-violet-500/50 bg-violet-950/85 backdrop-blur-sm px-3 py-1.5 shadow-lg shadow-violet-900/40 ring-1 ring-violet-400/10">
            {/* Pulsing live indicator dot */}
            <span className="relative flex h-1.5 w-1.5 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-violet-400 opacity-60" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-violet-400" />
            </span>
            {/* Distance readout — updated via textContent, not React state */}
            <span
              ref={distanceRef}
              className="font-mono text-[11px] font-semibold text-violet-200 tabular-nums tracking-wider"
            >
              — m
            </span>
          </div>

          {/* ── Connector stem fading toward the midpoint ─────────────── */}
          <div className="w-px h-2.5 bg-gradient-to-b from-violet-400/60 to-transparent" />

          {/* ── Midpoint anchor dot ───────────────────────────────────── */}
          <div className="h-2 w-2 rounded-full bg-violet-400/80 border border-violet-300/50 shadow-sm shadow-violet-400/30" />
        </div>
      </div>
    </div>
  );
}

/* ─── Engine lifecycle state ─────────────────────────────────────────── */

/**
 * Tracks the SplatEngine initialisation and asset-streaming lifecycle.
 * - 'idle'    : no venue selected or engine not yet started
 * - 'loading' : engine instantiated, asset payload being streamed
 * - 'ready'   : splat loaded and rasteriser armed — canvas is live
 * - 'error'   : asset load or engine init failed
 */
type EngineState = "idle" | "loading" | "ready" | "error";

/* ─── Spatial Toolbar ────────────────────────────────────────────────── */

/**
 * Vertical floating toolbelt docked to the left edge of the 3D canvas.
 * Displays icon-only buttons (no permanent text labels) and exposes a
 * tooltip popup on hover that never resizes the parent container.
 */
function SpatialToolbar({
  toolMode,
  onModeChange,
}: {
  toolMode:     InteractionMode;
  onModeChange: (mode: InteractionMode) => void;
}) {
  const tools = [
    {
      mode:       "navigate" as InteractionMode,
      icon:       <Compass className="h-[18px] w-[18px]" />,
      label:      "Navigate",
      subtitle:   "Orbit drag · scroll zoom",
      shortcut:   "N",
      activeStyle: "bg-white/10 text-white border-white/18 shadow-[0_0_14px_rgba(255,255,255,0.07)]",
    },
    {
      mode:       "measure" as InteractionMode,
      icon:       <Ruler className="h-[18px] w-[18px]" />,
      label:      "Measure",
      subtitle:   "Two-click distance",
      shortcut:   "M",
      activeStyle: "bg-cyan-400/15 text-cyan-400 border-cyan-400/30 shadow-[0_0_14px_rgba(34,211,238,0.16)]",
    },
    {
      mode:       "inject" as InteractionMode,
      icon:       <LayoutGrid className="h-[18px] w-[18px]" />,
      label:      "Inject Assets",
      subtitle:   "Place 3D models",
      shortcut:   "I",
      activeStyle: "bg-amber-400/15 text-amber-400 border-amber-400/30 shadow-[0_0_14px_rgba(251,191,36,0.16)]",
    },
  ] as const;

  return (
    <div className="absolute left-4 top-1/2 -translate-y-1/2 z-40 w-14 h-auto flex flex-col items-center gap-3 bg-[#09090b]/95 border border-[#1e1e24] p-2 rounded-xl shadow-2xl pointer-events-auto">
      {/* Top rule */}
      <div className="h-px w-6 bg-[#1e1e24] shrink-0" />

      {tools.map(({ mode, icon, label, subtitle, shortcut, activeStyle }) => {
        const isActive = toolMode === mode;
        return (
          <div key={mode} className="group relative flex items-center">
            {/* Icon-only click area */}
            <button
              onClick={() => onModeChange(mode)}
              aria-label={`${label} (${shortcut})`}
              className={cn(
                "w-10 h-10 rounded-lg flex items-center justify-center border transition-all duration-150",
                isActive
                  ? activeStyle
                  : "border-transparent text-[#52525e] hover:text-white hover:bg-white/8 hover:border-[#2a2a35]"
              )}
            >
              {icon}
            </button>

            {/* Hover tooltip — absolutely positioned right of button, never expands parent */}
            <div
              className={cn(
                "absolute left-full ml-3 top-1/2 -translate-y-1/2",
                "pointer-events-none select-none whitespace-nowrap",
                "opacity-0 group-hover:opacity-100 transition-opacity duration-150 delay-75"
              )}
            >
              <div className="rounded-lg border border-[#1e1e24] bg-[#09090b]/98 backdrop-blur-sm px-3 py-1.5 shadow-2xl">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[11px] font-semibold text-white tracking-wide">
                    {label}
                  </span>
                  <kbd className="font-mono text-[8px] border border-[#2a2a35] rounded px-1 py-px text-[#52525e]">
                    {shortcut}
                  </kbd>
                </div>
                <p className="font-mono text-[9px] text-[#52525e] mt-0.5">{subtitle}</p>
              </div>
            </div>
          </div>
        );
      })}

      {/* Bottom rule */}
      <div className="h-px w-6 bg-[#1e1e24] shrink-0" />
    </div>
  );
}

/* ─── Page ───────────────────────────────────────────────────────────── */

export default function ViewerPage() {
  const searchParams = useSearchParams();
  const venueId = searchParams.get("id");

  const venue: VenueProfile | null =
    venues.find((v) => v.id === venueId) ?? null;

  const [isScanning, setIsScanning]       = useState(false);
  const [ledgerOpen, setLedgerOpen]       = useState(true);
  const [portalOpen, setPortalOpen]       = useState(false);
  const [engineState, setEngineState]     = useState<EngineState>("idle");
  /**
   * Active spatial interaction mode — kept in sync with the SplatEngine
   * via the effect below.  Switching to 'inject' also opens the
   * AssetLibraryPanel overlay.
   */
  const [toolMode, setToolMode]           = useState<InteractionMode>("navigate");
  /**
   * Registry of every successfully injected 3D model this session.
   * Populated by the `onModelInjected` callback from AssetLibraryPanel and
   * flushed into the JSON layout manifest when `executeSceneExport` is called.
   */
  const [sceneAssets, setSceneAssets]     = useState<SceneAssetRecord[]>([]);
  /** Tracks whether an export dispatch is in-flight for button feedback. */
  const [isExporting, setIsExporting]     = useState(false);
  /**
   * Date selected in the BookingCalendar — lifted here so it can be shared
   * with LegalManifestPortal to pre-fill the Event Details date field.
   */
  const [selectedBookingDate, setSelectedBookingDate] = useState<string>("");

  /** Native <canvas> element the PlayCanvas Application attaches to. */
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  /** Live SplatEngine instance — persisted across renders, destroyed on venue change. */
  const engineRef  = useRef<SplatEngine | null>(null);
  /**
   * Ref mirror of `toolMode` — readable from inside async closures without
   * the stale-closure problem.  Updated in the `toolMode` sync effect below.
   */
  const toolModeRef = useRef<InteractionMode>("navigate");

  /**
   * Telemetry measurement rows rendered by TelemetryLedger.
   * Starts empty on every page mount — populated exclusively by live
   * `spatial-metric-logged` events arriving from SplatEngine as the user
   * places measurement anchors in the 3D scene.
   */
  const [telemetry, setTelemetry] = useState<TelemetryEntry[]>([]);

  /**
   * Engine initialisation effect.
   * Runs whenever the resolved venue changes (keyed on venue.id).
   *
   * Sequence:
   *   1. Destroy any existing engine instance to free VRAM.
   *   2. Dynamically import SplatEngine (avoids SSR / Next.js server bundle).
   *   3. Instantiate SplatEngine with the native canvas ref.
   *   4. Call loadSplatLocation(splatUrl, collisionMeshUrl) — both paths are
   *      derived from the active venue's unique asset directory.
   *   5. Update engineState to reflect the current lifecycle stage.
   *
   * Cleanup: destroys the engine when the venue changes or the page unmounts.
   */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !venue) {
      setEngineState("idle");
      return;
    }

    let cancelled = false;

    const initEngine = async () => {
      setEngineState("loading");

      // Tear down any previously mounted engine before re-initialising
      if (engineRef.current) {
        engineRef.current.destroy();
        engineRef.current = null;
      }

      try {
        // Dynamic import keeps PlayCanvas out of the Next.js SSR bundle
        const { SplatEngine } = await import("@venue/core-3d");
        if (cancelled) return;

        const engine = new SplatEngine({ canvas });
        engineRef.current = engine;

        // Derive the companion collision mesh URL from the splatUrl directory.
        // Convention: /assets/splats/venue-N/capture.ply → /assets/splats/venue-N/collision.glb
        const collisionMeshUrl = venue.splatUrl.replace(/\/[^/]+$/, "/collision.glb");

        console.log(`[ViewerPage] Streaming: ${venue.splatUrl}`);
        console.log(`[ViewerPage] Proxy mesh: ${collisionMeshUrl}`);

        await engine.loadSplatLocation(venue.splatUrl, collisionMeshUrl);

        if (cancelled) return;

        // Apply whatever mode the toolbar switched to while the engine was
        // loading — toolModeRef always holds the latest value without stale
        // closure issues.
        engine.setInteractionMode(toolModeRef.current);

        setEngineState("ready");
        console.log(`[ViewerPage] Engine ready — venue: ${venue.id} · mode: ${toolModeRef.current}`);
      } catch (err) {
        if (cancelled) return;
        console.error("[ViewerPage] SplatEngine init or asset load failed:", err);
        setEngineState("error");
      }
    };

    initEngine();

    return () => {
      cancelled = true;
      if (engineRef.current) {
        engineRef.current.destroy();
        engineRef.current = null;
        console.log(`[ViewerPage] Engine destroyed — venue: ${venue?.id}`);
      }
    };
  // Re-run only when the venue ID changes, not on every render
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [venue?.id]);

  /**
   * Sync the React toolMode state → SplatEngine whenever the tool changes.
   * Also updates `toolModeRef` so the async initEngine closure can read the
   * latest value when the engine finishes loading.
   *
   * Safe to call before the engine is ready — engineRef.current is null
   * until initEngine() resolves, so the optional-chain is a harmless no-op.
   */
  useEffect(() => {
    toolModeRef.current = toolMode;
    engineRef.current?.setInteractionMode(toolMode);
  }, [toolMode]);

  /**
   * Subscribe to `spatial-metric-logged` window events emitted by SplatEngine
   * whenever a two-click measurement pair completes.
   *
   * Each measurement is prepended to the telemetry state array so it appears
   * at the top of the Telemetry Ledger panel immediately.
   */
  useEffect(() => {
    const handler = (e: CustomEvent<SpatialMeasurement>) => {
      const m = e.detail;

      // Format entity names: 'GroundPlane::Y=0' → 'Ground', proxy mesh → 'Mesh'
      const fmtName = (n: string) =>
        n.startsWith("GroundPlane") ? "Ground" : n.replace(/[_-]/g, " ");

      const newEntry: TelemetryEntry = {
        id:          `msr-${Date.now()}`,
        label:       `${fmtName(m.anchorA.entityName)} → ${fmtName(m.anchorB.entityName)}`,
        zone:        "Spatial Capture",
        valueMeters: m.distance,
        capturedAt:  m.timestamp,
        confidence:  0.97,
      };

      setTelemetry((prev) => [newEntry, ...prev]);
      console.log(`[ViewerPage] Measurement logged: ${m.distance.toFixed(3)}m`);
    };

    // The WindowEventMap augmentation in @venue/core-3d provides the correct
    // CustomEvent generic, but we cast for environments where the .d.ts has
    // not yet been rebuilt.
    window.addEventListener(
      "spatial-metric-logged",
      handler as EventListener
    );
    return () =>
      window.removeEventListener(
        "spatial-metric-logged",
        handler as EventListener
      );
  }, []); // no deps — setTelemetry is stable

  /** Appends a freshly-injected asset record to the session registry. */
  const handleModelInjected = useCallback((record: SceneAssetRecord) => {
    setSceneAssets((prev) => [...prev, record]);
    console.log(`[ViewerPage] Asset registered for export: ${record.name}`);
  }, []);

  /**
   * Dual Export Pipeline trigger.
   * Reads the canvas pixel buffer (PNG) and serialises sceneAssets (JSON)
   * simultaneously via executeSceneExport.
   */
  const handleSceneExport = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    setIsExporting(true);

    try {
      executeSceneExport(canvas, sceneAssets, venueId ?? "demo");
    } finally {
      // Restore button state after the staggered 80ms JSON dispatch clears
      setTimeout(() => setIsExporting(false), 500);
    }
  }, [sceneAssets, venueId]);

  return (
    <>
    <div className="flex flex-col h-screen bg-background overflow-hidden">

      {/* ── Top chrome bar ──────────────────────────────────────────── */}
      <header className="shrink-0 flex items-center justify-between px-5 h-12 border-b border-border/60 bg-surface/80 backdrop-blur-xl z-40">

        {/* Left: back + identity */}
        <div className="flex items-center gap-4">
          <Link
            href="/"
            className="flex items-center gap-1.5 text-text-muted hover:text-text-primary transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
            <span className="font-mono text-xs tracking-wider">Back</span>
          </Link>
          <div className="h-4 w-px bg-border" />
          <div className="flex items-center gap-2">
            <div className="flex h-5 w-5 items-center justify-center rounded bg-accent/10 border border-accent/30">
              <Box className="h-2.5 w-2.5 text-accent" />
            </div>
            <span className="font-mono text-xs font-semibold text-text-primary tracking-widest uppercase">
              Venue<span className="text-accent">Platform</span>
              <span className="text-text-muted font-normal ml-2">/ Immersive Viewer</span>
            </span>
          </div>
        </div>

        {/* Centre: venue context pill */}
        <div className="hidden md:flex items-center gap-2 rounded border border-border/60 bg-background/60 px-3 py-1.5">
          <Crosshair className="h-3 w-3 text-accent/60" />
          <span className="font-mono text-[10px] text-text-secondary tracking-wider">
            {venue ? `${venue.name} · ${venue.area}` : "No venue selected — demo mode"}
          </span>
          {venue && (
            <>
              <span className="h-3 w-px bg-border" />
              <span className="font-mono text-[10px] text-text-muted">
                id: {venue.id}
              </span>
            </>
          )}
        </div>

        {/* Right: status indicators */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <Wifi className="h-3 w-3 text-emerald-400" />
            <span className="font-mono text-[10px] text-emerald-400 tracking-wider">LIVE</span>
          </div>
          <div className="h-3 w-px bg-border" />
          <div className="flex items-center gap-1.5">
            {engineState === "loading" ? (
              <Loader2 className="h-3 w-3 text-accent animate-spin" />
            ) : engineState === "error" ? (
              <AlertCircle className="h-3 w-3 text-red-400" />
            ) : (
              <Cpu className="h-3 w-3 text-text-muted" />
            )}
            <span className={cn(
              "font-mono text-[10px] tracking-wider",
              engineState === "loading" ? "text-accent" :
              engineState === "error"   ? "text-red-400" :
              engineState === "ready"   ? "text-emerald-400" : "text-text-muted"
            )}>
              {engineState === "loading" ? "Streaming asset…" :
               engineState === "error"   ? "Load fault" :
               engineState === "ready"   ? "Engine live" : "PlayCanvas v2.3"}
            </span>
          </div>
          <div className="h-3 w-px bg-border" />
          <div className="flex items-center gap-1.5">
            <Clock className="h-3 w-3 text-text-muted" />
            <span className="font-mono text-[10px] text-text-muted tracking-wider">
              {new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
            </span>
          </div>
          <div className="h-3 w-px bg-border" />

          {/* ── Export Design Build ──────────────────────────────────── */}
          <button
            onClick={handleSceneExport}
            disabled={isExporting}
            title={`Export canvas PNG + layout manifest JSON · ${sceneAssets.length} asset${sceneAssets.length !== 1 ? "s" : ""} in scene`}
            className={cn(
              "group relative flex items-center gap-1.5 rounded border px-2.5 py-1 transition-all duration-200",
              isExporting
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400 cursor-wait"
                : "border-emerald-600/35 bg-emerald-600/8 text-emerald-400 hover:border-emerald-500/60 hover:bg-emerald-500/15"
            )}
          >
            {isExporting ? (
              <Loader2 className="h-3 w-3 animate-spin shrink-0" />
            ) : (
              <FolderDown className="h-3 w-3 shrink-0 group-hover:-translate-y-px transition-transform duration-150" />
            )}
            <span className="font-mono text-[10px] tracking-wider hidden lg:flex items-center gap-1">
              Export Design
              <span className="flex items-center gap-0.5 opacity-60">
                <ImageDown className="h-2.5 w-2.5" />
                <FileJson className="h-2.5 w-2.5" />
              </span>
            </span>
            {/* Asset count badge */}
            {sceneAssets.length > 0 && (
              <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-emerald-500/25 px-1 font-mono text-[7px] font-bold text-emerald-300 tabular-nums">
                {sceneAssets.length}
              </span>
            )}
          </button>

          <div className="h-3 w-px bg-border" />
          {/* Legal Manifest Portal trigger */}
          {venue && (
            <button
              onClick={() => setPortalOpen(true)}
              className="flex items-center gap-1.5 rounded border border-accent/30 bg-accent/10 px-2.5 py-1 hover:border-accent/60 hover:bg-accent/20 transition-colors"
              title="Open Legal Manifest Portal"
            >
              <FileText className="h-3 w-3 text-accent" />
              <span className="font-mono text-[10px] text-accent hidden lg:block tracking-wider">
                Book Venue
              </span>
            </button>
          )}
          {/* Ledger toggle (mirrored in sidebar) */}
          <button
            onClick={() => setLedgerOpen((p) => !p)}
            className="flex items-center gap-1.5 rounded border border-border/50 bg-surface/40 px-2.5 py-1 hover:border-border transition-colors"
            title="Toggle Telemetry Ledger"
          >
            <Layers className="h-3 w-3 text-text-muted" />
            <span className="font-mono text-[10px] text-text-muted hidden lg:block tracking-wider">
              Telemetry
            </span>
          </button>
        </div>
      </header>

      {/* ── Main split-panel body ──────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* Option A — 3D canvas viewport (flex-1, fills remaining width) */}
        <ViewerCanvas
          venue={venue}
          isScanning={isScanning}
          engineState={engineState}
          canvasRef={canvasRef}
          onToggleScan={() => setIsScanning((p) => !p)}
          onOpenPortal={() => setPortalOpen(true)}
          overlay={
            <>
              {/* Vertical spatial toolbelt — always visible over the canvas */}
              <SpatialToolbar toolMode={toolMode} onModeChange={setToolMode} />
              {/* Asset panel — only when inject mode is active */}
              {toolMode === "inject" && (
                <AssetLibraryPanel
                  engineRef={engineRef}
                  onModelInjected={handleModelInjected}
                />
              )}
            </>
          }
        />

        {/* Option B — Industrial Telemetry Ledger (sliding right panel) */}
        <TelemetryLedger
          venue={venue}
          venueId={venueId ?? "demo"}
          venueName={venue?.name ?? "Demo Mode"}
          entries={telemetry}
          isOpen={ledgerOpen}
          onToggle={() => setLedgerOpen((p) => !p)}
          selectedBookingDate={selectedBookingDate}
          onSelectBookingDate={setSelectedBookingDate}
        />

      </div>

      {/* ── Legal Manifest Portal overlay ────────────────────────── */}
      {portalOpen && venue && (
        <LegalManifestPortal
          venue={venue}
          onClose={() => setPortalOpen(false)}
          prefillDate={selectedBookingDate}
        />
      )}

      {/* ── Bottom status bar ─────────────────────────────────────────── */}
      <footer className="shrink-0 flex items-center justify-between px-5 h-8 border-t border-border/40 bg-surface/60 z-40">
        <div className="flex items-center gap-4">
          <span className="font-mono text-[9px] text-text-muted tracking-widest uppercase">
            3DGS Rasterizer · WebGL2
          </span>
          <span className="font-mono text-[9px] text-text-muted">
            {telemetry.length} measurement{telemetry.length !== 1 ? "s" : ""} indexed
          </span>
        </div>
        <div className="flex items-center gap-4">
          <span className="font-mono text-[9px] text-text-muted tracking-widest uppercase">
            © 2026 VenuePlatform
          </span>
          {/* Contextual editor shortcut — passes active venue ID so editor
              auto-injects the correct .ply scan file on boot. */}
          {venue && (
            <Link
              href={`/editor?id=${venueId}`}
              className="flex items-center gap-1.5 font-mono text-[9px] text-text-muted hover:text-accent transition-colors duration-150"
              title={`Open ${venue.name} in SuperSplat Editor`}
            >
              <Layers className="h-2.5 w-2.5" />
              Open in Editor
            </Link>
          )}
          <div className="flex items-center gap-1.5">
            <Radio className="h-2.5 w-2.5 text-accent/50" />
            <span className="font-mono text-[9px] text-accent/60">ENGINE ACTIVE</span>
          </div>
        </div>
      </footer>

    </div>

    {/*
     * Viewport-fixed measurement badge — lives outside the page flex tree so
     * `position: fixed` resolves to the true viewport origin, perfectly matching
     * the CSS pixel coordinates produced by SplatEngine's worldToScreen projection.
     */}
    <MeasurementBadgeOverlay toolMode={toolMode} />
    </>
  );
}
