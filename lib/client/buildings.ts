"use client";
// The campus-map building list, loaded once per page from /geo/buildings.geojson
// (outlines for the map, names/codes for search and the class editor).
import type { FeatureCollection, Geometry } from "geojson";
import { useEffect, useState } from "react";
import type { Building, Campus } from "../types";

export interface BuildingProps {
  id: string;
  name: string;
  code: string | null;
  campus: Campus;
  address: string | null;
  aliases: string[];
  lat: number;
  lng: number;
}
export type BuildingShapes = FeatureCollection<Geometry, BuildingProps>;

let cache: Promise<BuildingShapes> | null = null;
const loadShapes = () =>
  (cache ??= fetch("/geo/buildings.geojson")
    .then((r) => {
      if (!r.ok) throw new Error(`buildings: HTTP ${r.status}`);
      return r.json() as Promise<BuildingShapes>;
    })
    .catch((e) => {
      cache = null; // allow a retry on the next mount
      throw e;
    }));

export const toBuildings = (shapes: BuildingShapes | null): Building[] =>
  (shapes?.features ?? []).map((f) => ({
    id: f.properties.id,
    name: f.properties.name,
    code: f.properties.code ?? undefined,
    campus: f.properties.campus,
    address: f.properties.address ?? undefined,
    aliases: f.properties.aliases ?? [],
    center: { lat: f.properties.lat, lng: f.properties.lng },
  }));

/** Building outlines plus the flat list. Both are empty until loaded (or if loading fails). */
export function useBuildings(): { shapes: BuildingShapes | null; buildings: Building[] } {
  const [shapes, setShapes] = useState<BuildingShapes | null>(null);
  const [buildings, setBuildings] = useState<Building[]>([]);
  useEffect(() => {
    let live = true;
    loadShapes()
      .then((s) => {
        if (!live) return;
        setShapes(s);
        setBuildings(toBuildings(s));
      })
      .catch(() => {
        /* the map and editor still work without building data */
      });
    return () => {
      live = false;
    };
  }, []);
  return { shapes, buildings };
}
