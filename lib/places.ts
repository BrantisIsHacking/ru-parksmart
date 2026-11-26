// Turn what the student picked (a building name/code, or a point on the map) into a Place.
import { BUILDINGS, findBuilding } from "./data";
import { distanceMeters } from "./geo";
import type { LatLng, Place } from "./types";

/** New Brunswick / Piscataway campuses; points outside get a clear error instead of a silly plan. */
const NB_BOUNDS = { south: 40.455, west: -74.49, north: 40.545, east: -74.41 };

export interface DestinationPoint extends LatLng {
  label?: string;
}

export function nearestBuilding(p: LatLng): { building: Place; meters: number } | null {
  let best: { building: Place; meters: number } | null = null;
  for (const b of BUILDINGS) {
    const d = distanceMeters(p, b.center);
    if (!best || d < best.meters) best = { building: b, meters: d };
  }
  return best;
}

/** A building name or code ("Tillett Hall", "TIL-254"), or a point picked on the map. */
export function resolvePlace(destination?: string | null, point?: DestinationPoint | null): Place {
  if (point && Number.isFinite(point.lat) && Number.isFinite(point.lng)) {
    const { lat, lng } = point;
    if (lat < NB_BOUNDS.south || lat > NB_BOUNDS.north || lng < NB_BOUNDS.west || lng > NB_BOUNDS.east) {
      throw new Error("That spot is outside the New Brunswick campuses.");
    }
    const label = point.label?.trim();
    if (label) return { name: label.slice(0, 80), center: { lat, lng } };
    // Name an unlabeled pin after a building when it is right on top of one.
    const near = nearestBuilding({ lat, lng });
    return { name: near && near.meters <= 60 ? near.building.name : "Dropped pin", center: { lat, lng } };
  }
  const building = destination ? findBuilding(destination) : undefined;
  if (!building) {
    throw new Error(
      `Unknown building "${destination ?? ""}". Try the full name or the code from your schedule (e.g. TIL, ARC, SC), or pick it on the map.`,
    );
  }
  return building;
}
