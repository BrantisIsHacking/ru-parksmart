"use client";
import dynamic from "next/dynamic";
import type { CampusMapProps } from "./CampusMap";

// Leaflet touches `window` on import, so the map only renders in the browser.
const CampusMap = dynamic(() => import("./CampusMap"), {
  ssr: false,
  loading: () => <div className="h-full w-full bg-concrete" aria-label="Loading map" />,
});

export function MapView(props: CampusMapProps) {
  // isolate keeps Leaflet's high z-index panes below the search bar and sheet.
  return (
    <div className="isolate h-full w-full">
      <CampusMap {...props} />
    </div>
  );
}
