import type { EvidenceSource, LotStatus } from "../types";

export const STATUS_LABEL: Record<LotStatus, string> = {
  green: "Likely open",
  yellow: "Filling",
  red: "Likely full",
  gray: "Not enough data",
};

export const STATUS_HEX: Record<LotStatus, string> = {
  green: "#17824f",
  yellow: "#c99700",
  red: "#cc0033",
  gray: "#6b7279",
};

export const SOURCE_LABEL: Record<EvidenceSource["kind"], string> = {
  historical_baseline: "Historical baseline",
  class_wave_prior: "Class-wave prediction",
  student_reports: "Student reports",
  team_count: "Team count",
  trip_outcome: "Trip check-ins",
};

export function clock(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/New_York",
  });
}

export function ago(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return "";
  const min = Math.round((now - new Date(iso).getTime()) / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  return `${Math.round(min / 60)} h ago`;
}

export function confidenceLabel(c: number): string {
  if (c >= 0.7) return "high confidence";
  if (c >= 0.4) return "medium confidence";
  return "low confidence";
}
