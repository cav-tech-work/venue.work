export interface VenueProfile {
  id: string;
  name: string;
  area: string;
  city: string;
  state: string;
  country: string;
  capacity: number;
  ratePerDay: number;
  splatUrl: string;
  availableDates: string[]; // ISO format strings
  contactEmail: string;
  regulatoryJurisdiction: {
    /** Full office name and physical address for the governing municipal body. */
    municipalCorporation: string;
    /** Police division HQ and local thana notification routing string. */
    policeDivision: string;
    /** Fire & emergency services zone and regional office identifier. */
    fireZone: string;
    /** Sequential procedural compliance steps with specific office routing. */
    checklistSteps: string[];
    /** Exhaustive list of all permits and NOCs required for event operation. */
    licenseRequirements: string[];
  };
}

export const venues: VenueProfile[] = [
  /* ─────────────────────────────────────────────────────────────────────── */
  /*  Venue 001 — The Ballygunge Heritage Grand                             */
  /* ─────────────────────────────────────────────────────────────────────── */
  {
    id: "venue-001",
    name: "The Ballygunge Heritage Grand",
    area: "Ballygunge",
    city: "Kolkata",
    state: "West Bengal",
    country: "India",
    capacity: 1200,
    ratePerDay: 850000,
    splatUrl: "/assets/splats/demo/capture.ply",
    availableDates: [
      "2026-08-10",
      "2026-08-14",
      "2026-08-21",
      "2026-09-03",
      "2026-09-17",
      "2026-10-05",
      "2026-10-18",
      "2026-11-01",
      "2026-11-22",
      "2026-12-06",
    ],
    contactEmail: "reservations@bhgrand.in",
    regulatoryJurisdiction: {
      municipalCorporation:
        "Kolkata Municipal Corporation (KMC) — Borough XII Office, 2A, Sarat Bose Road, Ballygunge, Kolkata — 700 020",
      policeDivision:
        "Kolkata Police — South Division HQ, 13, Loudon Street | Local Thana: Ballygunge Police Station, 68, Ballygunge Place East",
      fireZone:
        "West Bengal Fire & Emergency Services — South Bengal Zone, Station No. 9 (Ballygunge), 103, Rashbehari Avenue",
      checklistSteps: [
        "Step 1: Collect the venue structural layout diagram and maximum-occupancy certificate from the venue manager. Submit Form 4-A (Amusement & Event License Application) at the KMC Borough XII Counter, 2A, Sarat Bose Road, along with a demand draft of ₹12,500 payable to 'Kolkata Municipal Corporation'. Obtain the KMC acknowledgement receipt stamped with the Processing ID.",
        "Step 2: Carry the KMC acknowledgement receipt and two notarised copies of the structural layout diagram to the Ballygunge Police Station, 68 Ballygunge Place East. Submit the Sound & Crowd Management NOC request (Police Form GS-7) to the Officer-in-Charge. Attach the VenuePlatform-generated seating-capacity heatmap as a supporting annexure.",
        "Step 3: After the Police OC counter-signs Form GS-7, upload the signed copy alongside the temporary-structure stability certificate (issued by a WBSEDCL-empanelled structural engineer) to the WB Fire Services Event Portal at wbfire.gov.in/event-noc. Select Station No. 9 (Ballygunge) for on-site inspection scheduling.",
        "Step 4: Present the Fire NOC confirmation email at the KMC Amusement Tax Department window (Ground Floor, 5, S.N. Banerjee Road, Kolkata — 700 013) between 11:00–14:00 on any working day to receive the final KMC Event Ground Clearance Certificate.",
        "Step 5: Submit the FL-3 Liquor Service Licence application at the West Bengal Excise Directorate, Abhinav Bhavan, 3rd Floor, 7, Nizam Palace, A.J.C. Bose Road. Provide the KMC Ground Clearance Certificate as a mandatory enclosure. Processing time: 7–10 working days.",
        "Step 6: File the WBPCB Temporary Noise Clearance form (Form XV) at the WBPCB South Zone Office, Paribesh Bhavan, Block LA, Sector III, Salt Lake. Include a 72-hour sound-level monitoring schedule and projected SPL readings from the audio contractor.",
      ],
      licenseRequirements: [
        "KMC Form 4-A — Amusement & Event License (Borough XII, Sarat Bose Road)",
        "KMC Ground Clearance Certificate — Amusement Tax Dept., 5, S.N. Banerjee Road",
        "Kolkata Police Sound & Crowd Management NOC — Form GS-7 (Ballygunge PS)",
        "WB Fire & Emergency Services Site NOC — Station No. 9 (Ballygunge)",
        "Temporary Structure Stability Certificate — WBSEDCL-empanelled structural engineer",
        "West Bengal Excise Directorate — FL-3 Liquor Service Licence (Nizam Palace HQ)",
        "WBPCB Temporary Noise Clearance — Form XV (South Zone, Salt Lake)",
        "KMC Conservancy & Solid Waste Deposit Receipt — ₹8,000 refundable",
      ],
    },
  },

  /* ─────────────────────────────────────────────────────────────────────── */
  /*  Venue 002 — Bypass Skyline Convention Centre                          */
  /* ─────────────────────────────────────────────────────────────────────── */
  {
    id: "venue-002",
    name: "Bypass Skyline Convention Centre",
    area: "E.M. Bypass",
    city: "Kolkata",
    state: "West Bengal",
    country: "India",
    capacity: 3500,
    ratePerDay: 1950000,
    splatUrl: "/assets/splats/demo/capture.ply",
    availableDates: [
      "2026-07-26",
      "2026-08-02",
      "2026-08-16",
      "2026-09-06",
      "2026-09-20",
      "2026-10-10",
      "2026-10-25",
      "2026-11-08",
      "2026-11-28",
      "2026-12-13",
    ],
    contactEmail: "events@bypassskyline.in",
    regulatoryJurisdiction: {
      municipalCorporation:
        "Kolkata Municipal Corporation (KMC) — Borough X Office, Tiljala Road, Ward 108, Kolkata — 700 039 | Central HQ Reference: 5, S.N. Banerjee Road, Kolkata — 700 013",
      policeDivision:
        "Kolkata Police — South-East Division HQ, D.H. Road, Kasba | Local Thana: Tiljala Police Station, 16, Tiljala Road | HIDCO Corridor Security Liaison: Action Area II, New Town",
      fireZone:
        "West Bengal Fire & Emergency Services — East Bengal Zone, Station No. 12 (Kasba), 215, Rashbehari Connector | Large-Assembly Category AA fast-track desk",
      checklistSteps: [
        "Step 1: Obtain the venue's HIDCO Corridor Usage Pre-Approval letter by submitting Form HU-1 at the HIDCO Authority Office, HIDCO Bhavan, Action Area I, New Town, Kolkata — 700 156. This pre-approval is a mandatory gateway document for all subsequent KMC and Police filings at this E.M. Bypass location.",
        "Step 2: With the HIDCO pre-approval in hand, submit Form 4-A (Amusement & Event License) and Form MG-2 (Mass Gathering Supplement for >1,000 pax) at the KMC Borough X counter, Tiljala Road. Attach the VenuePlatform-generated crowd-flow simulation report as a mandatory technical annexure. Pay ₹28,000 demand draft payable to 'KMC — Mass Event Cell'.",
        "Step 3: File the Police Mass Gathering NOC at the South-East Division HQ, D.H. Road, Kasba. Request must include a certified copy of the HIDCO pre-approval, the KMC MG-2 acknowledgement, and a detailed egress-flow map from the VenuePlatform egress modelling module. The Division HQ forwards the file to the local Tiljala PS OC for counter-signature — budget 3 working days.",
        "Step 4: Upload the structural stability certificate, HIDCO pre-approval, and Police Division NOC to the WB Fire Services Event Portal at wbfire.gov.in/event-noc. Select the Category AA Large Assembly desk and Station No. 12 (Kasba) for inspection dispatch. Request the two-inspector joint-visit option for venues exceeding 2,000 pax.",
        "Step 5: Submit the FL-3 and FL-4 (Liquor Service + Temporary Bar Counter) applications concurrently at the West Bengal Excise Directorate, Abhinav Bhavan, 7, Nizam Palace, A.J.C. Bose Road. The FL-4 application requires the Fire NOC and a certified floor-plan with bar-counter locations clearly marked.",
        "Step 6: Apply for the CESC Temporary High-Load Power Connection at the CESC Topsia Customer Service Centre, 9, Ho Chi Minh Sarani. Submit load calculations (minimum 800 kVA expected draw) prepared by a licensed electrical contractor. Minimum lead time: 10 working days.",
        "Step 7: File the WBPCB Noise Clearance Form XV at the WBPCB East Zone Office, 1st Floor, Bidhannagar Sub-Regional Office, Sector III, Salt Lake. Include 96-hour sound monitoring plan and dedicated generator enclosure specifications.",
        "Step 8: Deposit the KMC Conservancy Bond (₹25,000 refundable) and obtain the Conservancy Receipts at the Borough X Office. Present all collected NOCs and receipts to the KMC Event Cell for final Ground Clearance Certificate issuance — allow 2 working days.",
      ],
      licenseRequirements: [
        "HIDCO Corridor Usage Pre-Approval — Form HU-1 (HIDCO Bhavan, New Town)",
        "KMC Form 4-A — Amusement & Event License (Borough X, Tiljala Road)",
        "KMC Form MG-2 — Mass Gathering Supplement (>1,000 pax) with crowd-flow annexure",
        "KMC Ground Clearance Certificate — Mass Event Cell, 5, S.N. Banerjee Road",
        "Kolkata Police Mass Gathering NOC — South-East Division HQ + Tiljala PS counter-sign",
        "WB Fire & Emergency Services NOC — Category AA Large Assembly, Station No. 12 (Kasba)",
        "Temporary Structure Stability Certificate — WBSEDCL-empanelled structural engineer",
        "West Bengal Excise Directorate — FL-3 Liquor Service Licence",
        "West Bengal Excise Directorate — FL-4 Temporary Bar Counter Licence",
        "CESC Temporary High-Load Power Connection Approval — Topsia CSC",
        "WBPCB Noise Clearance — Form XV (East Zone, Bidhannagar Sub-Regional Office)",
        "KMC Conservancy Bond Receipt — ₹25,000 refundable (Borough X)",
      ],
    },
  },

  /* ─────────────────────────────────────────────────────────────────────── */
  /*  Venue 003 — Sector V Luminary Pavilion                                */
  /* ─────────────────────────────────────────────────────────────────────── */
  {
    id: "venue-003",
    name: "Sector V Luminary Pavilion",
    area: "Salt Lake — Sector V",
    city: "Kolkata",
    state: "West Bengal",
    country: "India",
    capacity: 800,
    ratePerDay: 620000,
    splatUrl: "/assets/splats/demo/capture.ply",
    availableDates: [
      "2026-08-08",
      "2026-08-22",
      "2026-09-12",
      "2026-09-26",
      "2026-10-03",
      "2026-10-17",
      "2026-10-31",
      "2026-11-14",
      "2026-12-05",
      "2026-12-19",
    ],
    contactEmail: "bookings@luminarypavilioncal.in",
    regulatoryJurisdiction: {
      municipalCorporation:
        "Bidhannagar Municipal Corporation (BMC) — Ward 30, Sector V Office, CB-218, Sector I, Salt Lake, Kolkata — 700 064 | Commissioner's Office: DD-32, Sector I, Bidhannagar",
      policeDivision:
        "Bidhannagar Police Commissionerate — DC (North) Office, BF-142, Sector I, Salt Lake | Local Thana: Electronics Complex Police Station (ECPS), Block EP & GP, Sector V, Salt Lake",
      fireZone:
        "West Bengal Fire & Emergency Services — North Bengal Zone (Bidhannagar Subdivision), Station No. BN-3 (Salt Lake), BJ-102, Sector II, Salt Lake City",
      checklistSteps: [
        "Step 1: Obtain the NKDA Site Usage Approval by submitting a written application on company letterhead to the New Town Kolkata Development Authority (NKDA) Estate Department, Hidco Bhavan, AA-I, New Town, Kolkata — 700 156. Attach the VenuePlatform-generated venue scan report and maximum seating configuration layout. NKDA countersigns within 5 working days.",
        "Step 2: File the BMC Event License application at the Ward 30 BMC Sector V office, CB-218, Sector I, Salt Lake. Submit the NKDA site approval as a primary enclosure. Pay the event-license fee of ₹9,500 (demand draft payable to 'Bidhannagar Municipal Corporation') at the cash counter on the ground floor.",
        "Step 3: Submit the Gathering Permit application (>200 pax, Form GP-4) at the Electronics Complex Police Station (ECPS), Block EP & GP, Sector V. Attach two copies of the structural layout and the VenuePlatform seating-heatmap PDF. The local OC routes the file to the Bidhannagar Commissionerate DC (North) office for approval — allow 4 working days.",
        "Step 4: Once the Police GP-4 is counter-signed, upload it together with the structural stability certificate and a copy of the BMC license acknowledgement to the WB Fire Services Event Portal. Select Station BN-3 (Salt Lake Sector II) for the on-site inspection appointment. Fire clearance for Category B Assembly (up to 1,000 pax) is typically issued within 48 hours of inspection.",
        "Step 5: Apply for the FL-3 Liquor Service Licence at the West Bengal Excise Directorate, Abhinav Bhavan, Nizam Palace. Attach the BMC Event License and Fire NOC. The Excise office requires a certified floor-plan showing bar-counter placement relative to emergency exits.",
        "Step 6: File the WBPCB Noise Clearance Form XV at the WBPCB Bidhannagar Sub-Regional Office, 1st Floor, Sector III, Salt Lake (next to the Bidhannagar SDO Office). Submit a 48-hour SPL monitoring schedule and written confirmation that all sound equipment will be powered down by 22:00 IST, per IT Park precinct norms.",
        "Step 7: Deposit the BMC Conservancy Bond (₹6,000 refundable) at the Ward 30 BMC cashier and collect the receipt. Present the complete compliance dossier — NKDA approval, BMC License, Police GP-4, Fire NOC, Excise FL-3, WBPCB certificate, and Conservancy receipt — to the BMC Commissioner's Office (DD-32, Sector I) for final issuance of the Event Operations Certificate.",
      ],
      licenseRequirements: [
        "NKDA Site Usage Approval — Estate Dept., Hidco Bhavan, New Town (mandatory gateway)",
        "BMC Event License — Ward 30, Sector V Office, CB-218, Sector I, Salt Lake",
        "Bidhannagar Commissionerate Gathering Permit — Form GP-4 (ECPS + DC North counter-sign)",
        "BMC Event Operations Certificate — Commissioner's Office, DD-32, Sector I",
        "WB Fire & Emergency Services NOC — Category B Assembly, Station BN-3 (Salt Lake Sector II)",
        "Temporary Structure Stability Certificate — WBSEDCL-empanelled structural engineer",
        "West Bengal Excise Directorate — FL-3 Liquor Service Licence (Nizam Palace HQ)",
        "WBPCB Noise Clearance — Form XV (Bidhannagar Sub-Regional Office, Sector III)",
        "BMC Conservancy Bond Receipt — ₹6,000 refundable (Ward 30 cashier)",
      ],
    },
  },
];
