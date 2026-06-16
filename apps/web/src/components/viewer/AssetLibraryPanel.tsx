"use client";

import { useState, useCallback } from "react";
import {
  Package2,
  MousePointer2,
  Cpu,
  Box,
  HardHat,
  Volume2,
  Lightbulb,
  MonitorPlay,
  Network,
  LayoutGrid,
  RectangleHorizontal,
  ArrowUpFromDot,
  ShieldAlert,
  ShieldCheck,
  Droplets,
  Loader2,
  CheckCircle2,
  AlertCircle,
  ChevronRight,
} from "lucide-react";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import {
  assetLibrary,
  groupSubCategories,
  assetCategoryMap,
  type AssetGroup,
  type AssetCategory,
  type InjectableAsset,
} from "@/data/assetLibrary";
import type { SceneAssetRecord } from "@/utils/exportEngine";
import type { SplatEngine } from "@venue/core-3d";

function cn(...inputs: Parameters<typeof clsx>): string {
  return twMerge(clsx(inputs));
}

/* ─── Internal types ────────────────────────────────────────────────────────── */

type InjectionState = "idle" | "loading" | "placed" | "error";

interface InjectionStatus {
  state:   InjectionState;
  handle?: string;
  error?:  string;
}

/* ─── Static config tables ──────────────────────────────────────────────────── */

/**
 * Monospace Unicode glyph shown as the thumbnail centrepiece per asset code.
 * Chosen to loosely evoke the asset's physical shape.
 */
const THUMB_GLYPH: Record<string, string> = {
  AUDIO: '◈',   // speaker membrane
  FOH:   '⊞',   // console grid
  LGHT:  '✦',   // fixture beam star
  HAZE:  '≋',   // atmospheric wave
  LED:   '▤',   // panel grid
  TRUSS: '⊕',   // structural cross
  TOWER: '╫',   // vertical tower
  SCAFF: '⊟',   // scaffold block
  DECK:  '▬',   // flat stage board
  RISER: '▫',   // raised platform
  TIN:   '║',   // perimeter line
  MOJO:  '⊣',   // crowd barrier
  WC:    '○',   // welfare unit
};

/* ── Per-group visual accent tokens ──────────────────────────────────────────
 *
 * All Tailwind classes must be complete literal strings for the JIT scanner.
 */
interface AccentTokens {
  groupTab:      string;
  groupCount:    string;
  subPillActive: string;
  subPillHover:  string;
  cardHover:     string;
  glyphIdle:     string;
  glyphHover:    string;
  thumbHoverBg:  string;
  injectPill:    string;
}

const GROUP_ACCENT: Record<AssetGroup, AccentTokens> = {
  technical: {
    groupTab:      'border-cyan-400/40 bg-cyan-400/10 text-cyan-400',
    groupCount:    'bg-cyan-400/20 text-cyan-400',
    subPillActive: 'border-cyan-400/40 bg-cyan-400/12 text-cyan-400',
    subPillHover:  'hover:border-cyan-400/25 hover:text-cyan-300',
    cardHover:     'hover:border-cyan-400/50 hover:bg-cyan-400/5 hover:shadow-[0_0_20px_-5px_rgba(34,211,238,0.35)]',
    glyphIdle:     'text-cyan-400/20',
    glyphHover:    'group-hover:text-cyan-400/65',
    thumbHoverBg:  'group-hover:bg-cyan-400/8',
    injectPill:    'bg-cyan-400/15 border-cyan-400/30 text-cyan-400',
  },
  staging: {
    groupTab:      'border-amber-400/40 bg-amber-400/10 text-amber-400',
    groupCount:    'bg-amber-400/20 text-amber-400',
    subPillActive: 'border-amber-400/40 bg-amber-400/12 text-amber-400',
    subPillHover:  'hover:border-amber-400/25 hover:text-amber-300',
    cardHover:     'hover:border-amber-400/50 hover:bg-amber-400/5 hover:shadow-[0_0_20px_-5px_rgba(251,191,36,0.35)]',
    glyphIdle:     'text-amber-400/20',
    glyphHover:    'group-hover:text-amber-400/65',
    thumbHoverBg:  'group-hover:bg-amber-400/8',
    injectPill:    'bg-amber-400/15 border-amber-400/30 text-amber-400',
  },
  construction: {
    groupTab:      'border-orange-400/40 bg-orange-400/10 text-orange-400',
    groupCount:    'bg-orange-400/20 text-orange-400',
    subPillActive: 'border-orange-400/40 bg-orange-400/12 text-orange-400',
    subPillHover:  'hover:border-orange-400/25 hover:text-orange-300',
    cardHover:     'hover:border-orange-400/50 hover:bg-orange-400/5 hover:shadow-[0_0_20px_-5px_rgba(251,146,60,0.35)]',
    glyphIdle:     'text-orange-400/20',
    glyphHover:    'group-hover:text-orange-400/65',
    thumbHoverBg:  'group-hover:bg-orange-400/8',
    injectPill:    'bg-orange-400/15 border-orange-400/30 text-orange-400',
  },
};

