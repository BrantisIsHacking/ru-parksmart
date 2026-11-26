// Campus labels, order and grouping. Dependency-free so client pages can use it.
import type { Campus, LatLng } from "./types";

/** West to east, the order maps.rutgers.edu and DOTS use. */
export const CAMPUS_ORDER: Campus[] = ["college_ave", "busch", "livingston", "cook_douglass"];

export const CAMPUS_LABEL: Record<Campus, string> = {
  college_ave: "College Ave",
  busch: "Busch",
  livingston: "Livingston",
  cook_douglass: "Cook/Douglass",
};

/** Map view per campus: [south-west, north-east]. */
export const CAMPUS_BOUNDS: Record<Campus, [LatLng, LatLng]> = {
  college_ave: [{ lat: 40.4955, lng: -74.4565 }, { lat: 40.5075, lng: -74.4425 }],
  busch: [{ lat: 40.5115, lng: -74.4745 }, { lat: 40.5285, lng: -74.452 }],
  livingston: [{ lat: 40.5125, lng: -74.4435 }, { lat: 40.5295, lng: -74.4285 }],
  cook_douglass: [{ lat: 40.4705, lng: -74.4425 }, { lat: 40.4875, lng: -74.4225 }],
};

/** Group items by campus in CAMPUS_ORDER, sorting each group with `sort`. Empty campuses are dropped. */
export function groupByCampus<T extends { campus: Campus | string }>(
  items: T[],
  sort: (a: T, b: T) => number = () => 0,
): { campus: Campus; label: string; items: T[] }[] {
  return CAMPUS_ORDER.map((campus) => ({
    campus,
    label: CAMPUS_LABEL[campus],
    items: items.filter((i) => i.campus === campus).sort(sort),
  })).filter((g) => g.items.length > 0);
}

/** Natural sort for lot names: "Lot 9" before "Lot 48" before "Lot 105". */
export const byLotName = (a: { name: string }, b: { name: string }) =>
  a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
