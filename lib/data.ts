// Typed access to the versioned data files. Swapping a semester's rules means
// adding a new rules.<version>.json and pointing ACTIVE_RULES at it.
import lotsJson from "@/data/lots.json";
import buildingsJson from "@/data/buildings.json";
import rulesJson from "@/data/rules.v2026-fall.json";
import classJson from "@/data/classTimes.json";
import baselineJson from "@/data/baseline.json";
import busJson from "@/data/busRoutes.json";
import { rankBuildings } from "./search";
import type { Building, BusRoute, Campus, ClassBlock, Lot, RulesFile } from "./types";

export const LOTS = lotsJson.lots as Lot[];
/** Every New Brunswick building on the Rutgers campus map (scripts/import-campus-map.mjs). */
export const BUILDINGS = buildingsJson.buildings as Building[];
export const ACTIVE_RULES = rulesJson as RulesFile;
export const BUS_ROUTES = busJson.routes as BusRoute[];

export interface ClassWaveConfig {
  arrivalLeadMin: number;
  arrivalSpreadMin: number;
  campuses: Partial<Record<Campus, ClassBlock[]>>;
}
export const CLASS_WAVES = classJson as unknown as ClassWaveConfig;

export type BaselineSource = "placeholder" | "rts" | "manual" | "learned";
export interface LotBaseline {
  source: BaselineSource;
  /** Overrides the default weight for `source` (learned curves grow with data). */
  weight?: number;
  /** Observations a learned curve was built from. */
  observations?: number;
  /** Learned curves: weight per hour key ("8" = 8:00), only for hours with observations. */
  slotWeight?: Record<string, number>;
  /** Learned curves: number of observations per hour key. */
  slotObservations?: Record<string, number>;
  weekday: Record<string, number>;
}
export const BASELINES = baselineJson.lots as Record<string, LotBaseline>;

export const lotById = (id: string) => LOTS.find((l) => l.id === id);

/**
 * Resolve what a student or schedule calls a building: a Rutgers code ("TIL", "TIL-254",
 * "ARC 103"), the full name, an alias, or part of the name.
 */
export function findBuilding(query: string): Building | undefined {
  return searchBuildings(query, 1)[0];
}

/** Ranked building matches for a free-text query. */
export function searchBuildings(query: string, limit = 8): Building[] {
  return rankBuildings(BUILDINGS, query, limit);
}

export const lotsOnCampus = (campus: Campus) => LOTS.filter((l) => l.campus === campus);
