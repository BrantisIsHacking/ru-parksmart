"use client";
// Client-only: Leaflet touches `window` on import. LotMap loads this with ssr: false.
import "leaflet/dist/leaflet.css";
import { CircleMarker, MapContainer, TileLayer, Tooltip } from "react-leaflet";
import { STATUS_HEX, STATUS_LABEL } from "@/lib/client/format";
import type { LatLng } from "@/lib/types";
import type { LotRow } from "./LotMap";

// OpenStreetMap's free tiles suit light use. For heavy traffic, swap in a
// provider such as MapTiler or Stadia by changing TILE_URL and ATTRIBUTION.
const TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

export default function LeafletMap({ rows, highlight, center }: { rows: LotRow[]; highlight?: string | null; center: LatLng }) {
  return (
    <MapContainer center={center} zoom={14} zoomControl={false} scrollWheelZoom className="h-full w-full">
      <TileLayer url={TILE_URL} attribution={ATTRIBUTION} maxZoom={19} />
      {rows.map(({ lot, estimate }) => {
        const status = estimate?.status ?? "gray";
        const active = lot.id === highlight;
        return (
          <CircleMarker
            key={`${lot.id}-${status}-${active}`}
            center={lot.center}
            radius={active ? 13 : 10}
            pathOptions={{ color: "#ffffff", weight: 2, fillColor: STATUS_HEX[status], fillOpacity: 1 }}
          >
            <Tooltip>{`${lot.name}: ${STATUS_LABEL[status]}`}</Tooltip>
          </CircleMarker>
        );
      })}
    </MapContainer>
  );
}
