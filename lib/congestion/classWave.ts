// Class-wave demand prior: parking demand on a campus spikes shortly before
// each class block starts. Works on day one, before any student has reported.
import { CLASS_WAVES, type ClassWaveConfig } from "../data";
import type { Campus } from "../types";
import { campusParts, parseHHMM } from "../time";

/**
 * Relative arrival pressure on `campus` at `when`, 0..1.
 * Each block contributes weight x Gaussian centred `arrivalLeadMin` before its start.
 * Returns null when the campus has no class data (estimator then ignores this layer).
 */
export function classWavePressure(
  campus: Campus,
  when: Date,
  config: ClassWaveConfig = CLASS_WAVES,
): number | null {
  const blocks = config.campuses[campus];
  if (!blocks?.length) return null;
  const { weekday, minutes } = campusParts(when);
  const maxWeight = Math.max(...blocks.map((b) => b.weight));
  let pressure = 0;
  for (const b of blocks) {
    if (!b.days.includes(weekday)) continue;
    const peak = parseHHMM(b.start) - config.arrivalLeadMin;
    const z = (minutes - peak) / config.arrivalSpreadMin;
    pressure += (b.weight / maxWeight) * Math.exp(-0.5 * z * z);
  }
  return Math.min(1, pressure);
}

/** Start of the next class block on `campus` at or after `when` (minutes after midnight). */
export function nextClassBlock(campus: Campus, when: Date, config: ClassWaveConfig = CLASS_WAVES) {
  const { weekday, minutes } = campusParts(when);
  const starts = (config.campuses[campus] ?? [])
    .filter((b) => b.days.includes(weekday))
    .map((b) => parseHHMM(b.start))
    .filter((s) => s >= minutes)
    .sort((a, b) => a - b);
  return starts[0] ?? null;
}
