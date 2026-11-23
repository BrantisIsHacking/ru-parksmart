"use client";
import dynamic from "next/dynamic";
import type { Lot, LotEstimate } from "@/lib/types";
import { StatusBadge } from "./StatusBadge";

// OpenStreetMap via Leaflet: no API key or billing account needed.
const LeafletMap = dynamic(() => import("./LeafletMap"), {
  ssr: false,
  loading: () => <div className="h-full w-full bg-concrete" />,
});

export interface LotRow {
  lot: Lot;
  estimate?: LotEstimate;
}

/** Congestion map, with the lot list underneath. */
export function LotMap({ rows, highlight }: { rows: LotRow[]; highlight?: string | null }) {
  const center = rows.find((r) => r.lot.id === highlight)?.lot.center ?? { lat: 40.5237, lng: -74.443 };
  return (
    <>
      {/* isolate keeps Leaflet's high z-index panes from covering page headers. */}
      <div className="isolate h-60 border-b border-line">
        <LeafletMap rows={rows} highlight={highlight} center={center} />
      </div>
      <ul>
        {rows.map(({ lot, estimate }) => (
          <li key={lot.id} className="flex items-center justify-between gap-3 border-t border-line px-4 py-3 first:border-t-0">
            <span className={lot.id === highlight ? "font-bold" : ""}>{lot.name}</span>
            <StatusBadge status={estimate?.status ?? "gray"} />
          </li>
        ))}
        {!rows.length && <li className="px-4 py-3 text-muted">Loading lots…</li>}
      </ul>
    </>
  );
}
