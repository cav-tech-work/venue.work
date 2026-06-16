"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ScanLine,
  MapPin,
  Layers,
  Cpu,
  ChevronRight,
  Zap,
  Shield,
  BarChart3,
  Globe,
  Building2,
  Check,
  ArrowRight,
  Radio,
  Box,
  Network,
  IndianRupee,
  Users,
  AlertTriangle,
  BadgeCheck,
  CalendarDays,
  Landmark,
  Siren,
  FlameKindling,
  ListChecks,
  ClipboardList,
} from "lucide-react";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { venues, type VenueProfile } from "@/data/venues";

function cn(...inputs: Parameters<typeof clsx>): string {
  return twMerge(clsx(inputs));
}

/* ─── Types ──────────────────────────────────────────────────────────── */
interface FeatureItem {
  id: string;
  label: string;
  status: "live" | "beta" | "upcoming";
  category: string;
}

/* ─── Data ───────────────────────────────────────────────────────────── */
const FEATURES: FeatureItem[] = [
  { id: "f1", label: "Sub-millimeter LiDAR point cloud capture", status: "live", category: "Scanning" },
  { id: "f2", label: "Real-time mesh reconstruction pipeline", status: "live", category: "Scanning" },
  { id: "f3", label: "Ambient occlusion + PBR material baking", status: "live", category: "Rendering" },
  { id: "f4", label: "Multi-camera 360° photogrammetry fusion", status: "beta", category: "Scanning" },
  { id: "f5", label: "AI-driven seat capacity heatmap overlay", status: "live", category: "AI" },
  { id: "f6", label: "Crowd-flow simulation & egress modelling", status: "beta", category: "AI" },
  { id: "f7", label: "Acoustic resonance zone mapping", status: "live", category: "Intelligence" },
  { id: "f8", label: "Structural load-bearing zone annotation", status: "live", category: "Intelligence" },
  { id: "f9", label: "Real-time IoT sensor data overlay", status: "beta", category: "Integration" },
  { id: "f10", label: "BIM / IFC file export & import pipeline", status: "live", category: "Integration" },
  { id: "f11", label: "Multiplayer co-presence collaboration layer", status: "upcoming", category: "Collaboration" },
  { id: "f12", label: "Version-diffed spatial change detection", status: "upcoming", category: "Intelligence" },
];

/** Formats a rupee value with Indian lakh/crore notation for display. */
function formatINR(amount: number): string {
  if (amount >= 10_000_000) return `₹${(amount / 10_000_000).toFixed(2)}Cr`;
  if (amount >= 100_000)    return `₹${(amount / 100_000).toFixed(2)}L`;
  return `₹${amount.toLocaleString("en-IN")}`;
}

const STATUS_STYLE: Record<FeatureItem["status"], string> = {
  live: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  beta: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  upcoming: "bg-zinc-800 text-zinc-500 border-zinc-700/40",
};

/* ─── Sub-components ─────────────────────────────────────────────────── */