/* ── Group tab definitions ───────────────────────────────────────────────── */

interface GroupConfig {
  id:         AssetGroup;
  label:      string;
  shortLabel: string;
  icon:       React.ReactNode;
}

const GROUP_CONFIG: GroupConfig[] = [
  {
    id:         'technical',
    label:      'Technical Elements',
    shortLabel: 'Technical',
    icon:       <Cpu className="h-3 w-3 shrink-0" />,
  },
  {
    id:         'staging',
    label:      'Staging Elements',
    shortLabel: 'Staging',
    icon:       <Box className="h-3 w-3 shrink-0" />,
  },
  {
    id:         'construction',
    label:      'Venue Construction',
    shortLabel: 'Construction',
    icon:       <HardHat className="h-3 w-3 shrink-0" />,
  },
];

/* ── Sub-category pill definitions ─────────────────────────────────────────── */

interface SubCatConfig {
  id:    AssetCategory;
  label: string;
  icon:  React.ReactNode;
}

const SUB_CAT_CONFIG: Record<AssetCategory, SubCatConfig> = {
  audio:          { id: 'audio',          label: 'Audio',          icon: <Volume2         className="h-2.5 w-2.5 shrink-0" /> },
  lighting:       { id: 'lighting',       label: 'Lighting',       icon: <Lightbulb       className="h-2.5 w-2.5 shrink-0" /> },
  led:            { id: 'led',            label: 'LED Screen',     icon: <MonitorPlay     className="h-2.5 w-2.5 shrink-0" /> },
  trussing:       { id: 'trussing',       label: 'Trussing',       icon: <Network         className="h-2.5 w-2.5 shrink-0" /> },
  scaffolding:    { id: 'scaffolding',    label: 'Scaffolding',    icon: <LayoutGrid      className="h-2.5 w-2.5 shrink-0" /> },
  stage:          { id: 'stage',          label: 'Stage',          icon: <RectangleHorizontal className="h-2.5 w-2.5 shrink-0" /> },
  risers:         { id: 'risers',         label: 'Risers',         icon: <ArrowUpFromDot  className="h-2.5 w-2.5 shrink-0" /> },
  tin_barricade:  { id: 'tin_barricade',  label: 'Tin Barricading',  icon: <ShieldAlert   className="h-2.5 w-2.5 shrink-0" /> },
  mojo_barricade: { id: 'mojo_barricade', label: 'Mojo Barricading', icon: <ShieldCheck   className="h-2.5 w-2.5 shrink-0" /> },
  welfare:        { id: 'welfare',        label: 'Welfare',        icon: <Droplets        className="h-2.5 w-2.5 shrink-0" /> },
};

/* ─── Helpers ───────────────────────────────────────────────────────────────── */

function formatFootprint(dims: { width: number; length: number; height: number }): string {
  return `${dims.width}m × ${dims.length}m · H: ${dims.height}m`;
}

/* ─── AssetCard ─────────────────────────────────────────────────────────────── */

