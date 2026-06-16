"use client";

import { useState, useMemo, useCallback, useId } from "react";
import {
  X,
  FileText,
  CalendarDays,
  Users,
  Volume2,
  VolumeX,
  Terminal,
  ClipboardList,
  ListChecks,
  BadgeCheck,
  AlertTriangle,
  Send,
  ChevronRight,
  Landmark,
  Siren,
  FlameKindling,
  Copy,
  CheckCheck,
  Loader2,
  ShieldCheck,
  Info,
  CircleDot,
  Printer,
} from "lucide-react";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import type { VenueProfile } from "@/data/venues";

function cn(...inputs: Parameters<typeof clsx>): string {
  return twMerge(clsx(inputs));
}

/* ─── Types ───────────────────────────────────────────────────────────────── */

export interface LegalManifestPortalProps {
  venue: VenueProfile;
  onClose: () => void;
  /**
   * ISO date string pre-selected in the BookingCalendar.
   * When provided, it seeds the Event Details form's date field so the
   * user's calendar selection carries straight into the checkout flow.
   */
  prefillDate?: string;
}

interface EventFormState {
  /** ISO date string selected from the venue's available dates. */
  selectedDate: string;
  /** Projected attendee count as a string to allow empty/partial input. */
  projectedAttendance: string;
  /** Whether micro-loudspeaker arrays will be deployed at this event. */
  microSpeakersDeployed: boolean;
  /** Organiser company name for the legal manifest header. */
  organiserName: string;
  /** Primary contact email for the dispatch payload. */
  contactEmail: string;
  /** Type of event — drives manifest language. */
  eventType: EventType;
}

type EventType = "concert" | "corporate" | "wedding" | "exhibition" | "sports";

/** Active tab in the portal's main content area. */
type PortalTab = "form" | "manifest" | "checklist";

/** Dispatch state machine. */
type DispatchState = "idle" | "compiling" | "done";

/* ─── Constants ───────────────────────────────────────────────────────────── */

const EVENT_TYPE_LABELS: Record<EventType, string> = {
  concert:     "Live Music Concert / Performance",
  corporate:   "Corporate Conference / Summit",
  wedding:     "Wedding / Social Celebration",
  exhibition:  "Exhibition / Trade Fair",
  sports:      "Sports Event / Tournament",
};

const AUTHORITY_ICONS = {
  municipalCorporation: Landmark,
  policeDivision:       Siren,
  fireZone:             FlameKindling,
} as const;

/* ─── Helpers ─────────────────────────────────────────────────────────────── */

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", {
    weekday: "long",
    day:     "numeric",
    month:   "long",
    year:    "numeric",
  });
}

/** Derives the applicable noise-permit category from attendance. */
function deriveNoiseCategory(attendance: number): string {
  if (attendance >= 2000) return "Category AA — Large Public Assembly";
  if (attendance >= 500)  return "Category A — Medium Assembly";
  return "Category B — Small Gathering";
}

/* ─── Legal manifest text compiler ───────────────────────────────────────── */

/**
 * Compiles a dynamic legal authorization text block from the venue profile
 * and current event form state. Mirrors the structure of a real WB Police /
 * KMC event authorization letter.
 */
