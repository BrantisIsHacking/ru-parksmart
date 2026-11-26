// Shared domain types for RU ParkSmart.

export type Campus = "livingston" | "busch" | "college_ave" | "cook_douglass";

export interface LatLng {
  lat: number;
  lng: number;
}

export interface Lot {
  id: string;
  name: string;
  campus: Campus;
  center: LatLng;
  /** Approximate number of spaces. Used only to turn manual counts into a fill fraction. */
  capacity: number;
  /** Placeholder lots must be mapped to real Rutgers lots before the pilot. */
  verified: boolean;
  /** The source only places this lot to ~1 km; it is shown but never planned to. */
  coordsApprox?: boolean;
}

export interface Building {
  id: string;
  name: string;
  campus: Campus;
  center: LatLng;
  /** Rutgers building code used in schedules, e.g. "TIL". */
  code?: string;
  /** Street address, e.g. "53 Avenue E". */
  address?: string;
  aliases: string[];
}

/** Anywhere a student can be headed: a building, or a point picked on the map. */
export interface Place {
  name: string;
  center: LatLng;
  campus?: Campus;
}

export interface Permit {
  id: string;
  label: string;
  /** primary: one per student; secondary: optional add-on for another campus; other: daily permit, none. */
  kind?: "primary" | "secondary" | "other";
}

/** One allow-rule. A permit may park in a lot when ANY rule matches. Default is deny. */
export interface PermitRule {
  id: string;
  lots: string[];
  /** Permit ids, or "*" meaning any valid Rutgers permit (not "none"). */
  permits: string[];
  /** 0 = Sunday ... 6 = Saturday, campus-local. */
  days: number[];
  /** "HH:MM" campus-local. If end <= start the window runs past midnight. */
  start: string;
  end: string;
  note: string;
  verified: boolean;
}

export interface RulesFile {
  version: string;
  source: string;
  verified: boolean;
  verifiedOn: string | null;
  permits: Permit[];
  rules: PermitRule[];
}

export interface PermitCheck {
  allowed: boolean;
  lotId: string;
  permitId: string;
  /** Campus-local time the check was made for, "Tue 10:15". */
  at: string;
  matchedRuleId: string | null;
  reason: string;
  /** False when the matching rule (or the whole rules file) has not been verified with Rutgers. */
  verified: boolean;
  rulesVersion: string;
}

export type LotStatus = "green" | "yellow" | "red" | "gray";

export type EvidenceKind = "historical_baseline" | "class_wave_prior" | "student_reports" | "team_count" | "trip_outcome";

export interface EvidenceSource {
  kind: EvidenceKind;
  detail: string;
  /** Relative weight this source had in the estimate, 0..1 (sums to 1 across sources). */
  share: number;
  /** ISO time of the newest data point in this source, if it has one. */
  asOf: string | null;
}

export interface LotEstimate {
  lotId: string;
  /** Arrival time the estimate is for (ISO). */
  forTime: string;
  status: LotStatus;
  /** Estimated fill fraction 0..1. Shown as a band, never as a space count. */
  fill: number | null;
  /** 0..1, how much evidence backs the estimate. */
  confidence: number;
  sources: EvidenceSource[];
  computedAt: string;
}

export type ReportValue = "crowded" | "spaces_open";

export interface Report {
  id?: string;
  lotId: string;
  value: ReportValue;
  /** Hashed anonymous id. Never a name or student id. */
  reporter: string;
  /** Reporter reliability at the time of the report, 0.2..1. */
  trust: number;
  createdAt: string;
}

export type OutcomeValue = "easy" | "circled" | "full";

export interface Trip {
  id?: string;
  /** Hashed anonymous id. */
  reporter: string;
  lotId: string;
  /** ISO time the student planned to park. */
  parkBy: string;
  /** parkBy + 5 minutes: when to ask "did you find a spot?". */
  notifyAt: string;
  predictedStatus: LotStatus;
  predictedFill: number | null;
  /** Notification address, deleted (null) once sent, answered or expired. */
  push: PushSubscriptionJSON | null;
  state: "pending" | "notified" | "answered" | "expired";
  createdAt: string;
}

export interface TripOutcome {
  id?: string;
  tripId: string;
  reporter: string;
  lotId: string;
  value: OutcomeValue;
  /** Answer time (ISO). */
  at: string;
  parkBy: string;
  predictedStatus: LotStatus;
  /** Reporter reliability (trustScore) when the answer was given, 0.2..1. Missing on old docs: treat as 0.5. */
  trust?: number;
  createdAt: string;
}

export interface TrustRecord {
  reporter: string;
  agree: number;
  disagree: number;
}

export interface ManualCount {
  id?: string;
  lotId: string;
  occupied: number;
  capacity: number;
  countedAt: string;
  counter: string;
}

export interface ClassBlock {
  start: string; // "HH:MM"
  days: number[];
  /** Relative number of students starting class on this campus in this block (any unit). */
  weight: number;
}

export interface BusStop {
  id: string;
  name: string;
  center: LatLng;
  /** Minutes after the route's departure from its first stop. */
  offsetMin: number;
}

export interface BusRoute {
  id: string;
  name: string;
  days: number[];
  firstDeparture: string;
  lastDeparture: string;
  headwayMin: number;
  /** Minutes for one full loop; a ride to an earlier stop wraps around it. */
  loopMin?: number;
  stops: BusStop[];
  verified: boolean;
}

export interface ClassEntry {
  /** Course title as shown, e.g. "Linear Optimization". */
  course?: string;
  /** Rutgers course number, e.g. "01:640:354". */
  courseNumber?: string;
  /** Section, e.g. "01". */
  section?: string;
  /** Building display name, e.g. "Beck Hall" (or what the student typed if it didn't resolve). */
  building: string;
  /** Campus map building id ("b4145") once resolved; the planner prefers it over the name. */
  buildingId?: string | null;
  /** Rutgers building code, e.g. "BE". */
  buildingCode?: string | null;
  /** Room, e.g. "AUD" or "254". */
  room?: string | null;
  campus?: Campus | null;
  days: number[];
  start: string;
  /** End time "HH:MM", when known. */
  end?: string | null;
}

export interface MetricEvent {
  id?: string;
  type:
    | "app_open"
    | "decision"
    | "parkorride_shown"
    | "parkorride_followed"
    | "chat_message"
    | "schedule_import"
    | "report"
    | "satisfaction"
    | "trip_outcome";
  reporter: string;
  lotId?: string | null;
  /** Small, non-identifying numeric/string properties only. */
  props?: Record<string, string | number | boolean | null>;
  createdAt: string;
}