function AssetCard({
  asset,
  accent,
  status,
  onInject,
}: {
  asset:    InjectableAsset;
  accent:   AccentTokens;
  status:   InjectionStatus;
  onInject: (asset: InjectableAsset) => void;
}) {
  const glyph     = THUMB_GLYPH[asset.thumbnailText] ?? '⬡';
  const isLoading = status.state === "loading";

  const borderClass =
    status.state === "placed" ? "border-emerald-500/50" :
    status.state === "error"  ? "border-red-500/40"     :
    `border-border/40 ${status.state === "idle" ? accent.cardHover : ""}`;

  const bgClass =
    status.state === "placed" ? "bg-emerald-500/5" :
    status.state === "error"  ? "bg-red-500/5"     :
    "bg-surface/30";

  const thumbBgClass =
    status.state === "placed" ? "bg-emerald-500/10" :
    status.state === "error"  ? "bg-red-500/8"      :
    `bg-background/50 ${accent.thumbHoverBg}`;

  const nameText =
    status.state === "loading" ? "Streaming model…"  :
    status.state === "placed"  ? "Placed in scene ✓" :
    status.state === "error"   ? (status.error ?? "Injection fault") :
    asset.name;

  const nameColor =
    status.state === "placed" ? "text-emerald-400" :
    status.state === "error"  ? "text-red-400"     :
    "text-text-primary";

  return (
    <button
      onClick={() => onInject(asset)}
      disabled={isLoading}
      title={isLoading ? "Streaming model…" : `Inject: ${asset.name}`}
      className={cn(
        "group relative flex flex-col text-left rounded border transition-all duration-200 overflow-hidden",
        borderClass,
        bgClass,
        isLoading && "cursor-wait opacity-60"
      )}
    >
      {/* ── Thumbnail zone ─────────────────────────────────────────────────── */}
      <div className={cn(
        "relative h-[60px] w-full flex items-center justify-center border-b border-border/25 transition-colors duration-200",
        thumbBgClass
      )}>
        {status.state === "idle" && (
          <span className={cn(
            "text-3xl select-none transition-colors duration-200",
            accent.glyphIdle,
            accent.glyphHover
          )}>
            {glyph}
          </span>
        )}
        {status.state === "loading" && <Loader2     className="h-5 w-5 text-accent animate-spin" />}
        {status.state === "placed"  && <CheckCircle2 className="h-5 w-5 text-emerald-400" />}
        {status.state === "error"   && <AlertCircle  className="h-5 w-5 text-red-400" />}

        <span className="absolute top-1 right-1 font-mono text-[6px] tracking-widest border border-border/30 rounded px-1 py-px text-text-muted">
          {asset.thumbnailText}
        </span>

        {status.state === "idle" && (
          <div className="absolute bottom-1 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
            <div className={cn(
              "flex items-center gap-0.5 rounded border px-1.5 py-px text-[7px] font-mono font-bold tracking-wide",
              accent.injectPill
            )}>
              <ChevronRight className="h-2 w-2" />
              INJECT
            </div>
          </div>
        )}
      </div>

      {/* ── Info zone ──────────────────────────────────────────────────────── */}
      <div className="p-2 flex flex-col gap-1 min-w-0">
        <p className={cn("text-[10px] font-medium leading-snug line-clamp-2", nameColor)}>
          {nameText}
        </p>
        {status.state === "idle" && (
          <p className="font-mono text-[7px] text-text-muted leading-relaxed">
            {formatFootprint(asset.dimensions)}
          </p>
        )}
      </div>
    </button>
  );
}

/* ─── AssetLibraryPanel ─────────────────────────────────────────────────────── */

export interface AssetLibraryPanelProps {
  engineRef: React.RefObject<SplatEngine | null>;
  onModelInjected?: (record: SceneAssetRecord) => void;
}

