import type { LatLng } from "./types";

export function distanceMeters(a: LatLng, b: LatLng): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Walking minutes, straight-line distance x 1.3 detour factor at 1.3 m/s. */
export function walkMinutes(a: LatLng, b: LatLng): number {
  return Math.max(1, Math.round((distanceMeters(a, b) * 1.3) / 1.3 / 60));
}
