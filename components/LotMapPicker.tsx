"use client";
// Pick a lot by tapping it on the campus map (the report screen's "Map" mode).
import type { FeatureCollection, Geometry } from "geojson";
import { useEffect, useRef, useState } from "react";
import { CAMPUS_BOUNDS, CAMPUS_LABEL, CAMPUS_ORDER } from "@/lib/campus";
import { useBuildings } from "@/lib/client/buildings";
import { distanceMeters } from "@/lib/geo";
import type { Campus, LatLng } from "@/lib/types";
import type { PickerRow } from "./LotPicker";
import type { MapFocus } from "./mapTypes";
import { MapView } from "./MapView";

/** A tap this close to a lot's center counts as tapping the lot (small lots are hard to hit). */
const NEAR_LOT_M = 90;

export function LotMapPicker({
  rows,
  selectedId,
  initialCampus,
  onPick,
}: {
  rows: PickerRow[];
  selectedId: string | null;
  initialCampus: Campus;
  onPick: (lotId: string) => void;
}) {
  const { shapes: buildingShapes } = useBuildings();
  const [lotShapes, setLotShapes] = useState<FeatureCollection<Geometry, { name: string; lotId: string | null }> | null>(null);
  const focusKey = useRef(0);
  const [focus, setFocus] = useState<MapFocus | null>(() => ({ key: ++focusKey.current, bounds: CAMPUS_BOUNDS[initialCampus] }));
  const [hint, setHint] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    fetch("/geo/lots.geojson")
      .then((r) => r.json())
      .then((d) => live && setLotShapes(d))
      .catch(() => {
        /* lots still show as markers */
      });
    return () => {
      live = false;
    };
  }, []);

  const nearest = (p: LatLng) => {
    let best: { id: string; d: number } | null = null;
    for (const r of rows) {
      const d = distanceMeters(p, r.lot.center);
      if (!best || d < best.d) best = { id: r.lot.id, d };
    }
    return best;
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {CAMPUS_ORDER.map((c) => (
          <button
            key={c}
            className="flex-none rounded-full border border-line bg-slab px-3 py-1.5 text-[14px] font-bold"
            onClick={() => setFocus({ key: ++focusKey.current, bounds: CAMPUS_BOUNDS[c] })}
          >
            {CAMPUS_LABEL[c]}
          </button>
        ))}
      </div>
      <div className="relative h-[60dvh] min-h-[320px] overflow-hidden rounded-[10px] border border-line">
        <MapView
          rows={rows}
          lotShapes={lotShapes}
          buildingShapes={buildingShapes}
          busStops={[]}
          classMarks={[]}
          selection={selectedId ? { kind: "lot", lotId: selectedId } : null}
          route={null}
          focus={focus}
          onSelectLot={onPick}
          onSelectBuilding={() => setHint("That's a building. Tap the colored lot you parked in.")}
          onSelectPoint={(p) => {
            const n = nearest(p);
            if (n && n.d <= NEAR_LOT_M) onPick(n.id);
            else setHint("No student lot there. Tap a colored lot, or zoom in.");
          }}
        />
        <p className="pointer-events-none absolute inset-x-2 bottom-2 z-[1000] rounded-[8px] bg-asphalt/90 px-3 py-2 text-center text-[14px] font-semibold text-white">
          {hint ?? "Tap the lot you parked in"}
        </p>
      </div>
    </div>
  );
}
