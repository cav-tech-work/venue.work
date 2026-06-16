"use client";

import { useState, useMemo, useCallback } from "react";
import {
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  CircleCheck,
  CircleX,
  Minus,
} from "lucide-react";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import type { VenueProfile } from "@/data/venues";

function cn(...inputs: Parameters<typeof clsx>): string {
  return twMerge(clsx(inputs));
}

/* ─── Types ───────────────────────────────────────────────────────────────── */

export interface BookingCalendarProps {
  venue: VenueProfile;
  /** Optional callback fired when the user clicks an open (available) date. */
  onSelectDate?: (isoDate: string) => void;
  /** Currently selected ISO date — highlighted with an accent ring. */
  selectedDate?: string;
}

/** Classification of a calendar cell. */
type DayStatus =
  | "available"   // in venue.availableDates — open for booking
  | "occupied"    // in the calendar range but NOT in availableDates
  | "past"        // before today
  | "empty";      // padding cell outside the month

interface CalendarDay {
  /** ISO date string (YYYY-MM-DD) or null for empty padding cells. */
  iso: string | null;
  /** Day-of-month number (1–31) or null for padding cells. */
  day: number | null;
  status: DayStatus;
  /** True when this day is today. */
  isToday: boolean;
}

/* ─── Constants ───────────────────────────────────────────────────────────── */

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

const MONTH_NAMES = [
  "January", "February", "March",    "April",
  "May",     "June",     "July",     "August",
  "September", "October", "November", "December",
] as const;

/* ─── Date utilities ─────────────────────────────────────────────────────── */

