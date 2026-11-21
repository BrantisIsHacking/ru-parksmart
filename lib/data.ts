// Typed access to the versioned data files. Swapping a semester's rules means
// adding a new rules.<version>.json and pointing ACTIVE_RULES at it.
import lotsJson from "@/data/lots.json";
import rulesJson from "@/data/rules.v2026-fall.json";
import classJson from "@/data/classTimes.json";
import baselineJson from "@/data/baseline.json";
import busJson from "@/data/busRoutes.json";
import type { Building, BusRoute, Campus, ClassBlock, Lot, RulesFile } from "./types";

export const LOTS = lotsJson.lots as Lot[];
export const BUILDINGS = lotsJson.buildings as Building[];
export const ACTIVE_RULES = rulesJson as RulesFile;
export const BUS_ROUTES = busJson.routes as BusRoute[];

export interface ClassWaveConfig {
  arrivalLeadMin: number;
  arrivalSpreadMin: number;
  campuses: Partial<Record<Campus, ClassBlock[]>>;
}
export const CLASS_WAVES = classJson as unknown as ClassWaveConfig;

export type BaselineSource = "placeholder" | "rts" | "manual";
export interface LotBaseline {
  source: BaselineSource;
  weekday: Record<string, number>;
}
export const BASELINES = baselineJson.lots as Record<string, LotBaseline>;

export const lotById = (id: string) => LOTS.find((l) => l.id === id);

export function findBuilding(query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return undefined;
  return (
    BUILDINGS.find((b) => b.id === q || b.name.toLowerCase() === q) ??
    BUILDINGS.find((b) => b.aliases.some((a) => q.includes(a) || a.includes(q))) ??
    BUILDINGS.find((b) => b.name.toLowerCase().includes(q))
  );
}