function NavBar() {
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 md:px-12 h-16 border-b border-border/60 backdrop-blur-xl bg-background/70">
      <div className="flex items-center gap-3">
        <div className="relative flex h-7 w-7 items-center justify-center rounded bg-accent/10 border border-accent/30">
          <Box className="h-3.5 w-3.5 text-accent" />
          <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-cyan-400 animate-ping-slow" />
        </div>
        <span className="font-mono text-sm font-semibold tracking-widest text-text-primary uppercase">
          Venue<span className="text-accent">Platform</span>
        </span>
      </div>

      <div className="hidden md:flex items-center gap-8">
        {["Solutions", "Technology", "Locations", "Pricing"].map((item) => (
          <button
            key={item}
            className="text-xs font-medium text-text-secondary hover:text-text-primary transition-colors uppercase tracking-wider"
          >
            {item}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <button className="hidden md:block text-xs text-text-secondary hover:text-text-primary transition-colors font-medium">
          Sign In
        </button>
        {/* Clean-slate editor entry — no venue context required */}
        <Link
          href="/editor"
          className="hidden md:flex items-center gap-1.5 rounded-sm border border-border/60 px-3 py-1.5 text-xs font-medium text-text-secondary hover:border-accent/35 hover:text-accent hover:bg-accent/5 transition-all duration-150"
        >
          <Layers className="h-3 w-3" />
          Editor
        </Link>
        <Link
          href="/viewer"
          className="flex items-center gap-1.5 rounded-sm bg-accent px-4 py-2 text-xs font-semibold text-white hover:bg-accent-dim transition-colors"
        >
          Launch Viewer
          <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </nav>
  );
}

function ScanViewport() {
  const [isScanning, setIsScanning] = useState(false);

  return (
    <div className="relative w-full max-w-2xl mx-auto aspect-video rounded border border-border bg-surface/40 frame-bracket overflow-hidden group">
      {/* Grid overlay */}
      <div
        className="absolute inset-0 opacity-30"
        style={{
          backgroundImage:
            "linear-gradient(rgba(99,102,241,0.15) 1px, transparent 1px), linear-gradient(90deg, rgba(99,102,241,0.15) 1px, transparent 1px)",
          backgroundSize: "32px 32px",
        }}
      />

      {/* Scan beam (active when scanning) */}
      {isScanning && (
        <div className="scan-beam-container">
          <div className="scan-beam" />
        </div>
      )}

      {/* Corner HUD labels */}
      <span className="absolute top-3 left-3 font-mono text-[10px] text-cyan-400/70 tracking-widest uppercase z-10">
        SCAN::LIVE
      </span>
      <span className="absolute top-3 right-3 font-mono text-[10px] text-text-muted tracking-widest z-10">
        {isScanning ? (
          <span className="text-emerald-400 animate-flicker">● REC</span>
        ) : (
          "● STANDBY"
        )}
      </span>
      <span className="absolute bottom-3 left-3 font-mono text-[10px] text-text-muted z-10">
        RES 8192×4096 · LiDAR FREQ 320Hz
      </span>
      <span className="absolute bottom-3 right-3 font-mono text-[10px] text-text-muted z-10">
        Δ 0.00{isScanning ? "3" : "0"}mm
      </span>

      {/* Mock 3D wireframe point cloud */}
      <div className="absolute inset-0 flex items-center justify-center z-10">
        <svg
          viewBox="0 0 480 270"
          className="w-[85%] opacity-40 group-hover:opacity-60 transition-opacity duration-700"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Isometric floor grid */}
          {Array.from({ length: 9 }).map((_, i) => (
            <line
              key={`v${i}`}
              x1={60 + i * 40}
              y1={80}
              x2={60 + i * 40}
              y2={210}
              stroke="rgba(99,102,241,0.25)"
              strokeWidth="0.5"
            />
          ))}
          {Array.from({ length: 7 }).map((_, i) => (
            <line
              key={`h${i}`}
              x1={60}
              y1={80 + i * 21.6}
              x2={380}
              y2={80 + i * 21.6}
              stroke="rgba(99,102,241,0.2)"
              strokeWidth="0.5"
            />
          ))}
          {/* Stage box wireframe */}
          <rect x="140" y="120" width="200" height="90" fill="none" stroke="rgba(99,102,241,0.6)" strokeWidth="1" />
          <rect x="160" y="100" width="160" height="30" fill="none" stroke="rgba(34,211,238,0.5)" strokeWidth="0.8" />
          {/* Vertical pillars */}
          {[150, 220, 290, 330].map((x, i) => (
            <line key={`p${i}`} x1={x} y1={210} x2={x} y2={120} stroke="rgba(99,102,241,0.4)" strokeWidth="1" />
          ))}
          {/* Point cloud dots */}
          {[
            [100, 95], [130, 88], [160, 92], [200, 85], [240, 82], [280, 87], [320, 91], [355, 96],
            [105, 140], [145, 135], [195, 130], [245, 128], [295, 133], [340, 138], [375, 143],
          ].map(([cx, cy], i) => (
            <circle key={`dot${i}`} cx={cx} cy={cy} r="1.5" fill="rgba(34,211,238,0.7)" />
          ))}
        </svg>
      </div>

      {/* Centre scan button */}
      <button
        onClick={() => setIsScanning((p) => !p)}
        className={cn(
          "absolute inset-0 flex flex-col items-center justify-center z-20 gap-3 transition-all duration-300",
          isScanning ? "opacity-0 pointer-events-none" : "opacity-100 hover:bg-accent/5"
        )}
      >
        <div className="flex h-14 w-14 items-center justify-center rounded-full border border-accent/40 bg-accent/10 backdrop-blur-sm hover:border-accent/80 hover:bg-accent/20 transition-all duration-200 hover:shadow-glow-accent">
          <ScanLine className="h-6 w-6 text-accent" />
        </div>
        <span className="font-mono text-[11px] text-text-muted tracking-widest uppercase">
          Click to Initialise Scan
        </span>
      </button>

      {isScanning && (
        <button
          onClick={() => setIsScanning(false)}
          className="absolute bottom-10 left-1/2 -translate-x-1/2 z-30 font-mono text-[10px] text-red-400/70 hover:text-red-400 tracking-widest uppercase border border-red-500/20 rounded px-3 py-1.5 transition-colors"
        >
          Abort Scan
        </button>
      )}
    </div>
  );
}

function FeatureMatrix() {
  const [activeFilter, setActiveFilter] = useState<string>("All");
  const categories = ["All", ...Array.from(new Set(FEATURES.map((f) => f.category)))];

  const filtered =
    activeFilter === "All" ? FEATURES : FEATURES.filter((f) => f.category === activeFilter);

  return (
    <section className="relative z-10 py-24 px-6 md:px-12 max-w-6xl mx-auto">
      <div className="mb-12 animate-fade-up">
        <p className="font-mono text-[11px] text-accent tracking-[0.2em] uppercase mb-3">
          Capability Matrix
        </p>
        <h2 className="text-3xl md:text-4xl font-bold text-text-primary leading-tight mb-4">
          Industrial-grade feature
          <br />
          <span className="text-accent text-glow-accent">checklist.</span>
        </h2>
        <p className="text-text-secondary max-w-lg text-sm leading-relaxed">
          Every scanning, rendering, and intelligence primitive you need — production-hardened and
          deployed at scale across 40+ global venues.
        </p>
      </div>

      {/* Category filters */}
      <div className="flex flex-wrap gap-2 mb-8 animate-fade-up animate-fade-up-delay-1">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveFilter(cat)}
            className={cn(
              "px-3 py-1.5 rounded text-xs font-mono uppercase tracking-wider border transition-all duration-150",
              activeFilter === cat
                ? "bg-accent/15 border-accent/40 text-accent"
                : "border-border text-text-muted hover:border-border hover:text-text-secondary bg-transparent"
            )}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Feature grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 animate-fade-up animate-fade-up-delay-2">
        {filtered.map((feat) => (
          <div
            key={feat.id}
            className="group flex items-start gap-3 rounded border border-border/60 bg-surface/50 p-4 hover:border-border hover:bg-card transition-all duration-200"
          >
            <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded bg-accent/10 border border-accent/20 group-hover:border-accent/40 transition-colors">
              <Check className="h-3 w-3 text-accent" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-text-secondary group-hover:text-text-primary transition-colors leading-snug">
                {feat.label}
              </p>
              <div className="mt-2 flex items-center gap-2">
                <span
                  className={cn(
                    "inline-block rounded px-1.5 py-0.5 text-[10px] font-mono uppercase tracking-wider border",
                    STATUS_STYLE[feat.status]
                  )}
                >
                  {feat.status}
                </span>
                <span className="text-[10px] text-text-muted font-mono">{feat.category}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/** Jurisdiction icon map — maps field label to its lucide icon. */
const JURISDICTION_ICONS = {
  municipalCorporation: Landmark,
  policeDivision: Siren,
  fireZone: FlameKindling,
} as const;

function LocationPicker() {
  const [activeId, setActiveId]       = useState<string>(venues[0].id);
  const [regulatoryTab, setRegulatoryTab] = useState<"steps" | "permits">("steps");
  const venue: VenueProfile = venues.find((v) => v.id === activeId) ?? venues[0];

  /** Next three available dates formatted for compact display. */
  const upcomingDates = venue.availableDates.slice(0, 3).map((iso) =>
    new Date(iso).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    })
  );

  return (
    <section className="relative z-10 py-24 px-6 md:px-12 border-t border-border/50">
      <div className="max-w-6xl mx-auto">

        {/* Section header */}
        <div className="mb-10 animate-fade-up">
          <p className="font-mono text-[11px] text-cyan-400 tracking-[0.2em] uppercase mb-3">
            Kolkata Venue Collection
          </p>
          <h2 className="text-3xl md:text-4xl font-bold text-text-primary mb-4">
            Select your premium{" "}
            <span className="text-cyan-400 text-glow-cyan">venue.</span>
          </h2>
          <p className="text-text-secondary max-w-lg text-sm leading-relaxed">
            High-fidelity 3DGS scan archives for Kolkata&apos;s top-tier event venues. Click a card
            to inspect live pricing, spatial capacity, and regulatory compliance requirements.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">

          {/* ── Venue list (left column) ────────────────────────────────── */}
          <div className="lg:col-span-2 flex flex-col gap-2 animate-fade-up animate-fade-up-delay-1">
            {venues.map((v) => (
              <button
                key={v.id}
                onClick={() => { setActiveId(v.id); setRegulatoryTab("steps"); }}
                className={cn(
                  "flex items-center gap-4 rounded border p-4 text-left transition-all duration-200",
                  activeId === v.id
                    ? "border-cyan-500/40 bg-cyan-500/5 shadow-glow-cyan"
                    : "border-border/50 bg-surface/30 hover:border-border hover:bg-surface/60"
                )}
              >
                <div
                  className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded border transition-colors",
                    activeId === v.id
                      ? "border-cyan-500/50 bg-cyan-500/10"
                      : "border-border bg-card"
                  )}
                >
                  <MapPin
                    className={cn(
                      "h-4 w-4",
                      activeId === v.id ? "text-cyan-400" : "text-text-muted"
                    )}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <p
                    className={cn(
                      "text-sm font-medium truncate transition-colors",
                      activeId === v.id ? "text-text-primary" : "text-text-secondary"
                    )}
                  >
                    {v.name}
                  </p>
                  <p className="font-mono text-[10px] text-text-muted mt-0.5 tracking-wider">
                    {v.area} · {v.city}
                  </p>
                </div>
                {/* Rate badge */}
                <span
                  className={cn(
                    "shrink-0 font-mono text-[10px] tracking-wider text-right leading-snug",
                    activeId === v.id ? "text-cyan-400" : "text-text-muted"
                  )}
                >
                  {formatINR(v.ratePerDay)}
                  <br />
                  <span className="text-[9px] opacity-60">/day</span>
                </span>
              </button>
            ))}
          </div>

          {/* ── Detail panel (right column) ────────────────────────────── */}
          <div className="lg:col-span-3 animate-fade-up animate-fade-up-delay-2">
            <div className="gradient-border rounded flex flex-col gap-0 overflow-hidden">

              {/* ── Panel header ─────────────────────────────────────────── */}
              <div className="p-5 border-b border-border/50 flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-lg font-bold text-text-primary leading-tight">
                    {venue.name}
                  </h3>
                  <p className="font-mono text-[10px] text-text-muted mt-1 tracking-widest uppercase">
                    {venue.area} · {venue.city}, {venue.state}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0 rounded border border-emerald-500/25 bg-emerald-500/5 px-2.5 py-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-ping-slow" />
                  <span className="font-mono text-[10px] text-emerald-400 tracking-wider">SCAN LIVE</span>
                </div>
              </div>

              {/* ── Key metrics row ──────────────────────────────────────── */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-border/30">
                {[
                  {
                    label: "Daily Rate",
                    value: formatINR(venue.ratePerDay),
                    icon: IndianRupee,
                    accent: "text-amber-400",
                  },
                  {
                    label: "Max Capacity",
                    value: venue.capacity.toLocaleString("en-IN"),
                    icon: Users,
                    accent: "text-cyan-400",
                  },
                  {
                    label: "Scan Resolution",
                    value: "8K · 0.1mm",
                    icon: ScanLine,
                    accent: "text-accent",
                  },
                  {
                    label: "Next Available",
                    value: upcomingDates[0] ?? "TBD",
                    icon: CalendarDays,
                    accent: "text-emerald-400",
                  },
                ].map(({ label, value, icon: Icon, accent }) => (
                  <div
                    key={label}
                    className="flex flex-col gap-1.5 bg-surface/60 px-4 py-3"
                  >
                    <div className="flex items-center gap-1.5">
                      <Icon className={cn("h-3 w-3", accent)} />
                      <span className="font-mono text-[9px] text-text-muted uppercase tracking-widest">
                        {label}
                      </span>
                    </div>
                    <p className={cn("font-mono text-sm font-semibold", accent)}>{value}</p>
                  </div>
                ))}
              </div>

              {/* ── Regulatory jurisdiction dashboard ────────────────────── */}
              <div className="p-5 border-b border-border/50">

                {/* Header */}
                <div className="flex items-center gap-2 mb-4">
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
                  <p className="font-mono text-[10px] text-amber-400 uppercase tracking-[0.18em]">
                    Regulatory Compliance Matrix
                  </p>
                </div>

                {/* Authority trinity — office routing cards */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-4">
                  {(
                    [
                      ["municipalCorporation", venue.regulatoryJurisdiction.municipalCorporation, "Municipal Corp"],
                      ["policeDivision",       venue.regulatoryJurisdiction.policeDivision,       "Police Division"],
                      ["fireZone",             venue.regulatoryJurisdiction.fireZone,             "Fire Zone"],
                    ] as const
                  ).map(([key, value, shortLabel]) => {
                    const Icon = JURISDICTION_ICONS[key];
                    return (
                      <div
                        key={key}
                        className="rounded border border-border/50 bg-background/50 px-3 py-2.5"
                      >
                        <div className="flex items-center gap-1.5 mb-1.5">
                          <Icon className="h-3 w-3 text-text-muted shrink-0" />
                          <span className="font-mono text-[9px] text-text-muted uppercase tracking-widest">
                            {shortLabel}
                          </span>
                        </div>
                        <p className="text-[11px] text-text-secondary leading-relaxed">{value}</p>
                      </div>
                    );
                  })}
                </div>

                {/* Tab toggle — Checklist Steps vs Permit List */}
                <div className="flex rounded border border-border/50 overflow-hidden mb-3">
                  <button
                    onClick={() => setRegulatoryTab("steps")}
                    className={cn(
                      "flex flex-1 items-center justify-center gap-1.5 py-2 text-[10px] font-mono uppercase tracking-wider transition-colors",
                      regulatoryTab === "steps"
                        ? "bg-amber-500/10 text-amber-400 border-r border-border/50"
                        : "bg-transparent text-text-muted hover:text-text-secondary border-r border-border/50"
                    )}
                  >
                    <ListChecks className="h-3 w-3" />
                    Clearance Steps ({venue.regulatoryJurisdiction.checklistSteps.length})
                  </button>
                  <button
                    onClick={() => setRegulatoryTab("permits")}
                    className={cn(
                      "flex flex-1 items-center justify-center gap-1.5 py-2 text-[10px] font-mono uppercase tracking-wider transition-colors",
                      regulatoryTab === "permits"
                        ? "bg-amber-500/10 text-amber-400"
                        : "bg-transparent text-text-muted hover:text-text-secondary"
                    )}
                  >
                    <ClipboardList className="h-3 w-3" />
                    Permits &amp; NOCs ({venue.regulatoryJurisdiction.licenseRequirements.length})
                  </button>
                </div>

                {/* Tab content */}
                {regulatoryTab === "steps" ? (
                  /* ── Sequential clearance steps ──────────────────────────── */
                  <div className="rounded border border-amber-500/15 bg-amber-500/5 p-3 max-h-56 overflow-y-auto">
                    <ol className="flex flex-col gap-3">
                      {venue.regulatoryJurisdiction.checklistSteps.map((step, i) => (
                        <li key={i} className="flex items-start gap-2.5">
                          <span className="shrink-0 flex h-4 w-4 items-center justify-center rounded-full bg-amber-500/20 border border-amber-500/30 font-mono text-[9px] text-amber-400 mt-0.5">
                            {i + 1}
                          </span>
                          <span className="text-[11px] text-text-secondary leading-relaxed">{step}</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                ) : (
                  /* ── Permit & NOC checklist ───────────────────────────────── */
                  <div className="rounded border border-amber-500/15 bg-amber-500/5 p-3 max-h-56 overflow-y-auto">
                    <ul className="flex flex-col gap-1.5">
                      {venue.regulatoryJurisdiction.licenseRequirements.map((req) => (
                        <li key={req} className="flex items-start gap-2">
                          <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-amber-500/60 mt-px" />
                          <span className="text-[11px] text-text-secondary leading-snug">{req}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {/* ── Upcoming dates strip ─────────────────────────────────── */}
              <div className="px-5 py-3 border-b border-border/50 flex items-center gap-3 flex-wrap">
                <span className="font-mono text-[9px] text-text-muted uppercase tracking-widest shrink-0">
                  Next Available:
                </span>
                {upcomingDates.map((d) => (
                  <span
                    key={d}
                    className="rounded border border-border/60 bg-surface/50 px-2 py-1 font-mono text-[10px] text-text-secondary"
                  >
                    {d}
                  </span>
                ))}
                <span className="font-mono text-[10px] text-text-muted">
                  +{venue.availableDates.length - 3} more
                </span>
              </div>

              {/* ── CTA ─────────────────────────────────────────────────── */}
              <div className="p-5">
                <Link
                  href={`/viewer?id=${venue.id}`}
                  className="flex items-center justify-center gap-2.5 rounded border border-cyan-500/30 bg-cyan-500/8 px-4 py-3 text-sm font-semibold text-cyan-400 hover:border-cyan-500/60 hover:bg-cyan-500/15 transition-all duration-200 group"
                >
                  <Layers className="h-4 w-4" />
                  Enter Immersive Viewer — {venue.name}
                  <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
                </Link>
                <p className="mt-2 text-center font-mono text-[9px] text-text-muted tracking-widest uppercase">
                  Routing to /viewer?id={venue.id}
                </p>
              </div>

            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function StatsBar() {
  const stats = [
    { label: "Venues Indexed", value: "2,400+", icon: Building2 },
    { label: "Scan Accuracy", value: "0.1mm", icon: ScanLine },
    { label: "Countries", value: "62", icon: Globe },
    { label: "Data Processed", value: "18.4 PB", icon: Cpu },
  ];

  return (
    <div className="relative z-10 border-y border-border/50 py-6">
      <div className="max-w-6xl mx-auto px-6 md:px-12 grid grid-cols-2 md:grid-cols-4 gap-6">
        {stats.map(({ label, value, icon: Icon }) => (
          <div key={label} className="flex items-center gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded border border-border bg-surface">
              <Icon className="h-4 w-4 text-text-muted" />
            </div>
            <div>
              <p className="text-lg font-bold text-text-primary leading-none">{value}</p>
              <p className="font-mono text-[10px] text-text-muted tracking-wider mt-0.5">{label}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Page ───────────────────────────────────────────────────────────── */
export default function HomePage() {
  return (
    <div className="relative min-h-screen bg-premium-grid overflow-x-hidden">
      {/* Global scan beam across full page */}
      <div className="scan-beam-container fixed inset-0 pointer-events-none z-0">
        <div className="scan-beam" style={{ "--scan-speed": "6s" } as React.CSSProperties} />
      </div>

      <NavBar />

      {/* ── Hero ──────────────────────────────────────────────────────── */}
      <section className="relative z-10 pt-36 pb-24 px-6 md:px-12 flex flex-col items-center text-center max-w-6xl mx-auto">
        {/* Status chip */}
        <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-accent/25 bg-accent/8 px-4 py-2 animate-fade-up">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-accent" />
          </span>
          <span className="font-mono text-[11px] text-accent tracking-[0.15em] uppercase">
            Platform v2.4 — LiDAR Engine Active
          </span>
          <Radio className="h-3 w-3 text-accent/60" />
        </div>

        <h1 className="text-5xl md:text-7xl font-black leading-[0.92] tracking-tight text-text-primary mb-6 animate-fade-up animate-fade-up-delay-1">
          Scan. Model.
          <br />
          <span className="text-accent text-glow-accent">Experience.</span>
        </h1>

        <p className="max-w-xl text-base md:text-lg text-text-secondary leading-relaxed mb-10 animate-fade-up animate-fade-up-delay-2">
          Sub-millimeter LiDAR capture meets real-time 3D rendering. The industrial-grade spatial
          intelligence platform for world-class venues.
        </p>

        {/* CTA row */}
        <div className="flex flex-col sm:flex-row items-center gap-4 mb-16 animate-fade-up animate-fade-up-delay-3">
          <Link
            href="/viewer"
            className="group flex items-center gap-2.5 rounded-sm bg-accent px-7 py-3.5 text-sm font-bold text-white hover:bg-accent-dim transition-all duration-200 shadow-glow-accent hover:shadow-[0_0_60px_-8px_rgba(99,102,241,0.6)]"
          >
            Enter Immersive Viewer
            <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
          </Link>
          <button className="flex items-center gap-2 rounded-sm border border-border px-7 py-3.5 text-sm font-medium text-text-secondary hover:border-border hover:text-text-primary hover:bg-surface/40 transition-all duration-200">
            <Zap className="h-4 w-4" />
            Request a Live Demo
          </button>
        </div>

        {/* 3D Scan Viewport */}
        <div className="w-full animate-fade-up animate-fade-up-delay-4">
          <ScanViewport />
          <p className="mt-3 font-mono text-[10px] text-text-muted tracking-widest text-center uppercase">
            Interactive Preview · Click viewport to initialise mock scan sequence
          </p>
        </div>
      </section>

      {/* ── Stats Bar ────────────────────────────────────────────────── */}
      <StatsBar />

      {/* ── Feature Checklist Matrix ──────────────────────────────────── */}
      <FeatureMatrix />

      {/* ── Divider ────────────────────────────────────────────────────── */}
      <div className="relative z-10 max-w-6xl mx-auto px-6 md:px-12">
        <div className="h-px bg-gradient-to-r from-transparent via-border to-transparent" />
      </div>

      {/* ── Location Picker ───────────────────────────────────────────── */}
      <LocationPicker />

      {/* ── Final CTA ─────────────────────────────────────────────────── */}
      <section className="relative z-10 py-32 px-6 md:px-12 text-center border-t border-border/50">
        <div className="max-w-3xl mx-auto">
          <p className="font-mono text-[11px] text-accent tracking-[0.2em] uppercase mb-4 animate-fade-up">
            Ready to deploy
          </p>
          <h2 className="text-4xl md:text-6xl font-black text-text-primary leading-tight mb-6 animate-fade-up animate-fade-up-delay-1">
            Step inside the
            <br />
            <span className="text-accent text-glow-accent">spatial layer.</span>
          </h2>
          <p className="text-text-secondary text-base leading-relaxed mb-10 animate-fade-up animate-fade-up-delay-2">
            The immersive 3D viewer loads your venue in seconds. Real geometry, real materials,
            real intelligence — rendered at 60fps in the browser.
          </p>
          <Link
            href="/viewer"
            className="group inline-flex items-center gap-3 rounded-sm bg-accent px-10 py-4 text-base font-bold text-white hover:bg-accent-dim transition-all duration-200 shadow-glow-accent hover:shadow-[0_0_80px_-8px_rgba(99,102,241,0.7)] animate-fade-up animate-fade-up-delay-3"
          >
            <Layers className="h-5 w-5" />
            Enter Immersive Viewer
            <ArrowRight className="h-5 w-5 group-hover:translate-x-1 transition-transform" />
          </Link>
        </div>
      </section>

      {/* ── Footer ────────────────────────────────────────────────────── */}
      <footer className="relative z-10 border-t border-border/50 px-6 md:px-12 py-8">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <span className="font-mono text-xs text-text-muted tracking-widest uppercase">
            © 2026 VenuePlatform · All rights reserved
          </span>
          <div className="flex items-center gap-6">
            {["Privacy", "Terms", "Security", "Status"].map((item) => (
              <button
                key={item}
                className="font-mono text-[11px] text-text-muted hover:text-text-secondary transition-colors tracking-wider uppercase"
              >
                {item}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1.5">
            <Shield className="h-3 w-3 text-text-muted" />
            <span className="font-mono text-[10px] text-text-muted tracking-widest uppercase">
              SOC 2 Type II · ISO 27001
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