/** Returns "YYYY-MM-DD" for a given year, month (1-indexed), and day. */
function toISO(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Returns today's ISO date string in the local timezone. */
function todayISO(): string {
  const d = new Date();
  return toISO(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

/** Returns the number of days in a given month (1-indexed). */
function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

/** Returns the weekday index (0=Sun…6=Sat) of the first day of a month. */
function firstWeekday(year: number, month: number): number {
  return new Date(year, month - 1, 1).getDay();
}

/* ─── Calendar grid builder ─────────────────────────────────────────────── */

/**
 * Builds a flat array of CalendarDay cells for a full 6-row × 7-col grid.
 * Leading and trailing padding cells have `status: "empty"`.
 */
function buildCalendarGrid(
  year: number,
  month: number,
  availableSet: Set<string>
): CalendarDay[] {
  const today = todayISO();
  const totalDays  = daysInMonth(year, month);
  const startPad   = firstWeekday(year, month);
  const cells: CalendarDay[] = [];

  // Leading empty padding
  for (let i = 0; i < startPad; i++) {
    cells.push({ iso: null, day: null, status: "empty", isToday: false });
  }

  // Actual days
  for (let d = 1; d <= totalDays; d++) {
    const iso = toISO(year, month, d);
    const isPast = iso < today;

    let status: DayStatus;
    if (isPast) {
      status = "past";
    } else if (availableSet.has(iso)) {
      status = "available";
    } else {
      status = "occupied";
    }

    cells.push({ iso, day: d, status, isToday: iso === today });
  }

  // Trailing empty padding — fill to the next multiple of 7
  const remainder = cells.length % 7;
  if (remainder !== 0) {
    for (let i = 0; i < 7 - remainder; i++) {
      cells.push({ iso: null, day: null, status: "empty", isToday: false });
    }
  }

  return cells;
}

/* ─── Sub-components ──────────────────────────────────────────────────────── */

/** Top status key legend. */
function StatusKey({ availableCount, occupiedCount }: { availableCount: number; occupiedCount: number }) {
  return (
    <div className="flex items-center gap-4 flex-wrap">
      {/* Open */}
      <div className="flex items-center gap-1.5">
        <span className="h-3 w-3 rounded-sm bg-zinc-700/80 border border-zinc-600/60 shrink-0" />
        <span className="font-mono text-[9px] text-zinc-400 uppercase tracking-widest">
          Open · {availableCount}
        </span>
      </div>
      {/* Occupied */}
      <div className="flex items-center gap-1.5">
        <span className="h-3 w-3 rounded-sm bg-indigo-500/25 border border-indigo-400/40 shrink-0" />
        <span className="font-mono text-[9px] text-indigo-400 uppercase tracking-widest">
          Occupied · {occupiedCount}
        </span>
      </div>
      {/* Past */}
      <div className="flex items-center gap-1.5">
        <span className="h-3 w-3 rounded-sm bg-zinc-900 border border-zinc-800 shrink-0" />
        <span className="font-mono text-[9px] text-zinc-600 uppercase tracking-widest">
          Past
        </span>
      </div>
      {/* Today */}
      <div className="flex items-center gap-1.5">
        <span className="h-3 w-3 rounded-sm bg-transparent border border-accent shrink-0 ring-1 ring-accent/30" />
        <span className="font-mono text-[9px] text-accent/80 uppercase tracking-widest">
          Today
        </span>
      </div>
    </div>
  );
}

interface DayCellProps {
  cell: CalendarDay;
  isSelected: boolean;
  onSelect: (iso: string) => void;
}

/** Single calendar day cell. */
function DayCell({ cell, isSelected, onSelect }: DayCellProps) {
  if (cell.status === "empty" || cell.iso === null || cell.day === null) {
    return <div className="aspect-square" />;
  }

  const isClickable = cell.status === "available";

  return (
    <button
      type="button"
      disabled={!isClickable}
      onClick={() => isClickable && onSelect(cell.iso!)}
      className={cn(
        "relative aspect-square flex flex-col items-center justify-center rounded transition-all duration-150 select-none group",

        // ── Available — silver/zinc open slot ─────────────────────────────
        cell.status === "available" && !isSelected && [
          "bg-zinc-800/70 border border-zinc-600/50",
          "hover:bg-zinc-700/80 hover:border-zinc-500/70",
          "cursor-pointer",
        ],

        // ── Available + selected ──────────────────────────────────────────
        cell.status === "available" && isSelected && [
          "bg-zinc-700/90 border border-accent",
          "ring-2 ring-accent/30",
          "cursor-pointer",
        ],

        // ── Occupied — indigo badge block ─────────────────────────────────
        cell.status === "occupied" && [
          "bg-indigo-500/18 border border-indigo-400/35",
          "cursor-default",
        ],

        // ── Past — near-invisible ─────────────────────────────────────────
        cell.status === "past" && [
          "bg-zinc-950 border border-zinc-800/40",
          "cursor-default",
          "opacity-40",
        ],

        // ── Today ring ────────────────────────────────────────────────────
        cell.isToday && "ring-2 ring-accent/60 ring-offset-1 ring-offset-background",
      )}
      aria-label={`${cell.iso} — ${cell.status}`}
      title={`${cell.iso} · ${cell.status === "available" ? "Open" : cell.status === "occupied" ? "Occupied" : "Past"}`}
    >
      {/* Day number */}
      <span
        className={cn(
          "font-mono text-xs leading-none transition-colors",
          cell.status === "available" && !isSelected && "text-zinc-300",
          cell.status === "available" && isSelected  && "text-white font-semibold",
          cell.status === "occupied"                 && "text-indigo-300/80 font-medium",
          cell.status === "past"                     && "text-zinc-600",
        )}
      >
        {cell.day}
      </span>

      {/* Status micro-badge — bottom of cell */}
      {cell.status === "available" && (
        <span className="absolute bottom-1 left-1/2 -translate-x-1/2 h-1 w-1 rounded-full bg-zinc-400/60 group-hover:bg-zinc-300 transition-colors" />
      )}
      {cell.status === "occupied" && (
        <span className="absolute bottom-1 left-1/2 -translate-x-1/2 h-1 w-1 rounded-full bg-indigo-400/60" />
      )}
    </button>
  );
}

/* ─── Monthly summary strip ──────────────────────────────────────────────── */

function MonthSummary({
  availableInMonth,
  occupiedInMonth,
  totalDays,
}: {
  availableInMonth: number;
  occupiedInMonth: number;
  totalDays: number;
}) {
  const pctAvailable = totalDays > 0 ? (availableInMonth / totalDays) * 100 : 0;
  const pctOccupied  = totalDays > 0 ? (occupiedInMonth  / totalDays) * 100 : 0;

  return (
    <div className="grid grid-cols-3 gap-px bg-border/30 border-t border-border/40 shrink-0">
      {[
        {
          label: "Open Slots",
          value: availableInMonth,
          color: "text-zinc-300",
          icon: <CircleCheck className="h-3 w-3 text-zinc-400" />,
        },
        {
          label: "Occupied",
          value: occupiedInMonth,
          color: "text-indigo-400",
          icon: <CircleX className="h-3 w-3 text-indigo-400" />,
        },
        {
          label: "Availability",
          value: `${pctAvailable.toFixed(0)}%`,
          color: pctAvailable > 50 ? "text-emerald-400" : pctAvailable > 25 ? "text-amber-400" : "text-red-400",
          icon: <Minus className="h-3 w-3 text-text-muted" />,
        },
      ].map(({ label, value, color, icon }) => (
        <div key={label} className="flex flex-col items-center py-2.5 bg-background/60">
          <div className="flex items-center gap-1 mb-0.5">{icon}</div>
          <span className={cn("font-mono text-xs font-bold", color)}>{value}</span>
          <span className="font-mono text-[8px] text-text-muted uppercase tracking-widest mt-0.5">
            {label}
          </span>
        </div>
      ))}
    </div>
  );
}

/* ─── Main component ──────────────────────────────────────────────────────── */

export function BookingCalendar({
  venue,
  onSelectDate,
  selectedDate,
}: BookingCalendarProps) {
  // Derive the initial display month from the first available date, or today
  const initialDate = useMemo(() => {
    if (venue.availableDates.length > 0) {
      const first = new Date(venue.availableDates[0]);
      return { year: first.getFullYear(), month: first.getMonth() + 1 };
    }
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() + 1 };
  }, [venue.availableDates]);

  const [displayYear,  setDisplayYear]  = useState(initialDate.year);
  const [displayMonth, setDisplayMonth] = useState(initialDate.month);

  /** Fast O(1) lookup set of available ISO date strings for this venue. */
  const availableSet = useMemo(
    () => new Set(venue.availableDates),
    [venue.availableDates]
  );

  const grid = useMemo(
    () => buildCalendarGrid(displayYear, displayMonth, availableSet),
    [displayYear, displayMonth, availableSet]
  );

  /** Counts for the currently displayed month only. */
  const { availableInMonth, occupiedInMonth } = useMemo(() => {
    let avail = 0, occ = 0;
    for (const cell of grid) {
      if (cell.status === "available") avail++;
      if (cell.status === "occupied")  occ++;
    }
    return { availableInMonth: avail, occupiedInMonth: occ };
  }, [grid]);

  /** Total available across all dates in the manifest. */
  const totalAvailable = venue.availableDates.length;

  /** Total occupied = dates in this month that aren't available and aren't past. */
  const totalDaysInMonth = daysInMonth(displayYear, displayMonth);

  const navigatePrev = useCallback(() => {
    setDisplayMonth((m) => {
      if (m === 1) { setDisplayYear((y) => y - 1); return 12; }
      return m - 1;
    });
  }, []);

  const navigateNext = useCallback(() => {
    setDisplayMonth((m) => {
      if (m === 12) { setDisplayYear((y) => y + 1); return 1; }
      return m + 1;
    });
  }, []);

  const handleSelect = useCallback(
    (iso: string) => { onSelectDate?.(iso); },
    [onSelectDate]
  );

  return (
    <div className="flex flex-col rounded border border-border/60 bg-surface/80 backdrop-blur-sm overflow-hidden">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="shrink-0 px-4 py-3 border-b border-border/50 bg-background/50">
        <div className="flex items-center justify-between mb-3">
          {/* Month + year title */}
          <div className="flex items-center gap-2">
            <CalendarDays className="h-3.5 w-3.5 text-accent/70 shrink-0" />
            <h3 className="font-mono text-xs font-semibold text-text-primary tracking-widest uppercase">
              {MONTH_NAMES[displayMonth - 1]}{" "}
              <span className="text-text-muted font-normal">{displayYear}</span>
            </h3>
          </div>

          {/* Month navigation */}
          <div className="flex items-center gap-1">
            <button
              onClick={navigatePrev}
              className="flex h-6 w-6 items-center justify-center rounded border border-border/60 bg-surface/40 text-text-muted hover:border-border hover:text-text-primary transition-colors"
              aria-label="Previous month"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={navigateNext}
              className="flex h-6 w-6 items-center justify-center rounded border border-border/60 bg-surface/40 text-text-muted hover:border-border hover:text-text-primary transition-colors"
              aria-label="Next month"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Status key + total badge */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <StatusKey
            availableCount={totalAvailable}
            occupiedCount={occupiedInMonth}
          />
          <span className="font-mono text-[9px] text-text-muted tracking-widest shrink-0">
            {venue.area} · {venue.city}
          </span>
        </div>
      </div>

      {/* ── Day-of-week column labels ────────────────────────────────── */}
      <div className="shrink-0 grid grid-cols-7 border-b border-border/40 bg-background/30">
        {DAY_LABELS.map((d) => (
          <div
            key={d}
            className="py-2 flex items-center justify-center font-mono text-[9px] text-text-muted uppercase tracking-widest"
          >
            {d}
          </div>
        ))}
      </div>

      {/* ── Calendar grid ────────────────────────────────────────────── */}
      <div className="shrink-0 grid grid-cols-7 gap-1 p-3 bg-background/20">
        {grid.map((cell, idx) => (
          <DayCell
            key={cell.iso ?? `empty-${idx}`}
            cell={cell}
            isSelected={!!selectedDate && cell.iso === selectedDate}
            onSelect={handleSelect}
          />
        ))}
      </div>

      {/* ── Occupied date list ───────────────────────────────────────── */}
      {availableInMonth > 0 && (
        <div className="shrink-0 px-3 pb-3">
          <div className="rounded border border-indigo-500/15 bg-indigo-500/5 p-2.5">
            <p className="font-mono text-[9px] text-indigo-400/80 uppercase tracking-widest mb-2">
              Open in {MONTH_NAMES[displayMonth - 1]} — click to select
            </p>
            <div className="flex flex-wrap gap-1.5">
              {grid
                .filter((c) => c.status === "available" && c.iso)
                .map((c) => (
                  <button
                    key={c.iso}
                    onClick={() => handleSelect(c.iso!)}
                    className={cn(
                      "font-mono text-[10px] px-2 py-1 rounded border transition-colors",
                      selectedDate === c.iso
                        ? "bg-accent/20 border-accent/60 text-accent"
                        : "bg-zinc-800/60 border-zinc-700/50 text-zinc-300 hover:border-zinc-500 hover:text-white"
                    )}
                  >
                    {c.iso!.slice(8)}
                  </button>
                ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Month summary strip ──────────────────────────────────────── */}
      <MonthSummary
        availableInMonth={availableInMonth}
        occupiedInMonth={occupiedInMonth}
        totalDays={totalDaysInMonth}
      />

      {/* ── Selected date readout ────────────────────────────────────── */}
      {selectedDate && (
        <div className="shrink-0 flex items-center justify-between gap-3 px-4 py-2.5 border-t border-accent/20 bg-accent/5">
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-accent animate-ping-slow shrink-0" />
            <span className="font-mono text-[10px] text-accent tracking-widest uppercase">
              Selected
            </span>
          </div>
          <span className="font-mono text-xs text-text-primary font-semibold">
            {new Date(selectedDate).toLocaleDateString("en-IN", {
              weekday: "short",
              day:     "numeric",
              month:   "long",
              year:    "numeric",
            })}
          </span>
        </div>
      )}
    </div>
  );
}

export default BookingCalendar;
