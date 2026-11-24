import { ago } from "@/lib/client/format";
import type { EvidenceSource, LotEstimate } from "@/lib/types";

function describe(s: EvidenceSource): string {
  switch (s.kind) {
    case "historical_baseline":
      return "how full this lot usually is at this time";
    case "class_wave_prior":
      return "when classes start nearby";
    case "student_reports":
      return `${s.detail.split(",")[0].toLowerCase()}${s.asOf ? `, newest ${ago(s.asOf)}` : ""}`;
    case "team_count":
      return `a team count${s.asOf ? ` ${ago(s.asOf)}` : ""}`;
    case "trip_outcome":
      return `${s.detail}${s.asOf ? `, newest ${ago(s.asOf)}` : ""}`;
  }
}

function joinAnd(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? "";
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

/** Plain-sentence answer to "where did this come from?" */
export function Evidence({ estimate, onSign = false }: { estimate: LotEstimate; onSign?: boolean }) {
  const tone = onSign ? "text-on-sign-muted" : "text-muted";
  if (!estimate.sources.length) {
    return <p className={`text-[13px] ${tone}`}>No data for this time yet. A report from you would be the first.</p>;
  }
  const level = estimate.confidence >= 0.7 ? "High" : estimate.confidence >= 0.4 ? "Medium" : "Low";
  return (
    <p className={`text-[13px] leading-snug ${tone}`}>
      {level} confidence prediction, based on {joinAnd(estimate.sources.map(describe))}.
    </p>
  );
}
