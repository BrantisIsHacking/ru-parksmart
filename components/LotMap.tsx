"use client";
import { AdvancedMarker, APIProvider, Map, Pin } from "@vis.gl/react-google-maps";
import { STATUS_HEX, STATUS_LABEL } from "@/lib/client/format";
import type { Lot, LotEstimate } from "@/lib/types";
import { StatusBadge } from "./StatusBadge";

const KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
const MAP_ID = process.env.NEXT_PUBLIC_GOOGLE_MAP_ID || "DEMO_MAP_ID";

export interface LotRow {
  lot: Lot;
  estimate?: LotEstimate;
}

/** Congestion map, with the lot list underneath. Without a Maps key, just the list. */
export function LotMap({ rows, highlight }: { rows: LotRow[]; highlight?: string | null }) {
  const list = (
    <ul>
      {rows.map(({ lot, estimate }) => (
        <li key={lot.id} className="flex items-center justify-between gap-3 border-t border-line px-4 py-3 first:border-t-0">
          <span className={lot.id === highlight ? "font-bold" : ""}>{lot.name}</span>
          <StatusBadge status={estimate?.status ?? "gray"} />
        </li>
      ))}
      {!rows.length && <li className="px-4 py-3 text-muted">Loading lots…</li>}
    </ul>
  );
  if (!KEY) return list;

  const center = rows.find((r) => r.lot.id === highlight)?.lot.center ?? { lat: 40.5237, lng: -74.443 };
  return (
    <>
      <APIProvider apiKey={KEY}>
        <div className="h-60 border-b border-line">
          <Map defaultCenter={center} defaultZoom={14} mapId={MAP_ID} disableDefaultUI gestureHandling="greedy">
            {rows.map(({ lot, estimate }) => {
              const status = estimate?.status ?? "gray";
              return (
                <AdvancedMarker key={lot.id} position={lot.center} title={`${lot.name}: ${STATUS_LABEL[status]}`}>
                  <Pin background={STATUS_HEX[status]} borderColor="#ffffff" glyphColor="#ffffff" scale={lot.id === highlight ? 1.3 : 1} />
                </AdvancedMarker>
              );
            })}
          </Map>
        </div>
      </APIProvider>
      {list}
    </>
  );
}
