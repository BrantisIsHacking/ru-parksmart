import type { LatLng, Lot, LotEstimate } from "@/lib/types";

/** One row of /api/status. `allowed` is present when the request named a permit. */
export interface MapLotRow {
  lot: Lot;
  estimate?: LotEstimate;
  allowed?: boolean;
}

export type MapSelection =
  | { kind: "lot"; lotId: string }
  | { kind: "building"; buildingId: string }
  | { kind: "point"; point: LatLng };

/** A camera request; bump `key` to repeat the same move. */
export interface MapFocus {
  key: number;
  center?: LatLng;
  zoom?: number;
  bounds?: LatLng[];
}

/** A building the student has class in, for the "My classes" layer. */
export interface ClassMark {
  buildingId: string | null;
  center: LatLng;
  /** Short permanent label, e.g. "Linear Optimization +1". */
  label: string;
  /** Hover/tap detail: one line per class. */
  detail: string[];
}

/** The planned trip drawn on the map. */
export interface MapRoute {
  from: LatLng;
  to: LatLng;
  bus?: { from: LatLng; to: LatLng } | null;
}