function compileLegalManifest(venue: VenueProfile, form: EventFormState): string {
  const attendance  = parseInt(form.projectedAttendance, 10) || 0;
  const noiseCategory = deriveNoiseCategory(attendance);
  const date        = form.selectedDate ? formatDate(form.selectedDate) : "[DATE NOT SELECTED]";
  const organiser   = form.organiserName.trim() || "[ORGANISER NAME PENDING]";
  const eventLabel  = EVENT_TYPE_LABELS[form.eventType];
  const speakerNote = form.microSpeakersDeployed
    ? "MICRO-LOUDSPEAKER ARRAYS: DEPLOYED — Additional WBPCB SPL monitoring schedule required."
    : "MICRO-LOUDSPEAKER ARRAYS: NOT DEPLOYED — Standard ambient monitoring applies.";

  return `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  VENUEPLAFTORM — EVENT LEGAL AUTHORIZATION MANIFEST
  Document Ref: VP-LAM-${venue.id.toUpperCase()}-${Date.now().toString(36).toUpperCase()}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

VENUE IDENTITY
  Name         : ${venue.name}
  Area         : ${venue.area}, ${venue.city}, ${venue.state}, ${venue.country}
  Venue ID     : ${venue.id}
  Max Capacity : ${venue.capacity.toLocaleString("en-IN")} pax (licensed limit)
  Contact      : ${venue.contactEmail}

EVENT PARAMETERS
  Organiser    : ${organiser}
  Contact Email: ${form.contactEmail.trim() || "[CONTACT EMAIL PENDING]"}
  Event Type   : ${eventLabel}
  Scheduled On : ${date}
  Projected PAX: ${attendance > 0 ? attendance.toLocaleString("en-IN") : "[ATTENDANCE PENDING]"}
  ${speakerNote}
  Noise Permit : ${noiseCategory}

JURISDICTIONAL ROUTING
  Municipal    : ${venue.regulatoryJurisdiction.municipalCorporation}
  Police Div.  : ${venue.regulatoryJurisdiction.policeDivision}
  Fire Zone    : ${venue.regulatoryJurisdiction.fireZone}

REQUIRED CLEARANCES (${venue.regulatoryJurisdiction.licenseRequirements.length} ITEMS)
${venue.regulatoryJurisdiction.licenseRequirements
  .map((r, i) => `  [${String(i + 1).padStart(2, "0")}] ${r}`)
  .join("\n")}

DECLARATION
  The organiser confirms that all regulatory submissions will be completed
  in accordance with the West Bengal Police Act, KMC Bye-Laws Section 484,
  and West Bengal Fire Services Act (Amended 2018) prior to the event date.
  VenuePlatform-generated spatial data is provided under Platform Terms v2.4.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Generated: ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST
  Platform : VenuePlatform Spatial Intelligence v2.4
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;
}

/* ─── Gmail deep-link compiler ────────────────────────────────────────────── */

/**
 * Builds a Gmail web-client compose deep-link URL pre-filled with a structured
 * booking + recce summary payload addressed to the venue management team.
 *
 * Opens directly in the browser Gmail interface via:
 *   https://mail.google.com/mail/?view=cm&fs=1&to=…&su=…&body=…
 */
function buildGmailUrl(venue: VenueProfile, form: EventFormState): string {
  const attendance  = parseInt(form.projectedAttendance, 10) || 0;
  const date        = form.selectedDate ? formatDate(form.selectedDate) : "TBD";
  const organiser   = form.organiserName.trim() || "VenuePlatform User";
  const eventLabel  = EVENT_TYPE_LABELS[form.eventType];
  const speakerLine = form.microSpeakersDeployed
    ? "Micro-loudspeaker arrays: WILL BE DEPLOYED (additional WBPCB SPL monitoring schedule enclosed)"
    : "Micro-loudspeaker arrays: NOT REQUIRED";

  const blockedDates = venue.availableDates
    .filter((d) => d !== form.selectedDate)
    .slice(0, 5)
    .join(", ");

  const subject = `[BOOKING ENQUIRY] ${eventLabel} — ${venue.name} — ${form.selectedDate || "Date TBD"}`;

  const body =
    `Dear ${venue.name} Events Team,\n\n` +
    `We are writing to initiate a formal booking and site recce request for your venue, ` +
    `generated via the VenuePlatform Spatial Intelligence Platform.\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `BOOKING SUMMARY\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `Organiser         : ${organiser}\n` +
    `Contact Email     : ${form.contactEmail.trim() || "See sender"}\n` +
    `Venue             : ${venue.name}, ${venue.area}, ${venue.city}\n` +
    `Event Type        : ${eventLabel}\n` +
    `Requested Date    : ${date}\n` +
    `Projected Capacity: ${attendance > 0 ? attendance.toLocaleString("en-IN") + " pax" : "TBD"} ` +
    `(licensed max: ${venue.capacity.toLocaleString("en-IN")} pax)\n` +
    `${speakerLine}\n` +
    `Daily Venue Rate  : ₹${venue.ratePerDay.toLocaleString("en-IN")}\n` +
    `Blocked Dates (ref): ${blockedDates || "See availability calendar"}\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `REGULATORY CLEARANCE STATUS\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `Jurisdictional routing confirmed as follows:\n` +
    `  Municipal : ${venue.regulatoryJurisdiction.municipalCorporation}\n` +
    `  Police    : ${venue.regulatoryJurisdiction.policeDivision}\n` +
    `  Fire Zone : ${venue.regulatoryJurisdiction.fireZone}\n\n` +
    `Clearances being compiled (${venue.regulatoryJurisdiction.licenseRequirements.length} items):\n\n` +
    venue.regulatoryJurisdiction.licenseRequirements
      .map((r, i) => `  ${i + 1}. ${r}`)
      .join("\n") +
    `\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `FORMAL BOOKING CONFIRMATION REQUEST\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `We kindly request your team to:\n` +
    `1. Confirm date availability and issue a formal hold confirmation for ${date}.\n` +
    `2. Share your standard venue booking agreement and advance payment schedule.\n` +
    `3. Schedule a physical site recce for our structural, AV, and safety teams.\n` +
    `4. Provide GST-registered invoice details for the advance booking deposit.\n` +
    `5. Confirm the name of a single point of contact for regulatory document coordination.\n\n` +
    `Our VenuePlatform spatial intelligence report for ${venue.name} — including a ` +
    `sub-millimeter LiDAR point cloud, AI-driven capacity heatmap, and egress flow ` +
    `simulation — is available for secure download upon request.\n\n` +
    `We look forward to your formal confirmation at the earliest.\n\n` +
    `Warm regards,\n` +
    `${organiser}\n` +
    `Generated via VenuePlatform Spatial Intelligence Platform v2.4\n` +
    `Reference: VP-BOOKING-${venue.id.toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;

  return (
    `https://mail.google.com/mail/?view=cm&fs=1` +
    `&to=${encodeURIComponent(venue.contactEmail)}` +
    `&su=${encodeURIComponent(subject)}` +
    `&body=${encodeURIComponent(body)}`
  );
}

/* ─── Sub-components ──────────────────────────────────────────────────────── */

/** Styled form field wrapper. */
function FieldGroup({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="font-mono text-[10px] text-text-muted uppercase tracking-widest">
        {label}
      </label>
      {children}
      {hint && (
        <p className="flex items-center gap-1 font-mono text-[9px] text-text-muted">
          <Info className="h-2.5 w-2.5 shrink-0" />
          {hint}
        </p>
      )}
    </div>
  );
}

/** Base input styles shared across text inputs and selects. */
const inputClass =
  "w-full rounded border border-border/70 bg-background/60 px-3 py-2 text-sm text-text-primary " +
  "placeholder:text-text-muted font-mono focus:outline-none focus:border-accent/60 focus:ring-1 " +
  "focus:ring-accent/20 transition-colors";

/* ─── Tab: Event Details Form ─────────────────────────────────────────────── */

function EventDetailsForm({
  venue,
  form,
  onChange,
  fieldPrefix,
}: {
  venue: VenueProfile;
  form: EventFormState;
  onChange: <K extends keyof EventFormState>(key: K, value: EventFormState[K]) => void;
  fieldPrefix: string;
}) {
  const attendance = parseInt(form.projectedAttendance, 10) || 0;
  const exceedsCapacity = attendance > venue.capacity;

  return (
    <div className="flex flex-col gap-5 p-5 overflow-y-auto flex-1">
      {/* Organiser identity */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <FieldGroup label="Organiser / Company Name" htmlFor={`${fieldPrefix}-org`}>
          <input
            id={`${fieldPrefix}-org`}
            type="text"
            value={form.organiserName}
            onChange={(e) => onChange("organiserName", e.target.value)}
            placeholder="e.g. Starlight Events Pvt. Ltd."
            className={inputClass}
          />
        </FieldGroup>
        <FieldGroup label="Primary Contact Email" htmlFor={`${fieldPrefix}-email`}>
          <input
            id={`${fieldPrefix}-email`}
            type="email"
            value={form.contactEmail}
            onChange={(e) => onChange("contactEmail", e.target.value)}
            placeholder="booking@yourcompany.in"
            className={inputClass}
          />
        </FieldGroup>
      </div>

      {/* Event type */}
      <FieldGroup label="Event Type" htmlFor={`${fieldPrefix}-type`}>
        <select
          id={`${fieldPrefix}-type`}
          value={form.eventType}
          onChange={(e) => onChange("eventType", e.target.value as EventType)}
          className={inputClass}
        >
          {(Object.entries(EVENT_TYPE_LABELS) as [EventType, string][]).map(([val, label]) => (
            <option key={val} value={val}>
              {label}
            </option>
          ))}
        </select>
      </FieldGroup>

      {/* Date picker */}
      <FieldGroup
        label="Target Event Date"
        htmlFor={`${fieldPrefix}-date`}
        hint="Only dates confirmed available in our scan archive are listed."
      >
        <select
          id={`${fieldPrefix}-date`}
          value={form.selectedDate}
          onChange={(e) => onChange("selectedDate", e.target.value)}
          className={inputClass}
        >
          <option value="">— Select an available date —</option>
          {venue.availableDates.map((d) => (
            <option key={d} value={d}>
              {formatDate(d)}
            </option>
          ))}
        </select>
      </FieldGroup>

      {/* Attendance */}
      <FieldGroup
        label={`Projected Attendance (Max: ${venue.capacity.toLocaleString("en-IN")} pax)`}
        htmlFor={`${fieldPrefix}-pax`}
        hint={
          exceedsCapacity
            ? `⚠ Exceeds licensed venue capacity of ${venue.capacity.toLocaleString("en-IN")} pax.`
            : attendance >= 1000
            ? "Mass Gathering Permit (Form MG-2) will be required."
            : attendance >= 500
            ? "Police Gathering Permit (Form GS-7) will be required."
            : ""
        }
      >
        <div className="relative">
          <Users className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-text-muted pointer-events-none" />
          <input
            id={`${fieldPrefix}-pax`}
            type="number"
            min={1}
            max={venue.capacity}
            value={form.projectedAttendance}
            onChange={(e) => onChange("projectedAttendance", e.target.value)}
            placeholder="0"
            className={cn(inputClass, "pl-9", exceedsCapacity && "border-red-500/50 focus:border-red-500/60")}
          />
        </div>
        {/* Capacity bar */}
        {attendance > 0 && (
          <div className="mt-1 h-1.5 w-full rounded-full bg-border/50 overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-300",
                exceedsCapacity ? "bg-red-500" : attendance / venue.capacity > 0.8 ? "bg-amber-500" : "bg-emerald-500"
              )}
              style={{ width: `${Math.min(100, (attendance / venue.capacity) * 100)}%` }}
            />
          </div>
        )}
      </FieldGroup>

      {/* Micro-speaker toggle — tight flex row, input pinned with explicit size classes */}
      <div className="flex items-start gap-3 rounded border border-border/60 bg-surface/40 p-4">
        <input
          id={`${fieldPrefix}-speaker`}
          type="checkbox"
          checked={form.microSpeakersDeployed}
          onChange={(e) => onChange("microSpeakersDeployed", e.target.checked)}
          className="w-4 h-4 text-indigo-600 bg-zinc-900 border-zinc-700 flex-shrink-0 mt-0.5 rounded cursor-pointer accent-indigo-600"
        />
        <label
          htmlFor={`${fieldPrefix}-speaker`}
          className="flex flex-col gap-1 cursor-pointer min-w-0"
        >
          <div className="flex items-center gap-2">
            {form.microSpeakersDeployed ? (
              <Volume2 className="h-4 w-4 text-accent shrink-0" />
            ) : (
              <VolumeX className="h-4 w-4 text-text-muted shrink-0" />
            )}
            <span className="text-sm font-medium text-text-primary">
              Micro-Loudspeaker Deployment
            </span>
          </div>
          <p className="text-xs text-text-secondary leading-snug">
            {form.microSpeakersDeployed
              ? "Arrays will be deployed. WBPCB SPL monitoring schedule required as annexure."
              : "Not required. Standard ambient noise monitoring applies under WBPCB norms."}
          </p>
        </label>
      </div>

      {/* Live noise category derived from attendance */}
      {attendance > 0 && (
        <div className="flex items-center gap-2.5 rounded border border-accent/20 bg-accent/5 px-4 py-2.5">
          <ShieldCheck className="h-4 w-4 text-accent shrink-0" />
          <div>
            <p className="font-mono text-[10px] text-text-muted uppercase tracking-widest">
              Derived Noise Permit Classification
            </p>
            <p className="text-xs text-accent font-medium mt-0.5">
              {deriveNoiseCategory(attendance)}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Tab: Legal Manifest Preview ─────────────────────────────────────────── */

function LegalManifestPreview({
  venue,
  form,
}: {
  venue: VenueProfile;
  form: EventFormState;
}) {
  const [copied, setCopied] = useState(false);
  const manifestText = useMemo(() => compileLegalManifest(venue, form), [venue, form]);

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(manifestText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }, [manifestText]);

  return (
    <div className="flex flex-col flex-1 overflow-hidden p-5 gap-3">
      {/* Toolbar */}
      <div className="flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <Terminal className="h-3.5 w-3.5 text-emerald-400" />
          <span className="font-mono text-[10px] text-emerald-400 tracking-widest uppercase">
            Live Manifest · Auto-compiled
          </span>
        </div>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 rounded border border-border/60 bg-surface/50 px-2.5 py-1.5 text-[10px] font-mono text-text-secondary hover:text-text-primary hover:border-border transition-colors"
        >
          {copied ? (
            <><CheckCheck className="h-3 w-3 text-emerald-400" /><span className="text-emerald-400">Copied</span></>
          ) : (
            <><Copy className="h-3 w-3" />Copy</>
          )}
        </button>
      </div>

      {/* Terminal document sheet */}
      <div className="flex-1 overflow-y-auto rounded border border-emerald-500/15 bg-black/60">
        <div className="flex items-center gap-1.5 px-3 py-2 border-b border-emerald-500/15">
          {["bg-red-500/60", "bg-amber-500/60", "bg-emerald-500/60"].map((c) => (
            <span key={c} className={cn("h-2 w-2 rounded-full", c)} />
          ))}
          <span className="font-mono text-[9px] text-text-muted ml-2 tracking-widest">
            vp_legal_manifest_{venue.id}.txt
          </span>
        </div>
        <pre className="p-4 font-mono text-[11px] text-emerald-300/90 leading-relaxed whitespace-pre-wrap break-words">
          {manifestText}
        </pre>
      </div>
    </div>
  );
}

/* ─── Tab: Submission Checklist ───────────────────────────────────────────── */

function SubmissionChecklist({ venue }: { venue: VenueProfile }) {
  const [checked, setChecked] = useState<Set<number>>(new Set());

  const toggle = (i: number) =>
    setChecked((prev) => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });

  const completedCount = checked.size;
  const totalSteps = venue.regulatoryJurisdiction.checklistSteps.length;
  const progressPct = totalSteps > 0 ? Math.round((completedCount / totalSteps) * 100) : 0;

  /**
   * Injects a dedicated `@media print` stylesheet that:
   *   1. Forces every container and nested checklist node to
   *      `height: auto`, `overflow: visible`, `position: static`.
   *   2. Hides non-printable view elements (3D canvas, header, sidebar,
   *      navigation) so only the legal document renders page-by-page.
   *
   * The injected <style> element is automatically removed via the browser's
   * native `afterprint` event so screen styles are never polluted.
   */
  const handlePrint = useCallback(() => {
    const STYLE_ID = 'vp-print-stylesheet';

    // Remove any stale injection from a previous print cycle
    document.getElementById(STYLE_ID)?.remove();

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      @media print {

        /* ── Page geometry ───────────────────────────────────────────── */
        @page {
          size: A4 portrait;
          margin: 1.5cm 1.8cm;
        }

        /* ── Global baseline ─────────────────────────────────────────── */
        html, body {
          background: #ffffff !important;
          color: #111111 !important;
          font-size: 10pt !important;
          line-height: 1.55 !important;
        }

        *, *::before, *::after {
          box-shadow: none !important;
          text-shadow: none !important;
        }

        /* ── Non-printable view elements ─────────────────────────────── *
         * Strictly hides the 3D canvas viewport, viewer chrome bars,     *
         * and sidebar panels so only the portal document is captured.     */
        canvas                     { display: none !important; }
        header, footer, nav, aside { display: none !important; }

        /* Tailwind print:hidden utility class (escaped colon) */
        .print\\:hidden            { display: none !important; }

        /* ── Portal backdrop → static document flow ──────────────────── */
        #vp-portal-backdrop {
          position:           static      !important;
          inset:              auto        !important;
          background:         transparent !important;
          backdrop-filter:    none        !important;
          -webkit-backdrop-filter: none   !important;
          padding:            0           !important;
          display:            block       !important;
          z-index:            auto        !important;
        }

        /* ── Portal card: full-page expansion ────────────────────────── */
        #vp-portal-card {
          position:     static  !important;
          width:        100%    !important;
          max-width:    100%    !important;
          height:       auto    !important;
          max-height:   none    !important;
          overflow:     visible !important;
          background:   #ffffff !important;
          color:        #111111 !important;
          border:       1px solid #cccccc !important;
          border-radius: 0      !important;
          box-shadow:   none    !important;
        }

        /* ── WILDCARD RULE: every descendant inside the card ─────────── *
         * This is the critical catch-all that unlocks every intermediate   *
         * flex container (flex-1, overflow-hidden, max-h-*) that sits      *
         * between the card root and the checklist text nodes.              *
         * Without this, deeply-nested Tailwind containers clip content.    */
        #vp-portal-card *,
        #vp-portal-card > * {
          height:     auto    !important;
          max-height: none    !important;
          overflow:   visible !important;
          flex:       none    !important;  /* neutralise flex-1 height clamping */
        }

        /* ── Checklist primary container and ALL nested nodes ─────────── *
         * Spec requirement:                                                 *
         *   height: auto !important                                         *
         *   overflow: visible !important                                    *
         *   position: static !important                                     */
        [data-print-region="checklist-root"],
        [data-print-region="checklist-root"] *,
        [data-print-region="checklist-items"],
        [data-print-region="checklist-items"] * {
          height:     auto    !important;
          max-height: none    !important;
          overflow:   visible !important;
          position:   static  !important;
          flex:       none    !important;
          flex-shrink: 0      !important;
          page-break-inside: avoid;
        }

        /* Checklist scrollable container — must be block, not flex-1 */
        [data-print-region="checklist-items"] {
          display:    block   !important;
        }

        /* ── Print-safe colour overrides ─────────────────────────────── */
        [data-print-region="checklist-root"] > div:first-child > div {
          border-color: #dddddd !important;
          background:   #f8f8f8 !important;
          color:        #111111 !important;
        }

        [data-print-region="checklist-items"] button {
          border-color:      #cccccc !important;
          background:        #ffffff !important;
          color:             #111111 !important;
          display:           flex    !important;
          page-break-inside: avoid   !important;
        }

        [data-print-region="checklist-items"] button span:first-child {
          border-color:               #22c55e !important;
          background:                 #dcfce7 !important;
          print-color-adjust:         exact;
          -webkit-print-color-adjust: exact;
        }

        /* Progress bar — hide; only text metrics need to print */
        [data-print-region="checklist-root"] [role="progressbar"],
        [data-print-region="checklist-root"] .h-1\\.5 {
          display: none !important;
        }
      }
    `;

    document.head.appendChild(style);

    // Trigger the native browser print dialog
    window.print();

    // Remove the injected stylesheet after the print cycle completes
    // so screen rendering is never affected.
    const cleanup = () => {
      document.getElementById(STYLE_ID)?.remove();
      window.removeEventListener('afterprint', cleanup);
    };
    window.addEventListener('afterprint', cleanup);
  }, []);

  return (
    <div
      data-print-region="checklist-root"
      className="flex flex-col flex-1 overflow-hidden p-5 gap-4 print:bg-white print:text-black print:overflow-visible"
    >
      {/* Authority routing cards */}
      <div className="shrink-0 grid grid-cols-1 gap-2 print:gap-1">
        {(
          [
            ["municipalCorporation", venue.regulatoryJurisdiction.municipalCorporation, "Municipal Corp"],
            ["policeDivision",       venue.regulatoryJurisdiction.policeDivision,       "Police Division"],
            ["fireZone",             venue.regulatoryJurisdiction.fireZone,             "Fire Zone"],
          ] as const
        ).map(([key, value, label]) => {
          const Icon = AUTHORITY_ICONS[key];
          return (
            <div
              key={key}
              className="flex items-start gap-3 rounded border border-border/50 bg-background/40 px-3 py-2.5"
            >
              <Icon className="h-3.5 w-3.5 text-text-muted shrink-0 mt-0.5" />
              <div>
                <p className="font-mono text-[9px] text-text-muted uppercase tracking-widest mb-0.5">{label}</p>
                <p className="text-[11px] text-text-secondary leading-snug">{value}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Progress bar + Export button row */}
      <div className="shrink-0">
        <div className="flex items-center justify-between mb-1.5 gap-3">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <span className="font-mono text-[9px] text-text-muted uppercase tracking-widest shrink-0">
              Clearance Progress
            </span>
            <span className="font-mono text-[10px] text-text-secondary shrink-0">
              {completedCount}/{totalSteps} · {progressPct}%
            </span>
          </div>
          {/* Export Submission Guide — triggers native print cycle */}
          <button
            onClick={handlePrint}
            className="shrink-0 flex items-center gap-1.5 rounded border border-border/60 bg-surface/40 px-2.5 py-1.5 text-[10px] font-mono text-text-secondary hover:border-accent/40 hover:text-accent hover:bg-accent/8 transition-colors print:hidden"
            title="Export Submission Guide as a clean printed document"
          >
            <Printer className="h-3 w-3" />
            Export Guide
          </button>
        </div>
        <div className="h-1.5 w-full rounded-full bg-border/50 overflow-hidden">
          <div
            className={cn(
              "h-full rounded-full transition-all duration-400",
              progressPct === 100 ? "bg-emerald-500" : "bg-accent"
            )}
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      {/* Interactive checklist steps */}
      <div
        data-print-region="checklist-items"
        className="flex-1 overflow-y-auto flex flex-col gap-2 print:overflow-visible print:gap-1"
      >
        {venue.regulatoryJurisdiction.checklistSteps.map((step, i) => (
          <button
            key={i}
            onClick={() => toggle(i)}
            className={cn(
              "flex items-start gap-3 rounded border p-3.5 text-left transition-all duration-150",
              checked.has(i)
                ? "border-emerald-500/30 bg-emerald-500/5"
                : "border-border/50 bg-surface/30 hover:border-border hover:bg-surface/50"
            )}
          >
            <span
              className={cn(
                "shrink-0 flex h-5 w-5 items-center justify-center rounded border mt-0.5 transition-colors",
                checked.has(i)
                  ? "bg-emerald-500/20 border-emerald-500/50"
                  : "border-border bg-background/40"
              )}
            >
              {checked.has(i) ? (
                <CheckCheck className="h-3 w-3 text-emerald-400" />
              ) : (
                <span className="font-mono text-[9px] text-text-muted">{i + 1}</span>
              )}
            </span>
            <p
              className={cn(
                "text-xs leading-relaxed transition-colors",
                checked.has(i) ? "text-text-muted line-through decoration-emerald-500/40" : "text-text-secondary"
              )}
            >
              {step}
            </p>
          </button>
        ))}

        {progressPct === 100 && (
          <div className="flex items-center gap-2 rounded border border-emerald-500/30 bg-emerald-500/8 px-4 py-3 mt-1">
            <ShieldCheck className="h-4 w-4 text-emerald-400 shrink-0" />
            <p className="text-xs text-emerald-400 font-medium">
              All clearance steps marked complete. Proceed to dispatch.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Main Component ──────────────────────────────────────────────────────── */

export function LegalManifestPortal({ venue, onClose, prefillDate }: LegalManifestPortalProps) {
  const fieldPrefix = useId();
  const [activeTab, setActiveTab] = useState<PortalTab>("form");
  const [dispatch, setDispatch]   = useState<DispatchState>("idle");

  const [form, setForm] = useState<EventFormState>({
    /* If a date was pre-selected in the BookingCalendar it flows in here;
     * otherwise fall back to the venue's first available date. */
    selectedDate:         (prefillDate || venue.availableDates[0]) ?? "",
    projectedAttendance:  "",
    microSpeakersDeployed: false,
    organiserName:        "",
    contactEmail:         "",
    eventType:            "corporate",
  });

  const handleChange = useCallback(
    <K extends keyof EventFormState>(key: K, value: EventFormState[K]) => {
      setForm((prev) => ({ ...prev, [key]: value }));
    },
    []
  );

  const handleDispatch = useCallback(async () => {
    setDispatch("compiling");
    // Short compile animation before opening Gmail compose tab
    await new Promise<void>((res) => setTimeout(res, 1400));
    const gmailUrl = buildGmailUrl(venue, form);
    // Opens in a new tab — preserves the viewer canvas execution loop on the current page
    window.open(gmailUrl, "_blank", "noopener,noreferrer");
    setDispatch("done");
    setTimeout(() => setDispatch("idle"), 3000);
  }, [venue, form]);

  const isFormReady =
    form.selectedDate !== "" &&
    form.organiserName.trim() !== "" &&
    form.contactEmail.trim() !== "" &&
    parseInt(form.projectedAttendance, 10) > 0;

  const tabs: { id: PortalTab; label: string; icon: React.ReactNode }[] = [
    { id: "form",      label: "Event Details",      icon: <CalendarDays className="h-3.5 w-3.5" /> },
    { id: "manifest",  label: "Legal Manifest",     icon: <Terminal className="h-3.5 w-3.5" /> },
    { id: "checklist", label: "Submission Guide",   icon: <ListChecks className="h-3.5 w-3.5" /> },
  ];

  return (
    /* ── Backdrop ────────────────────────────────────────────────────────── */
    <div
      id="vp-portal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      {/* ── Portal card ───────────────────────────────────────────────────── */}
      <div id="vp-portal-card" className="relative flex flex-col w-full max-w-2xl max-h-[90vh] rounded border border-border/60 bg-surface/95 backdrop-blur-xl shadow-[0_32px_80px_rgba(0,0,0,0.7)] overflow-hidden">

        {/* ── Header ───────────────────────────────────────────────────────── */}
        <div className="shrink-0 flex items-center justify-between px-5 py-4 border-b border-border/50 bg-background/40">
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-accent" />
              <h2 className="text-sm font-bold text-text-primary tracking-wide">
                Legal Manifest Portal
              </h2>
            </div>
            <p className="font-mono text-[10px] text-text-muted tracking-widest pl-6">
              {venue.name} · {venue.area} · {venue.city}
            </p>
          </div>
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded border border-border/50 bg-surface/50 text-text-muted hover:border-border hover:text-text-primary transition-colors"
            aria-label="Close portal"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* ── Venue identity strip ──────────────────────────────────────────── */}
        <div className="shrink-0 grid grid-cols-3 gap-px bg-border/30">
          {[
            { label: "Max Capacity",    value: `${venue.capacity.toLocaleString("en-IN")} pax` },
            { label: "Daily Rate",      value: `₹${(venue.ratePerDay / 100000).toFixed(2)}L` },
            { label: "Available Slots", value: `${venue.availableDates.length} dates` },
          ].map(({ label, value }) => (
            <div key={label} className="flex flex-col items-center py-2.5 bg-background/50">
              <span className="font-mono text-xs font-semibold text-text-primary">{value}</span>
              <span className="font-mono text-[8px] text-text-muted uppercase tracking-widest mt-0.5">{label}</span>
            </div>
          ))}
        </div>

        {/* ── Tab navigation ───────────────────────────────────────────────── */}
        <div className="shrink-0 flex border-b border-border/50 bg-background/30">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex flex-1 items-center justify-center gap-1.5 py-2.5 text-[10px] font-mono uppercase tracking-wider border-r border-border/30 last:border-r-0 transition-colors duration-150",
                activeTab === tab.id
                  ? "bg-accent/10 text-accent border-b-2 border-b-accent"
                  : "text-text-muted hover:text-text-secondary hover:bg-surface/30"
              )}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {/* ── Tab content ───────────────────────────────────────────────────── */}
        <div className="flex flex-col flex-1 overflow-hidden min-h-0">
          {activeTab === "form" && (
            <EventDetailsForm
              venue={venue}
              form={form}
              onChange={handleChange}
              fieldPrefix={fieldPrefix}
            />
          )}
          {activeTab === "manifest" && (
            <LegalManifestPreview venue={venue} form={form} />
          )}
          {activeTab === "checklist" && (
            <SubmissionChecklist venue={venue} />
          )}
        </div>

        {/* ── Footer — Dispatch bar ─────────────────────────────────────────── */}
        <div className="shrink-0 border-t border-border/50 bg-background/50 px-5 py-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
            {/* Readiness indicator */}
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <CircleDot
                className={cn(
                  "h-3.5 w-3.5 shrink-0",
                  isFormReady ? "text-emerald-400" : "text-amber-400"
                )}
              />
              <span className={cn("font-mono text-[10px] truncate", isFormReady ? "text-emerald-400" : "text-amber-400")}>
                {isFormReady
                  ? "Form complete — ready to dispatch"
                  : "Complete organiser name, email, date, and attendance to dispatch"}
              </span>
            </div>

            {/* Dispatch button */}
            <button
              onClick={handleDispatch}
              disabled={!isFormReady || dispatch !== "idle"}
              className={cn(
                "shrink-0 flex items-center gap-2 rounded border px-5 py-2.5 text-sm font-semibold transition-all duration-200",
                isFormReady && dispatch === "idle"
                  ? "border-accent/40 bg-accent/15 text-accent hover:border-accent/70 hover:bg-accent/25 hover:shadow-glow-accent"
                  : dispatch === "done"
                  ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
                  : "border-border/40 bg-surface/30 text-text-muted cursor-not-allowed"
              )}
            >
              {dispatch === "compiling" ? (
                <><Loader2 className="h-4 w-4 animate-spin" />Compiling payload…</>
              ) : dispatch === "done" ? (
                <><CheckCheck className="h-4 w-4" />Draft opened</>
              ) : (
                <><Send className="h-4 w-4" />Dispatch Booking &amp; Documents</>
              )}
            </button>
          </div>

          {/* Legal footnote */}
          <p className="mt-2.5 font-mono text-[9px] text-text-muted leading-relaxed">
            Dispatch opens Gmail compose in a new tab pre-filled with a structured booking payload
            addressed to {venue.contactEmail}. Canvas execution continues uninterrupted. No data is
            transmitted by VenuePlatform servers.
          </p>
        </div>

      </div>
    </div>
  );
}
