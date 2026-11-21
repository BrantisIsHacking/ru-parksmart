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
}

export interface Building {
  id: string;
  name: string;
  campus: Campus;
  center: LatLng;
  aliases: string[];
}

export interface Permit {
  id: string;
  label: string;
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

export type EvidenceKind = "historical_baseline" | "class_wave_prior" | "student_reports";

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
  stops: BusStop[];
  verified: boolean;
}

export interface ClassEntry {
  course?: string;
  building: string;
  campus?: Campus | null;
  days: number[];
  start: string;
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
    | "satisfaction";
  reporter: string;
  lotId?: string | null;
  /** Small, non-identifying numeric/string properties only. */
  props?: Record<string, string | number | boolean | null>;
  createdAt: string;
}