export function AssetLibraryPanel({ engineRef, onModelInjected }: AssetLibraryPanelProps) {
  const [activeGroup,    setActiveGroup]    = useState<AssetGroup>("technical");
  const [activeCategory, setActiveCategory] = useState<AssetCategory>("audio");
  const [injectionStatus, setStatus]        = useState<Record<string, InjectionStatus>>({});

  /* ── When the group changes, reset to its first sub-category ─────────────── */
  const handleGroupChange = useCallback((group: AssetGroup) => {
    setActiveGroup(group);
    setActiveCategory(groupSubCategories[group][0]);
  }, []);

  const assets  = assetCategoryMap[activeCategory] ?? [];
  const accent  = GROUP_ACCENT[activeGroup];
  const subCats = groupSubCategories[activeGroup];

  const groupTotal = (g: AssetGroup) =>
    assetLibrary.filter((a) => a.group === g).length;

  /* ── Injection handler ────────────────────────────────────────────────────── */
  const handleInject = useCallback(
    async (asset: InjectableAsset) => {
      const engine = engineRef.current;
      if (!engine) return;

      setStatus((prev) => ({ ...prev, [asset.id]: { state: "loading" } }));

      try {
        const handle = await engine.inject3DModel(asset.modelUrl);

        setStatus((prev) => ({ ...prev, [asset.id]: { state: "placed", handle } }));

        onModelInjected?.({
          handle,
          assetId:    asset.id,
          name:       asset.name,
          group:      asset.group,
          category:   asset.category,
          modelUrl:   asset.modelUrl,
          dimensions: asset.dimensions,
          injectedAt: new Date().toISOString(),
        });

        setTimeout(() => {
          setStatus((prev) => ({ ...prev, [asset.id]: { state: "idle" } }));
        }, 2200);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Injection fault";
        setStatus((prev) => ({ ...prev, [asset.id]: { state: "error", error: message } }));
        setTimeout(() => {
          setStatus((prev) => ({ ...prev, [asset.id]: { state: "idle" } }));
        }, 3000);
      }
    },
    [engineRef, onModelInjected]
  );

  /* ── Render ───────────────────────────────────────────────────────────────── */
  return (
    <div className="absolute left-0 inset-y-0 w-[272px] z-30 flex flex-col bg-[#07070d]/92 backdrop-blur-xl border-r border-white/5 shadow-[4px_0_40px_-8px_rgba(0,0,0,0.85)]">

      {/* ── Panel header ───────────────────────────────────────────────────── */}
      <div className="shrink-0 px-4 pt-4 pb-3 border-b border-white/6">
        <div className="flex items-center gap-2 mb-1">
          <div className="flex h-5 w-5 items-center justify-center rounded bg-accent/12 border border-accent/25">
            <Package2 className="h-3 w-3 text-accent" />
          </div>
          <h2 className="font-mono text-[11px] font-semibold text-text-primary tracking-[0.15em] uppercase">
            3D Asset Library
          </h2>
        </div>
        <div className="flex items-center gap-1.5 pl-1">
          <MousePointer2 className="h-2.5 w-2.5 text-text-muted shrink-0" />
          <p className="font-mono text-[9px] text-text-muted tracking-wide">
            Click scene to set origin · then select model
          </p>
        </div>
      </div>

      {/* ── Parent group tab row ────────────────────────────────────────────── */}
      <div className="shrink-0 flex gap-px p-2 border-b border-white/5 bg-black/20">
        {GROUP_CONFIG.map((g) => {
          const isActive = activeGroup === g.id;
          const ac       = GROUP_ACCENT[g.id];
          const total    = groupTotal(g.id);
          return (
            <button
              key={g.id}
              onClick={() => handleGroupChange(g.id)}
              title={g.label}
              className={cn(
                "flex-1 flex flex-col items-center gap-1 rounded py-2 px-1 border text-center transition-all duration-200",
                isActive ? ac.groupTab : "border-transparent text-text-muted hover:text-text-secondary hover:border-white/8"
              )}
            >
              <span className={cn("transition-colors", isActive ? "" : "opacity-60")}>{g.icon}</span>
              <span className="font-mono text-[8px] tracking-widest uppercase leading-none">
                {g.shortLabel}
              </span>
              <span className={cn(
                "rounded-full px-1.5 py-px font-mono text-[7px] font-bold tabular-nums",
                isActive ? ac.groupCount : "bg-white/6 text-text-muted"
              )}>
                {total}
              </span>
            </button>
          );
        })}
      </div>

      {/* ── Scrollable sub-category pill strip ──────────────────────────────── */}
      <div className="shrink-0 border-b border-white/5 bg-black/15">
        <div className="flex gap-1.5 px-3 py-2 overflow-x-auto scrollbar-none">
          {subCats.map((catId) => {
            const cfg      = SUB_CAT_CONFIG[catId];
            const isActive = activeCategory === catId;
            const count    = assetCategoryMap[catId]?.length ?? 0;
            return (
              <button
                key={catId}
                onClick={() => setActiveCategory(catId)}
                className={cn(
                  "flex items-center gap-1 rounded border px-2.5 py-1.5 shrink-0 transition-all duration-200",
                  "font-mono text-[8px] tracking-widest uppercase",
                  isActive
                    ? accent.subPillActive
                    : cn("border-border/30 text-text-muted", accent.subPillHover)
                )}
              >
                {cfg.icon}
                <span>{cfg.label}</span>
                <span className={cn(
                  "rounded-full px-1 py-px text-[6px] font-bold tabular-nums",
                  isActive ? "opacity-70" : "opacity-40"
                )}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Active context strip ─────────────────────────────────────────────── */}
      <div className="shrink-0 flex items-center justify-between px-3 py-1.5 border-b border-white/5 bg-black/10">
        <p className="font-mono text-[8px] text-text-muted tracking-[0.18em] uppercase">
          {GROUP_CONFIG.find((g) => g.id === activeGroup)?.label} · {SUB_CAT_CONFIG[activeCategory]?.label}
        </p>
        <span className="font-mono text-[8px] text-text-muted tabular-nums">
          {assets.length} item{assets.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* ── Asset grid ───────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-track-transparent scrollbar-thumb-white/10 p-3">
        {assets.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 gap-2">
            <span className="text-2xl opacity-20 select-none">⬡</span>
            <p className="font-mono text-[9px] text-text-muted tracking-widest text-center">
              No assets in this category
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {assets.map((asset) => (
              <AssetCard
                key={asset.id}
                asset={asset}
                accent={accent}
                status={injectionStatus[asset.id] ?? { state: "idle" }}
                onInject={handleInject}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Footer key binding hints ─────────────────────────────────────────── */}
      <div className="shrink-0 px-4 py-3 border-t border-white/5 bg-black/20">
        <div className="flex flex-col gap-0.5">
          {[
            "← → ↑ ↓   Translate selected on XZ plane",
            "Click model in scene to re-select",
            "Click empty ground to update origin",
          ].map((hint) => (
            <p key={hint} className="font-mono text-[7.5px] text-text-muted tracking-wide leading-relaxed">
              {hint}
            </p>
          ))}
        </div>
      </div>
    </div>
  );
}
